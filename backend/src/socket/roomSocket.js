const Message = require('../models/Message');
const Room = require('../models/Room');
const { verifyExtensionToken } = require('../lib/extensionToken');
const {
  presenceJoin,
  presenceDisconnect,
  presenceLeave,
  isMember,
  updatePresenceName,
  getCallMembers,
} = require('../lib/presence');

function serializeMessage(message) {
  return {
    id: message._id,
    _id: message._id,
    roomId: message.roomId,
    userId: message.userId,
    username: message.username,
    userName: message.username,
    text: message.text,
    type: message.type,
    createdAt: message.createdAt,
  };
}

function getRoomCode(socket, roomCode) {
  return roomCode || socket.roomCode;
}

function getUserId(socket, userId) {
  return socket.data?.guestId || userId || socket.userData?.id || socket.userData?.name;
}

function isOwnerOrAdmin(room, userId) {
  return !!userId && (
    room.ownerGuestId === userId ||
    room.adminGuestIds?.includes(userId)
  );
}

function can(room, userId, permission) {
  if (!room || !userId) return false;
  if (isOwnerOrAdmin(room, userId)) return true;
  return room.permissions?.[permission] === 'all';
}

async function isRoomMember(room, userId) {
  if (!room || !userId) return false;
  return (
    isOwnerOrAdmin(room, userId) ||
    (await isMember(room.code, userId))
  );
}

function isValidLocalStreamFileName(fileName) {
  return typeof fileName === 'string' && fileName.trim() && !/[/\\:]/.test(fileName);
}

