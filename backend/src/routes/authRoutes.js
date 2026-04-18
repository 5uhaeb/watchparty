const express = require('express');
const User = require('../models/User');

const router = express.Router();

router.post('/sync-user', async (req, res) => {
  try {
    const { name, email, image, provider = 'google' } = req.body;

    if (!name || !email) {
      return res.status(400).json({ message: 'name and email are required' });
    }

    const user = await User.findOneAndUpdate(
      { email },
      { name, email, image, provider },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
