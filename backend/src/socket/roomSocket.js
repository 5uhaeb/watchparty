const Message = require('../models/Message');
const Room = require('../models/Room');
const { verifyExtensionToken } = require('../lib/extensionToken');

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

function canControlRoom(room, userId) {
  if (!room || !userId) return false;

  const participant = room.participants?.some(
    (p) => p.userId === userId || p.name === userId
  );

  return participant || room.hostUserId === userId;
}

function isRoomMember(room, userId) {
  if (!room || !userId) return false;
  return (
    room.hostUserId === userId ||
    room.participants?.some((p) => p.userId === userId || p.name === userId)
  );
}

function isValidLocalStreamFileName(fileName) {
  return typeof fileName === 'string' && fileName.trim() && !/[/\\:]/.test(fileName);
}

function emitSourceChanged(io, roomCode, room, source = { type: room.sourceType, data: room.sourceData }) {
  io.to(roomCode).emit('room:state', { room });
  io.to(roomCode).emit('source:changed', { source, room });
  io.to(roomCode).emit('room:sourceChanged', { source, room });
}

async function clearLocalStreamIfHostedBy(io, roomCode, socketId, updatedBy = 'unknown') {
  if (!roomCode || !socketId) return null;

  const room = await Room.findOne({ code: roomCode, isActive: true });
  if (
    !room ||
    room.sourceType !== 'localStream' ||
    room.sourceData?.hostSocketId !== socketId
  ) {
    return room;
  }

  room.sourceType = 'youtube';
  room.sourceData = {};
  room.playback = {
    isPlaying: false,
    currentTime: 0,
    updatedAt: new Date(),
    updatedBy,
  };
  await room.save();
  emitSourceChanged(io, roomCode, room, null);
  return room;
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
    source: {
      type: room.sourceType,
      data: room.sourceData,
    },
    positionSec: getCompensatedPosition(playback),
    isPlaying: !!playback.isPlaying,
    hostUserId: room.hostUserId,
    serverTs: Date.now(),
  };
}

