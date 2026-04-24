const express = require('express');
const Room = require('../models/Room');
const Message = require('../models/Message');
const { requireGuest } = require('../lib/guestAuth');

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

function getUserId(req) {
  return req.guest?.guestId;
}

function normalizeTitle(value) {
  const title = typeof value === 'string' ? value.trim() : '';
  return title || 'Untitled room';
}

function isOwnerOrAdmin(room, guestId) {
  return !!guestId && (
    room.ownerGuestId === guestId ||
    room.adminGuestIds?.includes(guestId)
  );
}

function serializePublicRoom(room) {
  return {
    id: room._id,
    _id: room._id,
    code: room.code,
    title: room.title,
    createdByGuestId: room.createdByGuestId,
    ownerGuestId: room.ownerGuestId,
    adminGuestIds: room.adminGuestIds || [],
    permissions: room.permissions,
    source: room.source || null,
    playback: room.playback,
    presence: { count: 0 },
    isActive: room.isActive,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    lastActivityAt: room.lastActivityAt,
  };
}

// Create room
router.post('/', requireGuest, async (req, res) => {
  try {
    const title = normalizeTitle(req.body?.title);
    const ownerGuestId = req.guest.guestId;

    if (title.length > 60) return res.status(400).json({ message: 'title must be 1-60 characters' });

    let code;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      code = generateCode();
      if (!(await Room.findOne({ code }))) break;
      code = null;
    }
    if (!code) return res.status(503).json({ message: 'Could not allocate room code' });

    const room = await Room.create({
      code,
      title,
      createdByGuestId: ownerGuestId,
      ownerGuestId,
      adminGuestIds: [],
      source: null,
      lastActivityAt: new Date(),
    });

    res.status(201).json({ code: room.code, title: room.title });
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
    res.json(serializePublicRoom(room));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/:code', requireGuest, async (req, res) => {
  try {
    const room = await Room.findOne({ code: req.params.code.toUpperCase(), isActive: true });
    if (!room) return res.status(404).json({ message: 'Room not found' });
    if (!isOwnerOrAdmin(room, getUserId(req))) return res.status(403).json({ message: 'Forbidden' });

    if (req.body?.title !== undefined) {
      const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
      if (!title || title.length > 60) return res.status(400).json({ message: 'title must be 1-60 characters' });
      room.title = title;
      room.lastActivityAt = new Date();
    }

    await room.save();
    req.app.get('io')?.to(room.code).emit('room:state', { room });
    res.json(room);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Close room (host only)
router.delete('/:code', requireGuest, async (req, res) => {
  try {
    const guestId = req.guest.guestId;
    const room = await Room.findOne({ code: req.params.code.toUpperCase() });

    if (!room) return res.status(404).json({ message: 'Room not found' });
    if (!isOwnerOrAdmin(room, guestId)) return res.status(403).json({ message: 'Forbidden' });

    room.isActive = false;
    await room.save();

    req.app.get('io')?.to(room.code).emit('room:ended', {
      roomCode: room.code,
      byUserId: guestId
    });

    res.json({ message: 'Room closed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
