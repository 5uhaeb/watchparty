const express = require('express');
const { signExtensionToken } = require('../lib/extensionToken');
const { requireGuest } = require('../lib/guestAuth');

const router = express.Router();

router.post('/token', requireGuest, (req, res) => {
  try {
    const token = signExtensionToken({
      id: req.guest.guestId,
      name: req.guest.displayName,
    });
    res.json(token);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
