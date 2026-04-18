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

router.post('/', async (req, res) => {
  try {
    const { name, hostUserId, sourceType = 'youtube', sourceData = {} } = req.body;

    if (!name || !hostUserId) {
      return res.status(400).json({ message: 'name and hostUserId are required' });
    }

    let code = generateCode();
    while (await Room.findOne({ code })) {
      code = generateCode();
    }

    const room = await Room.create({
      code,
      name,
      hostUserId,
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

    res.json(room);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
