const express = require('express');
const Room = require('../models/Room');
const { can } = require('../lib/permissions');

const router = express.Router();

function generateCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

router.post('/', async (req, res) => {
  try {
    const { name, ownerUserId, sourceType = 'youtube', sourceData = {} } = req.body;

    if (!name || !ownerUserId) {
      return res.status(400).json({ message: 'name and ownerUserId are required' });
    }

    let code = generateCode();
    while (await Room.findOne({ code })) {
      code = generateCode();
    }

    const room = await Room.create({
      code,
      name,
      ownerUserId,
      sourceType,
      sourceData
    });

    res.status(201).json(room);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:code', async (req, res) => {
  try {
    const room = await Room.findOne({ code: req.params.code, isActive: true });

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    res.json({
      ...room.toObject(),
      ownerUserId: room.ownerUserId,
      adminUserIds: room.adminUserIds,
      permissions: room.permissions,
      mutedUserIds: room.mutedUserIds,
      bannedUserIds: room.bannedUserIds
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/:code/permissions', async (req, res) => {
  try {
    const room = await Room.findOne({ code: req.params.code, isActive: true });
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Assume userId from auth middleware, for now use req.body.userId
    const userId = req.body.userId; // TODO: get from auth
    if (!can(room, userId, 'managePerms')) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const newPerms = { ...room.permissions, ...req.body };
    await Room.findOneAndUpdate({ code: req.params.code }, { permissions: newPerms });

    res.json({ permissions: newPerms });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:code/admins', async (req, res) => {
  try {
    const room = await Room.findOne({ code: req.params.code, isActive: true });
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const userId = req.body.userId; // TODO: auth
    if (!can(room, userId, 'manageAdmins')) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { userId: targetUserId } = req.body;
    if (room.ownerUserId === targetUserId) {
      return res.status(400).json({ message: 'Cannot promote owner' });
    }

    await Room.findOneAndUpdate({ code: req.params.code }, { $addToSet: { adminUserIds: targetUserId } });

    res.json({ message: 'User promoted to admin' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:code/admins/:userId', async (req, res) => {
  try {
    const room = await Room.findOne({ code: req.params.code, isActive: true });
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const userId = req.body.userId; // TODO: auth
    if (!can(room, userId, 'manageAdmins')) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const targetUserId = req.params.userId;
    if (room.ownerUserId === targetUserId) {
      return res.status(400).json({ message: 'Cannot demote owner' });
    }

    await Room.findOneAndUpdate({ code: req.params.code }, { $pull: { adminUserIds: targetUserId } });

    res.json({ message: 'User demoted from admin' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:code/transfer-owner', async (req, res) => {
  try {
    const room = await Room.findOne({ code: req.params.code, isActive: true });
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const userId = req.body.userId; // TODO: auth
    if (room.ownerUserId !== userId) {
      return res.status(403).json({ message: 'Only owner can transfer ownership' });
    }

    const { toUserId } = req.body;
    const newAdmins = [...new Set([...room.adminUserIds, toUserId])];
    await Room.findOneAndUpdate({ code: req.params.code }, {
      ownerUserId: toUserId,
      adminUserIds: newAdmins
    });

    res.json({ message: 'Ownership transferred' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
