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
  return userId || socket.userData?.id || socket.userData?.name;
}

function canControlRoom(room, userId) {
  if (!room || !userId) return false;

  const participant = room.participants?.some(
    (p) => p.userId === userId || p.name === userId
  );

  return participant || room.hostUserId === userId;
}

function registerRoomSocket(io, socket) {
  socket.on('room:join', async ({ roomCode, user }) => {
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.userData = user;

    const room = await Room.findOneAndUpdate(
      { code: roomCode, isActive: true },
      {
        $addToSet: {
          participants: {
            userId: user.id || user.name,
            name: user.name,
          },
        },
      },
      { new: true }
    );

    if (!room) return;

    socket.isHost = room.hostUserId === (user.id || user.name);

    const messages = await Message.find({ roomId: room._id })
      .sort({ createdAt: -1, _id: -1 })
      .limit(50);

    // full state only to the user who joined
    socket.emit('room:state', { room });
    socket.emit('chat:history', messages.reverse().map(serializeMessage));

    // lightweight participant update + system message to everyone else
    socket.to(roomCode).emit('room:state', {
      room,
      systemMessage: `${user.name} joined the room`,
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
    if (!text) return;

    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 500) return;

    const targetRoomCode = roomCode || socket.roomCode;
    if (!targetRoomCode) return;

    const room = await Room.findOne({ code: targetRoomCode, isActive: true });
    if (!room) return;

    const userId = socket.userData?.id || userName;
    const username = socket.userData?.name || userName;

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

  socket.on('room:kick', async ({ roomCode, targetName, hostUserId }) => {
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

  socket.on('disconnect', async () => {
    if (!socket.roomCode || !socket.userData) return;

    const { roomCode, userData } = socket;

    if (socket.callUserId) {
      socket.to(roomCode).emit('call:user-left', {
        userId: socket.callUserId,
      });
    }

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
