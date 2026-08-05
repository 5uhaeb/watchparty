const Room = require('../models/Room');

const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const RECONNECT_GRACE_MS = 60 * 1000;

const roomPresence = new Map();
const guestRooms = new Map();
const reconnectDeadlines = new Map();
const roomLastTouched = new Map();

function touchRoom(roomCode) {
  roomLastTouched.set(roomCode, Date.now());
}

function getRoomPresence(roomCode, create = false) {
  let members = roomPresence.get(roomCode);
  if (!members && create) {
    members = new Map();
    roomPresence.set(roomCode, members);
  }
  if (members) touchRoom(roomCode);
  return members;
}

function getPresence(roomCode, guestId) {
  return getRoomPresence(roomCode)?.get(guestId) || null;
}

async function getPresenceList(roomCode) {
  const members = getRoomPresence(roomCode);
  if (!members) return [];

  return [...members.entries()]
    .map(([guestId, presence]) => {
      const deadline = reconnectDeadlines.get(guestId);
      return {
        guestId,
        ...presence,
        reconnectExpiresAt:
          presence.state === 'reconnecting' && deadline > Date.now()
            ? new Date(deadline).toISOString()
            : null,
      };
    })
    .sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime());
}

async function broadcastPresence(io, roomCode) {
  io.to(roomCode).emit('room:presence', {
    roomCode,
    members: await getPresenceList(roomCode),
  });
}

async function isMember(roomCode, guestId) {
  return !!(roomCode && guestId && getRoomPresence(roomCode)?.has(guestId));
}

async function presenceJoin(io, roomCode, socket) {
  const guestId = socket.data?.guestId;
  if (!roomCode || !guestId) return [];

  const members = getRoomPresence(roomCode, true);
  const previous = members.get(guestId);
  const wasReconnecting = reconnectDeadlines.has(guestId) || previous?.state === 'reconnecting';
  const now = new Date().toISOString();
  const presence = {
    socketId: socket.id,
    displayName: socket.data?.displayName || previous?.displayName || 'Guest',
    avatarHue: socket.data?.avatarHue ?? previous?.avatarHue ?? 0,
    state: 'online',
    joinedAt: previous?.joinedAt || now,
    lastSeenAt: now,
  };

  members.set(guestId, presence);
  guestRooms.set(guestId, roomCode);
  reconnectDeadlines.delete(guestId);
  touchRoom(roomCode);

  io.to(roomCode).emit(wasReconnecting ? 'participant:back' : 'participant:joined', {
    guestId,
    roomCode,
    presence,
  });
  await broadcastPresence(io, roomCode);
  return getPresenceList(roomCode);
}

async function updatePresenceName(io, socket, displayName) {
  const guestId = socket.data?.guestId;
  const roomCode = socket.roomCode;
  if (!guestId || !roomCode || !displayName) return;

  const members = getRoomPresence(roomCode, true);
  const current = members.get(guestId);
  const nextPresence = {
    ...(current || {}),
    socketId: socket.id,
    displayName,
    avatarHue: socket.data?.avatarHue ?? current?.avatarHue ?? 0,
    state: current?.state || 'online',
    joinedAt: current?.joinedAt || new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  };
  members.set(guestId, nextPresence);
  touchRoom(roomCode);

  io.to(roomCode).emit('participant:updated', { guestId, roomCode, displayName, presence: nextPresence });
  await broadcastPresence(io, roomCode);
}

async function getCallMembers(io, roomCode, selfSocketId) {
  const sockets = await io.in(roomCode).fetchSockets();
  return sockets
    .filter((roomSocket) => (
      roomSocket.id !== selfSocketId &&
      (roomSocket.callUserId || roomSocket.data?.callUserId) &&
      (!(roomSocket.callRoomCode || roomSocket.data?.callRoomCode) ||
        (roomSocket.callRoomCode || roomSocket.data?.callRoomCode) === roomCode)
    ))
    .map((roomSocket) => ({
      socketId: roomSocket.id,
      userId: roomSocket.callUserId || roomSocket.data?.callUserId,
      name: roomSocket.callName || roomSocket.data?.callName || roomSocket.data?.displayName || roomSocket.callUserId || roomSocket.data?.callUserId,
    }));
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
    room.playback = { isPlaying: false, currentTime: 0, updatedAt: new Date(), updatedBy: leavingGuestId };
  }

  room.lastActivityAt = new Date();
  await room.save();
  io.to(roomCode).emit('room:rolesChanged', { room });
  io.to(roomCode).emit('room:state', { room });
  if (!room.source) io.to(roomCode).emit('room:sourceChanged', { source: null, room });
  return room;
}

async function reapPresence(io, guestId, roomCode) {
  const members = getRoomPresence(roomCode);
  const current = members?.get(guestId);
  const deadline = reconnectDeadlines.get(guestId);
  if ((deadline && deadline > Date.now()) || current?.state === 'online') return false;

  members?.delete(guestId);
  guestRooms.delete(guestId);
  reconnectDeadlines.delete(guestId);
  if (members?.size === 0) {
    roomPresence.delete(roomCode);
    roomLastTouched.delete(roomCode);
  }

  await applyReapRoomEffects(io, roomCode, guestId, current?.socketId);
  io.to(roomCode).emit('participant:left', { guestId, roomCode });
  await broadcastPresence(io, roomCode);
  return true;
}

function scheduleReap(io, guestId, roomCode) {
  const timer = setTimeout(() => {
    reapPresence(io, guestId, roomCode).catch((error) => console.error('presence reap failed', error));
  }, RECONNECT_GRACE_MS + 250);
  timer.unref?.();
}

async function presenceDisconnect(io, socket) {
  const guestId = socket.data?.guestId;
  if (!guestId) return;
  const roomCode = socket.roomCode || guestRooms.get(guestId);
  if (!roomCode) return;

  const members = getRoomPresence(roomCode);
  const current = members?.get(guestId);
  if (!current || (current.socketId && current.socketId !== socket.id)) return;

  members.set(guestId, { ...current, state: 'reconnecting', lastSeenAt: new Date().toISOString() });
  reconnectDeadlines.set(guestId, Date.now() + RECONNECT_GRACE_MS);
  touchRoom(roomCode);
  io.to(roomCode).emit('participant:reconnecting', { guestId, roomCode });
  await broadcastPresence(io, roomCode);
  scheduleReap(io, guestId, roomCode);
}

async function presenceLeave(io, socket) {
  const guestId = socket.data?.guestId;
  const roomCode = socket.roomCode || (guestId ? guestRooms.get(guestId) : null);
  if (!guestId || !roomCode) return;

  const members = getRoomPresence(roomCode);
  const current = members?.get(guestId);
  if (current) {
    members.set(guestId, { ...current, state: 'reconnecting', lastSeenAt: new Date().toISOString() });
  }
  reconnectDeadlines.delete(guestId);
  await reapPresence(io, guestId, roomCode);
}

const cleanupTimer = setInterval(() => {
  const cutoff = Date.now() - ROOM_TTL_MS;
  for (const [roomCode, touchedAt] of roomLastTouched) {
    if (touchedAt >= cutoff) continue;
    const members = roomPresence.get(roomCode);
    for (const guestId of members?.keys() || []) {
      guestRooms.delete(guestId);
      reconnectDeadlines.delete(guestId);
    }
    roomPresence.delete(roomCode);
    roomLastTouched.delete(roomCode);
  }
}, 15 * 60 * 1000);
cleanupTimer.unref?.();

module.exports = {
  presenceJoin,
  presenceDisconnect,
  presenceLeave,
  getPresenceList,
  isMember,
  updatePresenceName,
  getCallMembers,
};
