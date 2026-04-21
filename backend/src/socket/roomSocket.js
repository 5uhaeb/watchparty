const Message = require('../models/Message');
const Room = require('../models/Room');
const { role, can } = require('../lib/permissions');

function registerRoomSocket(io, socket) {
  socket.on('room:join', async ({ roomCode, user }) => {
    const room = await Room.findOne({ code: roomCode, isActive: true });
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    // Check if user is banned
    if (room.bannedUserIds.includes(user.id)) {
      socket.emit('room:kicked', { userId: user.id, reason: 'You are banned from this room' });
      return;
    }

    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.data = { userId: user.id, userName: user.name };

    await Room.findOneAndUpdate(
      { code: roomCode },
      { $addToSet: { participants: { userId: user.id, name: user.name } } },
      { new: true }
    );

    const messages = await Message.find({ roomCode }).sort({ createdAt: 1 }).limit(50);

    // Send full room state to the joining user
    socket.emit('room:state', {
      ownerUserId: room.ownerUserId,
      adminUserIds: room.adminUserIds,
      permissions: room.permissions,
      mutedUserIds: room.mutedUserIds,
      room,
      messages,
      systemMessage: `${user.name} joined the room`
    });

    // Notify others
    socket.to(roomCode).emit('room:state', {
      room,
      messages: [],
      systemMessage: `${user.name} joined the room`
    });
  });

  socket.on('chat:send', async ({ text }) => {
    if (!text || !text.trim()) return;
    if (!socket.roomCode || !socket.data) return;

    const room = await Room.findOne({ code: socket.roomCode });
    if (!room) return;

    // Check permissions
    if (!can(room, socket.data.userId, 'chat')) {
      socket.emit('action:denied', { action: 'chat', reason: 'You do not have permission to chat' });
      return;
    }

    // Check if muted
    if (room.mutedUserIds.includes(socket.data.userId)) {
      socket.emit('action:denied', { action: 'chat', reason: 'You are muted' });
      return;
    }

    const saved = await Message.create({
      roomCode: socket.roomCode,
      userName: socket.data.userName,
      text
    });
    io.to(socket.roomCode).emit('chat:new', {
      _id: saved._id,
      roomCode: socket.roomCode,
      userName: socket.data.userName,
      text,
      createdAt: saved.createdAt
    });
  });

  socket.on('player:play', async ({ positionSec }) => {
    if (!socket.roomCode || !socket.data) return;

    const room = await Room.findOne({ code: socket.roomCode });
    if (!room) return;

    if (!can(room, socket.data.userId, 'playPause')) {
      socket.emit('player:denied', { action: 'playPause', reason: 'You do not have permission to control playback' });
      return;
    }

    const playback = { isPlaying: true, currentTime: positionSec, updatedAt: new Date() };
    await Room.findOneAndUpdate({ code: socket.roomCode }, { playback });

    socket.to(socket.roomCode).emit('playback:update', playback);
  });

  socket.on('player:pause', async ({ positionSec }) => {
    if (!socket.roomCode || !socket.data) return;

    const room = await Room.findOne({ code: socket.roomCode });
    if (!room) return;

    if (!can(room, socket.data.userId, 'playPause')) {
      socket.emit('player:denied', { action: 'playPause', reason: 'You do not have permission to control playback' });
      return;
    }

    const playback = { isPlaying: false, currentTime: positionSec, updatedAt: new Date() };
    await Room.findOneAndUpdate({ code: socket.roomCode }, { playback });

    socket.to(socket.roomCode).emit('playback:update', playback);
  });

  socket.on('player:seek', async ({ positionSec }) => {
    if (!socket.roomCode || !socket.data) return;

    const room = await Room.findOne({ code: socket.roomCode });
    if (!room) return;

    if (!can(room, socket.data.userId, 'seek')) {
      socket.emit('player:denied', { action: 'seek', reason: 'You do not have permission to seek' });
      return;
    }

    const playback = { currentTime: positionSec, updatedAt: new Date() };
    await Room.findOneAndUpdate({ code: socket.roomCode }, { $set: { 'playback.currentTime': positionSec, 'playback.updatedAt': new Date() } });

    socket.to(socket.roomCode).emit('playback:update', playback);
  });

  socket.on('player:changeSource', async ({ source }) => {
    if (!socket.roomCode || !socket.data) return;

    const room = await Room.findOne({ code: socket.roomCode });
    if (!room) return;

    if (!can(room, socket.data.userId, 'changeSource')) {
      socket.emit('player:denied', { action: 'changeSource', reason: 'You do not have permission to change source' });
      return;
    }

    // Update sourceData based on source
    const update = {};
    if (source.type === 'youtube') {
      update.sourceType = 'youtube';
      update['sourceData.url'] = source.url;
    } // Add other types as needed

    await Room.findOneAndUpdate({ code: socket.roomCode }, update);

    io.to(socket.roomCode).emit('source:changed', source);
  });

  socket.on('room:updatePerms', async ({ patch }) => {
    if (!socket.roomCode || !socket.data) return;

    const room = await Room.findOne({ code: socket.roomCode });
    if (!room) return;

    if (!can(room, socket.data.userId, 'managePerms')) {
      socket.emit('action:denied', { action: 'managePerms', reason: 'You do not have permission to manage permissions' });
      return;
    }

    const newPerms = { ...room.permissions, ...patch };
    await Room.findOneAndUpdate({ code: socket.roomCode }, { permissions: newPerms });

    io.to(socket.roomCode).emit('room:permsChanged', { permissions: newPerms, byUserId: socket.data.userId });
  });

  socket.on('room:promoteAdmin', async ({ userId }) => {
    if (!socket.roomCode || !socket.data) return;

    const room = await Room.findOne({ code: socket.roomCode });
    if (!room) return;

    if (!can(room, socket.data.userId, 'manageAdmins')) {
      socket.emit('action:denied', { action: 'manageAdmins', reason: 'You do not have permission to manage admins' });
      return;
    }

    if (room.ownerUserId === userId) {
      socket.emit('action:denied', { action: 'manageAdmins', reason: 'Cannot change owner role' });
      return;
    }

    await Room.findOneAndUpdate({ code: socket.roomCode }, { $addToSet: { adminUserIds: userId } });

    io.to(socket.roomCode).emit('room:rolesChanged', {
      ownerUserId: room.ownerUserId,
      adminUserIds: [...room.adminUserIds, userId],
      byUserId: socket.data.userId
    });
  });

  socket.on('room:demoteAdmin', async ({ userId }) => {
    if (!socket.roomCode || !socket.data) return;

    const room = await Room.findOne({ code: socket.roomCode });
    if (!room) return;

    if (!can(room, socket.data.userId, 'manageAdmins')) {
      socket.emit('action:denied', { action: 'manageAdmins', reason: 'You do not have permission to manage admins' });
      return;
    }

    if (room.ownerUserId === userId) {
      socket.emit('action:denied', { action: 'manageAdmins', reason: 'Cannot demote owner' });
      return;
    }

    await Room.findOneAndUpdate({ code: socket.roomCode }, { $pull: { adminUserIds: userId } });

    io.to(socket.roomCode).emit('room:rolesChanged', {
      ownerUserId: room.ownerUserId,
      adminUserIds: room.adminUserIds.filter(id => id !== userId),
      byUserId: socket.data.userId
    });
  });

  socket.on('room:transferOwner', async ({ toUserId }) => {
    if (!socket.roomCode || !socket.data) return;

    const room = await Room.findOne({ code: socket.roomCode });
    if (!room) return;

    if (room.ownerUserId !== socket.data.userId) {
      socket.emit('action:denied', { action: 'transferOwner', reason: 'Only the owner can transfer ownership' });
      return;
    }

    const newAdmins = [...new Set([...room.adminUserIds, toUserId])]; // Ensure new owner is admin
    await Room.findOneAndUpdate({ code: socket.roomCode }, {
      ownerUserId: toUserId,
      adminUserIds: newAdmins
    });

    io.to(socket.roomCode).emit('room:rolesChanged', {
      ownerUserId: toUserId,
      adminUserIds: newAdmins,
      byUserId: socket.data.userId
    });
  });

  socket.on('room:kick', async ({ userId }) => {
    if (!socket.roomCode || !socket.data) return;

    const room = await Room.findOne({ code: socket.roomCode });
    if (!room) return;

    if (!can(room, socket.data.userId, 'kickMute')) {
      socket.emit('action:denied', { action: 'kickMute', reason: 'You do not have permission to kick users' });
      return;
    }

    if (room.ownerUserId === userId && socket.data.userId !== room.ownerUserId) {
      socket.emit('action:denied', { action: 'kickMute', reason: 'Cannot kick the owner' });
      return;
    }

    if (room.adminUserIds.includes(userId) && socket.data.userId !== room.ownerUserId) {
      socket.emit('action:denied', { action: 'kickMute', reason: 'Cannot kick admins' });
      return;
    }

    // Find the socket for the user and disconnect
    const sockets = await io.in(socket.roomCode).fetchSockets();
    const targetSocket = sockets.find(s => s.data?.userId === userId);
    if (targetSocket) {
      targetSocket.emit('room:kicked', { userId, byUserId: socket.data.userId });
      targetSocket.disconnect();
    }

    await Room.findOneAndUpdate({ code: socket.roomCode }, { $pull: { participants: { userId } } });
  });

  socket.on('room:mute', async ({ userId, muted }) => {
    if (!socket.roomCode || !socket.data) return;

    const room = await Room.findOne({ code: socket.roomCode });
    if (!room) return;

    if (!can(room, socket.data.userId, 'kickMute')) {
      socket.emit('action:denied', { action: 'kickMute', reason: 'You do not have permission to mute users' });
      return;
    }

    if (room.ownerUserId === userId && socket.data.userId !== room.ownerUserId) {
      socket.emit('action:denied', { action: 'kickMute', reason: 'Cannot mute the owner' });
      return;
    }

    if (room.adminUserIds.includes(userId) && socket.data.userId !== room.ownerUserId) {
      socket.emit('action:denied', { action: 'kickMute', reason: 'Cannot mute admins' });
      return;
    }

    if (muted) {
      await Room.findOneAndUpdate({ code: socket.roomCode }, { $addToSet: { mutedUserIds: userId } });
    } else {
      await Room.findOneAndUpdate({ code: socket.roomCode }, { $pull: { mutedUserIds: userId } });
    }

    io.to(socket.roomCode).emit('room:state', {
      ownerUserId: room.ownerUserId,
      adminUserIds: room.adminUserIds,
      permissions: room.permissions,
      mutedUserIds: muted ? [...room.mutedUserIds, userId] : room.mutedUserIds.filter(id => id !== userId)
    });
  });

  socket.on('room:ban', async ({ userId }) => {
    if (!socket.roomCode || !socket.data) return;

    const room = await Room.findOne({ code: socket.roomCode });
    if (!room) return;

    if (!can(room, socket.data.userId, 'kickMute')) {
      socket.emit('action:denied', { action: 'kickMute', reason: 'You do not have permission to ban users' });
      return;
    }

    if (room.ownerUserId === userId) {
      socket.emit('action:denied', { action: 'kickMute', reason: 'Cannot ban the owner' });
      return;
    }

    if (room.adminUserIds.includes(userId) && socket.data.userId !== room.ownerUserId) {
      socket.emit('action:denied', { action: 'kickMute', reason: 'Cannot ban admins' });
      return;
    }

    await Room.findOneAndUpdate({ code: socket.roomCode }, {
      $addToSet: { bannedUserIds: userId },
      $pull: { participants: { userId } }
    });

    // Kick if online
    const sockets = await io.in(socket.roomCode).fetchSockets();
    const targetSocket = sockets.find(s => s.data?.userId === userId);
    if (targetSocket) {
      targetSocket.emit('room:kicked', { userId, byUserId: socket.data.userId, reason: 'You have been banned' });
      targetSocket.disconnect();
    }
  });

  socket.on('disconnect', async () => {
    if (socket.roomCode && socket.data) {
      const room = await Room.findOneAndUpdate(
        { code: socket.roomCode },
        { $pull: { participants: { userId: socket.data.userId } } },
        { new: true }
      );

      if (room) {
        io.to(socket.roomCode).emit('room:state', {
          room,
          systemMessage: `${socket.data.userName} left the room`
        });
      }
    }
  });
}

module.exports = registerRoomSocket;
