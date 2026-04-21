const express = require('express');
const Guest = require('../models/Guest');
const {
  bootstrapGuest,
  clearGuestCookie,
  requireGuest,
  serializeGuest,
  setGuestCookie,
  signGuestJwt,
} = require('../lib/guestAuth');

const router = express.Router();

function sanitizeDisplayName(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

router.post('/bootstrap', async (req, res) => {
  try {
    const guest = await bootstrapGuest(req, res);
    res.json(serializeGuest(guest));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/me', requireGuest, async (req, res) => {
  try {
    const displayName = sanitizeDisplayName(req.body.displayName);
    if (displayName.length < 2 || displayName.length > 24) {
      return res.status(400).json({ message: 'Display name must be 2-24 printable characters' });
    }

    const guest = await Guest.findByIdAndUpdate(
      req.guest.guestId,
      { displayName, lastSeenAt: new Date() },
      { new: true }
    );
    if (!guest) return res.status(404).json({ message: 'Guest not found' });

    setGuestCookie(res, signGuestJwt(guest));
    res.json(serializeGuest(guest));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/logout', (req, res) => {
  clearGuestCookie(res);
  res.json({ ok: true });
});

module.exports = router;
