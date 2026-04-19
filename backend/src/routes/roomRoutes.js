const express = require('express');
const Room = require('../models/Room');

const router = express.Router();

function generateCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Create room
router.post('/', async (req, res) => {
  try {
    const { name, hostUserId, sourceType = 'youtube', sourceData = {} } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ message: 'name is required' });
    if (!hostUserId) return res.status(400).json({ message: 'hostUserId is required' });
    if (name.trim().length > 80) return res.status(400).json({ message: 'name too long' });

    let code = generateCode();
    let attempts = 0;
    while (await Room.findOne({ code }) && attempts++ < 10) {
      code = generateCode();
    }

    const room = await Room.create({
      code,
      name: name.trim(),
      hostUserId,
      sourceType,
      sourceData
    });

    res.status(201).json(room);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get room by code
router.get('/:code', async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const room = await Room.findOne({ code, isActive: true });
    if (!room) return res.status(404).json({ message: 'Room not found' });
    res.json(room);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Close room (host only)
router.delete('/:code', async (req, res) => {
  try {
    const { hostUserId } = req.body;
    const room = await Room.findOne({ code: req.params.code.toUpperCase() });

    if (!room) return res.status(404).json({ message: 'Room not found' });
    if (room.hostUserId !== hostUserId) return res.status(403).json({ message: 'Forbidden' });

    room.isActive = false;
    await room.save();

    res.json({ message: 'Room closed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
