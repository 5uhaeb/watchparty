const Room = require('../models/Room');
const { redis } = require('./redis');

const ROOM_TTL_SECONDS = 60 * 60 * 6;
const RECONNECT_GRACE_SECONDS = 60;

function presenceKey(roomCode) {
  return `room:${roomCode}:presence`;
}

function membersKey(roomCode) {
  return `room:${roomCode}:members`;
}

function guestRoomKey(guestId) {
  return `presence:${guestId}:room`;
}

function reconnectTimerKey(guestId) {
  return `presence:${guestId}:reconnectTimer`;
}

function parsePresence(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

async function refreshRoomKeys(roomCode) {
  await redis.expire(presenceKey(roomCode), ROOM_TTL_SECONDS);
  await redis.expire(membersKey(roomCode), ROOM_TTL_SECONDS);
}

async function getPresence(roomCode, guestId) {
  return parsePresence(await redis.hget(presenceKey(roomCode), guestId));
}

async function getPresenceList(roomCode) {
  const rawPresence = await redis.hgetall(presenceKey(roomCode));
  const members = [];

  for (const [guestId, value] of Object.entries(rawPresence || {})) {
    const presence = parsePresence(value);
    if (!presence) continue;
    const ttl = await redis.ttl(reconnectTimerKey(guestId));
    members.push({
      guestId,
      ...presence,
      reconnectExpiresAt:
        presence.state === 'reconnecting' && ttl > 0
          ? new Date(Date.now() + ttl * 1000).toISOString()
          : null,
    });
  }

  return members.sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime());
}

async function broadcastPresence(io, roomCode) {
  io.to(roomCode).emit('room:presence', {
    roomCode,
    members: await getPresenceList(roomCode),
  });
}

async function isMember(roomCode, guestId) {
  if (!roomCode || !guestId) return false;
  return (await redis.sismember(membersKey(roomCode), guestId)) === 1;
}

async function presenceJoin(io, roomCode, socket) {
  const guestId = socket.data?.guestId;
  if (!roomCode || !guestId) return [];

  const previous = await getPresence(roomCode, guestId);
  const wasReconnecting = (await redis.get(reconnectTimerKey(guestId))) === '1' || previous?.state === 'reconnecting';
  const now = new Date().toISOString();
  const presence = {
    socketId: socket.id,
    displayName: socket.data?.displayName || previous?.displayName || 'Guest',
    avatarHue: socket.data?.avatarHue ?? previous?.avatarHue ?? 0,
    state: 'online',
    joinedAt: previous?.joinedAt || now,
    lastSeenAt: now,
  };

  await redis.hset(presenceKey(roomCode), guestId, JSON.stringify(presence));
  await redis.sadd(membersKey(roomCode), guestId);
  await redis.set(guestRoomKey(guestId), roomCode, 'EX', ROOM_TTL_SECONDS);
  await redis.del(reconnectTimerKey(guestId));
  await refreshRoomKeys(roomCode);

  const eventName = wasReconnecting ? 'participant:back' : 'participant:joined';
  io.to(roomCode).emit(eventName, { guestId, roomCode, presence });
  await broadcastPresence(io, roomCode);
  return getPresenceList(roomCode);
}

async function applyReapRoomEffects(io, roomCode, leavingGuestId, leavingSocketId) {
  const room = await Room.findOne({ code: roomCode, isActive: true });
  if (!room) return room;

  if (room.ownerGuestId === leavingGuestId) {
    const members = await getPresenceList(roomCode);
    const admin = members.find((member) => room.adminGuestIds?.includes(member.guestId));
    const nextOwner = admin || members[0];

    if (nextOwner) {
      room.ownerGuestId = nextOwner.guestId;
      room.adminGuestIds = (room.adminGuestIds || []).filter((guestId) => guestId !== nextOwner.guestId);
    }
  }

  if (room.source?.type === 'localStream' && room.source?.hostSocketId === leavingSocketId) {
    room.source = null;
    room.playback = {
      isPlaying: false,
      currentTime: 0,
      updatedAt: new Date(),
      updatedBy: leavingGuestId,
    };
  }

  room.lastActivityAt = new Date();
  await room.save();

  io.to(roomCode).emit('room:rolesChanged', { room });
  io.to(roomCode).emit('room:state', { room });
  if (!room.source) {
    io.to(roomCode).emit('room:sourceChanged', { source: null, room });
  }

  return room;
}

async function reapPresence(io, guestId, roomCode) {
  const current = await getPresence(roomCode, guestId);
  const timer = await redis.get(reconnectTimerKey(guestId));
  if (timer || current?.state === 'online') return false;

  await redis.hdel(presenceKey(roomCode), guestId);
  await redis.srem(membersKey(roomCode), guestId);
  await redis.del(guestRoomKey(guestId));
  await redis.del(reconnectTimerKey(guestId));
  await refreshRoomKeys(roomCode);

  await applyReapRoomEffects(io, roomCode, guestId, current?.socketId);
  io.to(roomCode).emit('participant:left', { guestId, roomCode });
  await broadcastPresence(io, roomCode);
  return true;
}

function scheduleReap(io, guestId, roomCode) {
  setTimeout(async () => {
    try {
      await reapPresence(io, guestId, roomCode);
    } catch (error) {
      console.error('presence reap failed', error);
    }
  }, RECONNECT_GRACE_SECONDS * 1000 + 250);
}

async function presenceDisconnect(io, socket) {
  const guestId = socket.data?.guestId;
  if (!guestId) return;

  const roomCode = socket.roomCode || (await redis.get(guestRoomKey(guestId)));
  if (!roomCode) return;

  const current = await getPresence(roomCode, guestId);
  if (!current) return;
  if (current.socketId && current.socketId !== socket.id) return;

  const nextPresence = {
    ...current,
    state: 'reconnecting',
    lastSeenAt: new Date().toISOString(),
  };

  await redis.hset(presenceKey(roomCode), guestId, JSON.stringify(nextPresence));
  await redis.set(reconnectTimerKey(guestId), '1', 'EX', RECONNECT_GRACE_SECONDS);
  await refreshRoomKeys(roomCode);

  io.to(roomCode).emit('participant:reconnecting', { guestId, roomCode });
  await broadcastPresence(io, roomCode);
  scheduleReap(io, guestId, roomCode);
}

async function presenceLeave(io, socket) {
  const guestId = socket.data?.guestId;
  const roomCode = socket.roomCode || (guestId ? await redis.get(guestRoomKey(guestId)) : null);
  if (!guestId || !roomCode) return;

  await redis.del(reconnectTimerKey(guestId));
  await redis.hset(
    presenceKey(roomCode),
    guestId,
    JSON.stringify({
      ...(await getPresence(roomCode, guestId)),
      state: 'reconnecting',
      lastSeenAt: new Date().toISOString(),
    })
  );
  await reapPresence(io, guestId, roomCode);
}

module.exports = {
  presenceJoin,
  presenceDisconnect,
  presenceLeave,
  getPresenceList,
  isMember,
};
