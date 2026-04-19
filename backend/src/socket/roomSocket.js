const Message = require('../models/Message');
const Room = require('../models/Room');

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

    const messages = await Message.find({ roomCode })
      .sort({ createdAt: 1 })
      .limit(50);

    // full state only to the user who joined
    socket.emit('room:state', { room, messages });

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
    });
  });

  socket.on('chat:send', async ({ roomCode, userName, text }) => {
    if (!text || !text.trim()) return;

    const trimmed = text.trim().slice(0, 500);

    const saved = await Message.create({
      roomCode,
      userName,
      text: trimmed,
    });

    io.to(roomCode).emit('chat:new', {
      _id: saved._id,
      roomCode,
      userName,
      text: trimmed,
      createdAt: saved.createdAt,
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

    socket.to(roomCode).emit('playback:update', nextPlayback);
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