function extractYouTubeVideoId(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || null;
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      return url.searchParams.get('v') || null;
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeSource(payload, socket) {
  if (!payload || payload.type === 'clear') return null;

  if (payload.type === 'youtube') {
    const url = typeof payload.url === 'string' ? payload.url.trim() : '';
    const videoId = extractYouTubeVideoId(url);
    if (!videoId) throw new Error('Enter a valid YouTube URL');
    return { type: 'youtube', url, videoId };
  }

  if (payload.type === 'localStream') {
    if (!isValidLocalStreamFileName(payload.fileName)) {
      throw new Error('fileName must not contain path separators');
    }
    return {
      type: 'localStream',
      fileName: payload.fileName.trim(),
      sizeBytes: Number(payload.sizeBytes) || 0,
      durationSec: Number(payload.durationSec) || 0,
      hostSocketId: socket.id,
      hostGuestId: socket.data?.guestId,
    };
  }

  throw new Error('Unsupported source type');
}

function emitSourceChanged(io, roomCode, room, source = room.source || null) {
  io.to(roomCode).emit('room:state', { room });
  io.to(roomCode).emit('source:changed', { source, room });
  io.to(roomCode).emit('room:sourceChanged', { source, room });
}

function consumeBucket(socket, name, capacity, refillMs) {
  socket.rateBuckets ||= {};
  const now = Date.now();
  const bucket = socket.rateBuckets[name] || { tokens: capacity, resetAt: now + refillMs };

  if (now >= bucket.resetAt) {
    bucket.tokens = capacity;
    bucket.resetAt = now + refillMs;
  }

  if (bucket.tokens <= 0) {
    socket.rateBuckets[name] = bucket;
    socket.emit('rate:limited', {
      scope: name,
      retryAfterMs: Math.max(0, bucket.resetAt - now),
    });
    return false;
  }

  bucket.tokens -= 1;
  socket.rateBuckets[name] = bucket;
  return true;
}

async function emitChatHistory(socket, roomCode) {
  const targetRoomCode = roomCode || socket.roomCode;
  if (!targetRoomCode) return;

  const room = await Room.findOne({ code: targetRoomCode, isActive: true });
  if (!room) return;

  const messages = await Message.find({ roomId: room._id })
    .sort({ createdAt: -1, _id: -1 })
    .limit(50);

  socket.emit('chat:history', messages.reverse().map(serializeMessage));
}

function getCompensatedPosition(playback = {}) {
  let positionSec = Number(playback.currentTime || 0);
  if (playback.isPlaying && playback.updatedAt) {
    const elapsed = (Date.now() - new Date(playback.updatedAt).getTime()) / 1000;
    positionSec = Math.max(0, positionSec + elapsed);
  }
  return positionSec;
}

function serializePlayerState(room) {
  const playback = room.playback || {};
  return {
    source: room.source || null,
    positionSec: getCompensatedPosition(playback),
    isPlaying: !!playback.isPlaying,
    hostUserId: room.ownerGuestId,
    serverTs: Date.now(),
  };
}

function registerRoomSocket(io, socket) {
  socket.on('guest:nameChanged', async ({ displayName } = {}) => {
    const name = typeof displayName === 'string' ? displayName.trim() : '';
    if (name.length < 2 || name.length > 24) return;

    socket.data.displayName = name;
    if (socket.userData) socket.userData.name = name;
    if (socket.callUserId) socket.callName = name;

    await updatePresenceName(io, socket, name);
    if (socket.roomCode) {
      io.to(socket.roomCode).emit('guest:nameChanged', {
        guestId: socket.data?.guestId,
        displayName: name,
      });
    }
  });

  socket.on('user:join', ({ userId }) => {
    const guestId = socket.data?.guestId || userId;
    if (!guestId) return;
    socket.userId = guestId;
    socket.join(`user:${guestId}`);
  });

  socket.on('room:join', async ({ roomCode, user = {} }) => {
    const guestId = socket.data?.guestId || user.id || user.name;
    const displayName = socket.data?.displayName || user.name || 'Guest';

    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.userData = { id: guestId, name: displayName };
    socket.userId = guestId;
    socket.join(`user:${guestId}`);

    const room = await Room.findOne({ code: roomCode, isActive: true });

    if (!room) return;

    socket.isHost = room.ownerGuestId === guestId;
    const presence = await presenceJoin(io, roomCode, socket);
    const roomState = { ...room.toObject(), participants: presence };

    const messages = await Message.find({ roomId: room._id })
      .sort({ createdAt: -1, _id: -1 })
      .limit(50);

    // full state only to the user who joined
    socket.emit('room:state', { room: roomState });
    socket.emit('chat:history', messages.reverse().map(serializeMessage));

    // lightweight participant update + system message to everyone else
    socket.to(roomCode).emit('room:state', {
      room: roomState,
      systemMessage: `${displayName} joined the room`,
    });

    const pb = room.playback || {};
    let currentTime = pb.currentTime || 0;

    if (pb.isPlaying && pb.updatedAt) {
      const elapsed =
        (Date.now() - new Date(pb.updatedAt).getTime()) / 1000;
      currentTime = Math.max(0, currentTime + elapsed);
    }

    socket.emit('reconnect:sync', {
      isPlaying: !!pb.isPlaying,
      currentTime,
      atServerTs: Date.now(),
    });
  });

  socket.on('chat:send', async ({ roomCode, userName, text }) => {
    if (!consumeBucket(socket, 'chat', 5, 10 * 1000)) return;
    if (!text) return;

    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 500) return;

    const targetRoomCode = roomCode || socket.roomCode;
    if (!targetRoomCode) return;

    const room = await Room.findOne({ code: targetRoomCode, isActive: true });
    if (!room) return;

    const userId = socket.data?.guestId || socket.userData?.id || userName;
    const username = socket.data?.displayName || socket.userData?.name || userName;

    const saved = await Message.create({
      roomId: room._id,
      userId,
      username,
      text: trimmed,
      type: 'chat',
    });

    io.to(targetRoomCode).emit('chat:new', {
      ...serializeMessage(saved),
    });
  });

  socket.on('chat:history', async ({ roomCode } = {}) => {
    await emitChatHistory(socket, roomCode);
  });

  socket.on('extension:join', async ({ roomCode, token }) => {
    let claims;
    try {
      claims = verifyExtensionToken(token);
    } catch (error) {
      socket.emit('extension:error', { message: error.message });
      return;
    }

    if (!claims) {
      socket.emit('extension:error', { message: 'Invalid or expired extension token' });
      return;
    }

    const room = await Room.findOne({ code: roomCode, isActive: true });

    if (!room) {
      socket.emit('extension:error', { message: 'Room not found' });
      return;
    }

    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.userData = { id: claims.sub, name: claims.name || claims.sub };
    socket.data.guestId = claims.sub;
    socket.data.displayName = claims.name || claims.sub;
    await presenceJoin(io, roomCode, socket);
    socket.emit('extension:joined', { roomCode, userId: claims.sub });
  });

  socket.on('player:play', async ({ roomCode, userId, positionSec }) => {
    if (!consumeBucket(socket, 'player', 10, 5 * 1000)) return;
    const targetRoomCode = getRoomCode(socket, roomCode);
    const actorUserId = getUserId(socket, userId);
    const room = await Room.findOne({ code: targetRoomCode });
    if (!can(room, actorUserId, 'controlPlayback')) return;

    const atServerTs = Date.now();
    const payload = {
      positionSec: Number(positionSec || 0),
      atServerTs,
    };

    await Room.findOneAndUpdate(
      { code: targetRoomCode },
      {
        playback: {
          isPlaying: true,
          currentTime: payload.positionSec,
          updatedAt: new Date(atServerTs),
          updatedBy: actorUserId || 'unknown',
        },
      }
    );

    socket.to(targetRoomCode).emit('player:play', payload);
  });

  socket.on('player:pause', async ({ roomCode, userId, positionSec }) => {
    if (!consumeBucket(socket, 'player', 10, 5 * 1000)) return;
    const targetRoomCode = getRoomCode(socket, roomCode);
    const actorUserId = getUserId(socket, userId);
    const room = await Room.findOne({ code: targetRoomCode });
    if (!can(room, actorUserId, 'controlPlayback')) return;

    const atServerTs = Date.now();
    const payload = {
      positionSec: Number(positionSec || 0),
      atServerTs,
    };

    await Room.findOneAndUpdate(
      { code: targetRoomCode },
      {
        playback: {
          isPlaying: false,
          currentTime: payload.positionSec,
          updatedAt: new Date(atServerTs),
          updatedBy: actorUserId || 'unknown',
        },
      }
    );

    socket.to(targetRoomCode).emit('player:pause', payload);
  });

  socket.on('player:seek', async ({ roomCode, userId, positionSec }) => {
    if (!consumeBucket(socket, 'player', 10, 5 * 1000)) return;
    const targetRoomCode = getRoomCode(socket, roomCode);
    const actorUserId = getUserId(socket, userId);
    const room = await Room.findOne({ code: targetRoomCode });
    if (!can(room, actorUserId, 'controlPlayback')) return;

    const atServerTs = Date.now();
    const nextPosition = Number(positionSec || 0);

    await Room.findOneAndUpdate(
      { code: targetRoomCode },
      {
        $set: {
          'playback.currentTime': nextPosition,
          'playback.updatedAt': new Date(atServerTs),
          'playback.updatedBy': actorUserId || 'unknown',
        },
      }
    );

    socket.to(targetRoomCode).emit('player:seek', {
      positionSec: nextPosition,
      atServerTs,
    });
  });

  socket.on('player:heartbeat', async ({ roomCode, positionSec }) => {
    if (!consumeBucket(socket, 'player', 10, 5 * 1000)) return;
    const targetRoomCode = getRoomCode(socket, roomCode);
    const actorUserId = getUserId(socket);
    const room = await Room.findOne({ code: targetRoomCode });
    if (!can(room, actorUserId, 'controlPlayback')) return;

    const atServerTs = Date.now();
    const nextPosition = Number(positionSec || 0);

    await Room.findOneAndUpdate(
      { code: targetRoomCode },
      {
        $set: {
          'playback.currentTime': nextPosition,
          'playback.updatedAt': new Date(atServerTs),
          'playback.updatedBy': actorUserId || 'unknown',
        },
      }
    );

    socket.to(targetRoomCode).emit('player:heartbeat', {
      positionSec: nextPosition,
      atServerTs,
    });
  });

  socket.on('player:state', async ({ roomCode } = {}, callback) => {
    if (!consumeBucket(socket, 'player', 10, 5 * 1000)) return;

    const targetRoomCode = getRoomCode(socket, roomCode);
    if (!targetRoomCode) return;

    const room = await Room.findOne({ code: targetRoomCode, isActive: true });
    if (!room) return;

    const payload = serializePlayerState(room);
    if (typeof callback === 'function') {
      callback(payload);
      return;
    }
    socket.emit('player:state', payload);
  });

  socket.on('room:setSource', async (payload = {}) => {
    const targetRoomCode = socket.roomCode;
    if (!targetRoomCode) return;

    const room = await Room.findOne({ code: targetRoomCode, isActive: true });
    if (!room) return;

    const actorUserId = getUserId(socket);
    if (!can(room, actorUserId, 'changeSource')) {
      socket.emit('error:validation', { message: 'You do not have permission to change the source.' });
      return;
    }

    let source;
    try {
      source = normalizeSource(payload, socket);
    } catch (error) {
      socket.emit('error:validation', { message: error.message });
      return;
    }

    room.source = source;
    room.playback = {
      isPlaying: false,
      currentTime: 0,
      updatedAt: new Date(),
      updatedBy: actorUserId || 'unknown',
    };
    room.lastActivityAt = new Date();
    await room.save();

    emitSourceChanged(io, targetRoomCode, room, source);
  });

  socket.on('room:stopLocalStream', async () => {
    const targetRoomCode = socket.roomCode;
    if (!targetRoomCode) return;

    const room = await Room.findOne({ code: targetRoomCode, isActive: true });
    if (!room) return;

    const actorUserId = getUserId(socket);
    if (!can(room, actorUserId, 'changeSource')) return;
    if (room.source?.type !== 'localStream') return;

    room.source = null;
    room.playback = {
      isPlaying: false,
      currentTime: 0,
      updatedAt: new Date(),
      updatedBy: actorUserId || 'unknown',
    };
    room.lastActivityAt = new Date();
    await room.save();

    emitSourceChanged(io, targetRoomCode, room, null);
  });

  socket.on('webrtc:viewerReady', async () => {
    const targetRoomCode = socket.roomCode;
    if (!targetRoomCode) return;

    const room = await Room.findOne({ code: targetRoomCode, isActive: true });
    const actorUserId = getUserId(socket);
    if (!room || !(await isRoomMember(room, actorUserId))) return;
    if (room.source?.type !== 'localStream' || !room.source?.hostSocketId) return;
    if (room.source.hostSocketId === socket.id) return;

    io.to(room.source.hostSocketId).emit('webrtc:viewerReady', {
      viewerSocketId: socket.id,
    });
  });

  socket.on('webrtc:signal', async ({ toSocketId, data }) => {
    if (!toSocketId || !data) return;
    const targetRoomCode = socket.roomCode;
    if (!targetRoomCode) return;

    const targetSocket = io.sockets.sockets.get(toSocketId);
    if (!targetSocket || targetSocket.roomCode !== targetRoomCode) return;

    const room = await Room.findOne({ code: targetRoomCode, isActive: true });
    const actorUserId = getUserId(socket);
    if (!room || !(await isRoomMember(room, actorUserId))) return;
    if (room.source?.type !== 'localStream') return;

    io.to(toSocketId).emit('webrtc:signal', {
      fromSocketId: socket.id,
      data,
    });
  });


  // anyone in the room can drive sync now
  socket.on('playback:update', async ({ roomCode, playback, userId }) => {
    const room = await Room.findOne({ code: roomCode });
    if (!room) return;

    const isHost = isOwnerOrAdmin(room, userId);
    if (!isHost && room.permissions?.controlPlayback !== 'all') return;

    const nextPlayback = {
      isPlaying: !!playback?.isPlaying,
      currentTime: Number(playback?.currentTime || 0),
      updatedAt: new Date(),
      updatedBy: userId || 'unknown',
    };

    await Room.findOneAndUpdate(
      { code: roomCode },
      { playback: nextPlayback }
    );

    socket.to(roomCode).emit('playback:update', {
      ...nextPlayback,
      atServerTs: Date.now(),
    });
  });

  socket.on('room:kick', async ({ roomCode, targetName }) => {
    const hostUserId = getUserId(socket);
    const room = await Room.findOne({ code: roomCode });
    if (!room || !isOwnerOrAdmin(room, hostUserId)) return;

    const socketsInRoom = await io.in(roomCode).fetchSockets();

    for (const s of socketsInRoom) {
      if (s.userData?.name === targetName && s.id !== socket.id) {
        s.emit('room:kicked', {
          reason: 'You were removed by the host.',
        });
        await presenceLeave(io, s);
        s.leave(roomCode);
        break;
      }
    }

    const updatedRoom = await Room.findOne({ code: roomCode });
    if (updatedRoom) {
      io.to(roomCode).emit('room:state', { room: updatedRoom });
    }
  });

  socket.on('call:join', async ({ roomCode, userId, name }) => {
    socket.callUserId = userId;
    socket.callName = socket.data?.displayName || name || userId;
    socket.join(roomCode);
    socket.roomCode ||= roomCode;

    const members = await getCallMembers(io, roomCode, socket.id);
    if (members.length >= 10) {
      socket.emit('call:full', { limit: 10 });
      socket.callUserId = null;
      socket.callName = null;
      return;
    }

    socket.emit('call:members', { members });
    socket.to(roomCode).emit('call:user-joined', { socketId: socket.id, userId, name: socket.callName });
  });

  socket.on('call:signal', ({ to, from, signal }) => {
    const target = io.sockets.sockets.get(to);
    if (target && target.roomCode === socket.roomCode) {
      target.emit('call:signal', {
        fromSocketId: socket.id,
        fromUserId: from || socket.callUserId,
        fromName: socket.callName,
        signal
      });
      return;
    }

    for (const [, roomSocket] of io.sockets.sockets) {
      if (roomSocket.callUserId === to && roomSocket.roomCode === socket.roomCode) {
        roomSocket.emit('call:signal', {
          fromSocketId: socket.id,
          fromUserId: from || socket.callUserId,
          fromName: socket.callName,
          signal
        });
        return;
      }
    }
  });

  socket.on('call:leave', ({ roomCode, userId }) => {
    socket.to(roomCode).emit('call:user-left', { userId });
    socket.callUserId = null;
  });

  socket.on('room:leave', async () => {
    if (!socket.roomCode || !socket.userData) return;

    const { roomCode, userData } = socket;
    await presenceLeave(io, socket);
    socket.leave(roomCode);
    socket.roomCode = null;
    io.to(roomCode).emit('room:state', {
      room: await Room.findOne({ code: roomCode }),
      systemMessage: `${userData.name} left the room`,
    });
  });

  socket.on('room:end', async ({ roomCode, userId } = {}) => {
    const targetRoomCode = getRoomCode(socket, roomCode);
    const actorUserId = getUserId(socket, userId);
    const room = await Room.findOne({ code: targetRoomCode, isActive: true });
    if (!room || !isOwnerOrAdmin(room, actorUserId)) return;

    room.isActive = false;
    await room.save();

    io.to(targetRoomCode).emit('room:ended', {
      roomCode: targetRoomCode,
      byUserId: actorUserId,
    });
  });

  socket.on('disconnect', async () => {
    if (!socket.roomCode || !socket.userData) return;

    const { roomCode } = socket;
    if (socket.callUserId) {
      socket.to(roomCode).emit('call:user-left', {
        userId: socket.callUserId,
      });
    }

    await presenceDisconnect(io, socket);
  });
}

module.exports = registerRoomSocket;
