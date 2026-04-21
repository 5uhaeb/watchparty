const express = require('express');
const Room = require('../models/Room');
const Message = require('../models/Message');

const router = express.Router();

function generateCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function parseLimit(value, fallback = 50) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, 100);
}

async function findRoomByIdOrCode(id) {
  const code = id.toUpperCase();
  const query = { isActive: true };

  if (id.match(/^[a-f\d]{24}$/i)) {
    return Room.findOne({ ...query, _id: id });
  }

  return Room.findOne({ ...query, code });
}

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
    createdAt: message.createdAt
  };
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

// Get recent room messages, newest first
router.get('/:id/messages', async (req, res) => {
  try {
    const room = await findRoomByIdOrCode(req.params.id);
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const limit = parseLimit(req.query.limit);
    const filter = { roomId: room._id };

    if (req.query.before) {
      const before = new Date(req.query.before);
      if (Number.isNaN(before.getTime())) {
        return res.status(400).json({ message: 'before must be a valid ISO date' });
      }
      filter.createdAt = { $lt: before };
    }

    const messages = await Message.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit);

    res.json(messages.map(serializeMessage));
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
