const Message = require('../models/Message');
const Room = require('../models/Room');

function registerRoomSocket(io, socket) {
  socket.on('room:join', async ({ roomCode, user }) => {
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.userData = user;

    const room = await Room.findOneAndUpdate(
      { code: roomCode, isActive: true },
      { $addToSet: { participants: { userId: user.id || user.name, name: user.name } } },
      { new: true }
    );

    if (room) {
      const messages = await Message.find({ roomCode }).sort({ createdAt: 1 }).limit(50);
      io.to(roomCode).emit('room:state', { 
        room, 
        messages,
        systemMessage: `${user.name} joined the room`
      });
    }
  });

  socket.on('chat:send', async ({ roomCode, userName, text }) => {
    if (!text || !text.trim()) return;

    const saved = await Message.create({ roomCode, userName, text });
    io.to(roomCode).emit('chat:new', {
      _id: saved._id,
      roomCode,
      userName,
      text,
      createdAt: saved.createdAt
    });
  });

  socket.on('playback:update', async ({ roomCode, playback, userId }) => {
    // Basic host check logic (extensible)
    const room = await Room.findOne({ code: roomCode });
    if (!room) return;

    // For now, only the host or the first participant can control if we wanted to enforce it.
    // We'll keep it open for everyone for now but update the DB.
    
    await Room.findOneAndUpdate(
      { code: roomCode },
      { playback: { ...playback, updatedAt: new Date() } },
      { new: true }
    );

    socket.to(roomCode).emit('playback:update', playback);
  });

  socket.on('disconnect', async () => {
    if (socket.roomCode && socket.userData) {
      const { roomCode, userData } = socket;
      
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
    }
  });
}

module.exports = registerRoomSocket;