function registerRoomSocket(io, socket) {
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

    const room = await Room.findOneAndUpdate(
      { code: roomCode, isActive: true },
      {
        $addToSet: {
          participants: {
            userId: guestId,
            name: displayName,
          },
        },
      },
      { new: true }
    );

    if (!room) return;

    socket.isHost = room.hostUserId === guestId;

    const messages = await Message.find({ roomId: room._id })
      .sort({ createdAt: -1, _id: -1 })
      .limit(50);

    // full state only to the user who joined
    socket.emit('room:state', { room });
    socket.emit('chat:history', messages.reverse().map(serializeMessage));

    // lightweight participant update + system message to everyone else
    socket.to(roomCode).emit('room:state', {
      room,
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

    const room = await Room.findOneAndUpdate(
      { code: roomCode, isActive: true },
      {
        $addToSet: {
          participants: {
            userId: claims.sub,
            name: claims.name || claims.sub,
          },
        },
      },
      { new: true }
    );

    if (!room) {
      socket.emit('extension:error', { message: 'Room not found' });
      return;
    }

    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.userData = { id: claims.sub, name: claims.name || claims.sub };
    socket.emit('extension:joined', { roomCode, userId: claims.sub });
  });

  socket.on('player:play', async ({ roomCode, userId, positionSec }) => {
    if (!consumeBucket(socket, 'player', 10, 5 * 1000)) return;
    const targetRoomCode = getRoomCode(socket, roomCode);
    const actorUserId = getUserId(socket, userId);
    const room = await Room.findOne({ code: targetRoomCode });
    if (!canControlRoom(room, actorUserId)) return;

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
    if (!canControlRoom(room, actorUserId)) return;

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
    if (!canControlRoom(room, actorUserId)) return;

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
    if (!room || room.hostUserId !== actorUserId) return;

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

  socket.on('source:change', async ({ roomCode, userId, sourceType, sourceData = {} }) => {
    const targetRoomCode = getRoomCode(socket, roomCode);
    const actorUserId = getUserId(socket, userId);
    if (!['youtube', 'local', 'localStream', 'ott-sync'].includes(sourceType)) return;
    if (sourceData.fileName && !isValidLocalStreamFileName(sourceData.fileName)) return;

    const room = await Room.findOne({ code: targetRoomCode, isActive: true });
    if (!room || room.hostUserId !== actorUserId) return;

    room.sourceType = sourceType;
    room.sourceData = sourceData;
    room.playback = {
      isPlaying: false,
      currentTime: 0,
      updatedAt: new Date(),
      updatedBy: actorUserId || 'unknown',
    };
    await room.save();

    emitSourceChanged(io, targetRoomCode, room);
  });

  socket.on('room:startLocalStream', async ({ fileName, sizeBytes, durationSec }) => {
    const targetRoomCode = socket.roomCode;
    if (!targetRoomCode) return;

    if (!isValidLocalStreamFileName(fileName)) {
      socket.emit('error:validation', { message: 'Invalid fileName' });
      return;
    }

    const room = await Room.findOne({ code: targetRoomCode, isActive: true });
    if (!room) return;

    const actorUserId = getUserId(socket);
    if (room.hostUserId !== actorUserId) return;

    room.sourceType = 'localStream';
    room.sourceData = {
      fileName: fileName.trim(),
      sizeBytes: Number(sizeBytes) || 0,
      durationSec: Number(durationSec) || 0,
      hostSocketId: socket.id,
    };
    room.playback = {
      isPlaying: false,
      currentTime: 0,
      updatedAt: new Date(),
      updatedBy: actorUserId || 'unknown',
    };
    await room.save();

    emitSourceChanged(io, targetRoomCode, room);
  });

  socket.on('room:stopLocalStream', async () => {
    const targetRoomCode = socket.roomCode;
    if (!targetRoomCode) return;

    const room = await Room.findOne({ code: targetRoomCode, isActive: true });
    if (!room) return;

    const actorUserId = getUserId(socket);
    if (room.hostUserId !== actorUserId) return;
    if (room.sourceType !== 'localStream') return;

    room.sourceType = 'youtube';
    room.sourceData = {};
    room.playback = {
      isPlaying: false,
      currentTime: 0,
      updatedAt: new Date(),
      updatedBy: actorUserId || 'unknown',
    };
    await room.save();

    emitSourceChanged(io, targetRoomCode, room, null);
  });

  socket.on('webrtc:viewerReady', async () => {
    const targetRoomCode = socket.roomCode;
    if (!targetRoomCode) return;

    const room = await Room.findOne({ code: targetRoomCode, isActive: true });
    const actorUserId = getUserId(socket);
    if (!room || !isRoomMember(room, actorUserId)) return;
    if (room.sourceType !== 'localStream' || !room.sourceData?.hostSocketId) return;
    if (room.sourceData.hostSocketId === socket.id) return;

    io.to(room.sourceData.hostSocketId).emit('webrtc:viewerReady', {
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
    if (!room || !isRoomMember(room, actorUserId)) return;
    if (room.sourceType !== 'localStream') return;

    io.to(toSocketId).emit('webrtc:signal', {
      fromSocketId: socket.id,
      data,
    });
  });


  // anyone in the room can drive sync now
  socket.on('playback:update', async ({ roomCode, playback, userId }) => {
    const room = await Room.findOne({ code: roomCode });
    if (!room) return;

    const participant = room.participants?.some(
      (p) => p.userId === userId || p.name === userId
    );

    const isHost = room.hostUserId === userId;

    if (!participant && !isHost) return;

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
    if (!room || room.hostUserId !== hostUserId) return;

    const socketsInRoom = await io.in(roomCode).fetchSockets();

    for (const s of socketsInRoom) {
      if (s.userData?.name === targetName && s.id !== socket.id) {
        s.emit('room:kicked', {
          reason: 'You were removed by the host.',
        });
        s.leave(roomCode);
        break;
      }
    }

    const updatedRoom = await Room.findOneAndUpdate(
      { code: roomCode },
      { $pull: { participants: { name: targetName } } },
      { new: true }
    );

    if (updatedRoom) {
      io.to(roomCode).emit('room:state', {
        room: updatedRoom,
        systemMessage: `${targetName} was removed by the host.`,
      });
    }
  });

  socket.on('call:join', ({ roomCode, userId, name }) => {
    socket.callUserId = userId;
    socket.callName = name;
    socket.to(roomCode).emit('call:user-joined', { userId, name });
  });

  socket.on('call:signal', ({ to, from, signal }) => {
    const socketsMap = io.sockets.sockets;

    for (const [, s] of socketsMap) {
      if (s.callUserId === to && s.roomCode === socket.roomCode) {
        s.emit('call:signal', { from, signal });
        break;
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
    await clearLocalStreamIfHostedBy(io, roomCode, socket.id, getUserId(socket) || 'unknown');
    socket.leave(roomCode);
    socket.roomCode = null;

    const room = await Room.findOneAndUpdate(
      { code: roomCode },
      { $pull: { participants: { name: userData.name } } },
      { new: true }
    );

    if (room) {
      io.to(roomCode).emit('room:state', {
        room,
        systemMessage: `${userData.name} left the room`,
      });
    }
  });

  socket.on('room:end', async ({ roomCode, userId } = {}) => {
    const targetRoomCode = getRoomCode(socket, roomCode);
    const actorUserId = getUserId(socket, userId);
    const room = await Room.findOne({ code: targetRoomCode, isActive: true });
    if (!room || room.hostUserId !== actorUserId) return;

    room.isActive = false;
    await room.save();

    io.to(targetRoomCode).emit('room:ended', {
      roomCode: targetRoomCode,
      byUserId: actorUserId,
    });
  });

  socket.on('disconnect', async () => {
    if (!socket.roomCode || !socket.userData) return;

    const { roomCode, userData } = socket;
    if (socket.callUserId) {
      socket.to(roomCode).emit('call:user-left', {
        userId: socket.callUserId,
      });
    }

    await clearLocalStreamIfHostedBy(io, roomCode, socket.id, getUserId(socket) || 'unknown');

    const room = await Room.findOneAndUpdate(
      { code: roomCode },
      { $pull: { participants: { name: userData.name } } },
      { new: true }
    );

    if (room) {
      io.to(roomCode).emit('room:state', {
        room,
        systemMessage: `${userData.name} left the room`,
      });
    }
  });
}

module.exports = registerRoomSocket;
