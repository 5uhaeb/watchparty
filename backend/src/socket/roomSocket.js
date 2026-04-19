const Message = require('../models/Message');
const Room = require('../models/Room');

function registerRoomSocket(io, socket) {
  // ─── Room Join ────────────────────────────────────────────────────────────
  socket.on('room:join', async ({ roomCode, user }) => {
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.userData = user;

    const room = await Room.findOneAndUpdate(
      { code: roomCode, isActive: true },
      { $addToSet: { participants: { userId: user.id || user.name, name: user.name } } },
      { new: true }
    );

    if (!room) return;

    socket.isHost = room.hostUserId === (user.id || user.name);

    const messages = await Message.find({ roomCode }).sort({ createdAt: 1 }).limit(50);

    // Send full state + history to everyone in room
    io.to(roomCode).emit('room:state', {
      room,
      messages,
      systemMessage: `${user.name} joined the room`
    });

    // Reconnect sync: estimate current playback position and send to joining socket only
    const pb = room.playback;
    let currentTime = pb.currentTime || 0;
    if (pb.isPlaying && pb.updatedAt) {
      const elapsed = (Date.now() - new Date(pb.updatedAt).getTime()) / 1000;
      currentTime = Math.max(0, currentTime + elapsed);
    }
    socket.emit('reconnect:sync', { isPlaying: pb.isPlaying, currentTime });
  });

  // ─── Chat ─────────────────────────────────────────────────────────────────
  socket.on('chat:send', async ({ roomCode, userName, text }) => {
    if (!text || !text.trim()) return;
    const trimmed = text.trim().slice(0, 500); // max 500 chars

    const saved = await Message.create({ roomCode, userName, text: trimmed });
    io.to(roomCode).emit('chat:new', {
      _id: saved._id,
      roomCode,
      userName,
      text: trimmed,
      createdAt: saved.createdAt
    });
  });

  // ─── Playback (host-only broadcast) ──────────────────────────────────────
  socket.on('playback:update', async ({ roomCode, playback, userId }) => {
    const room = await Room.findOne({ code: roomCode });
    if (!room) return;

    // Only the host's playback events are broadcast to others
    const isHost = room.hostUserId === userId;
    if (!isHost) return;

    await Room.findOneAndUpdate(
      { code: roomCode },
      { playback: { ...playback, updatedAt: new Date() } }
    );

    socket.to(roomCode).emit('playback:update', playback);
  });

  // ─── Kick (host-only) ─────────────────────────────────────────────────────
  socket.on('room:kick', async ({ roomCode, targetName, hostUserId }) => {
    const room = await Room.findOne({ code: roomCode });
    if (!room || room.hostUserId !== hostUserId) return;

    // Find the target socket and disconnect them from the room
    const socketsInRoom = await io.in(roomCode).fetchSockets();
    for (const s of socketsInRoom) {
      if (s.userData?.name === targetName && s.id !== socket.id) {
        s.emit('room:kicked', { reason: 'You were removed by the host.' });
        s.leave(roomCode);
        break;
      }
    }

    // Remove from participants
    const updatedRoom = await Room.findOneAndUpdate(
      { code: roomCode },
      { $pull: { participants: { name: targetName } } },
      { new: true }
    );

    if (updatedRoom) {
      io.to(roomCode).emit('room:state', {
        room: updatedRoom,
        systemMessage: `${targetName} was removed by the host.`
      });
    }
  });

  // ─── WebRTC Video Call Signaling ──────────────────────────────────────────
  socket.on('call:join', ({ roomCode, userId, name }) => {
    socket.callUserId = userId;
    socket.callName = name;
    // Notify others in room that this user joined the call
    socket.to(roomCode).emit('call:user-joined', { userId, name });
  });

  socket.on('call:signal', ({ to, from, signal }) => {
    // Relay signaling message (offer/answer/ICE candidate) to the target peer
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

  // ─── Disconnect ───────────────────────────────────────────────────────────
  socket.on('disconnect', async () => {
    if (!socket.roomCode || !socket.userData) return;

    const { roomCode, userData } = socket;

    // Notify call peers
    if (socket.callUserId) {
      socket.to(roomCode).emit('call:user-left', { userId: socket.callUserId });
    }

    const room = await Room.findOneAndUpdate(
      { code: roomCode },
      { $pull: { participants: { name: userData.name } } },
      { new: true }
    );

    if (room) {
      io.to(roomCode).emit('room:state', {
        room,
        systemMessage: `${userData.name} left the room`
      });
    }
  });
}

module.exports = registerRoomSocket;
