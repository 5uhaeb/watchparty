const express = require('express');
const Invite = require('../models/Invite');
const Room = require('../models/Room');

const router = express.Router();

function getUserId(req) {
  return req.get('x-user-id') || req.body.userId || req.query.userId;
}

function serializeInvite(invite, room) {
  return {
    id: invite._id,
    roomId: invite.roomId,
    roomCode: room?.code,
    roomName: room?.name,
    fromUserId: invite.fromUserId,
    toUserId: invite.toUserId,
    status: invite.status,
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt
  };
}

router.post('/:id/respond', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { action } = req.body;
    if (!userId || !action) return res.status(400).json({ message: 'userId and action are required' });

    const invite = await Invite.findById(req.params.id);
    if (!invite) return res.status(404).json({ message: 'Invite not found' });
    if (invite.toUserId !== userId) return res.status(403).json({ message: 'Forbidden' });

    if (invite.expiresAt <= new Date()) {
      invite.status = 'expired';
      await invite.save();
      return res.status(410).json({ message: 'Invite expired' });
    }

    if (action === 'accept') invite.status = 'accepted';
    else if (action === 'decline') invite.status = 'declined';
    else return res.status(400).json({ message: 'Invalid action' });

    await invite.save();

    const room = await Room.findById(invite.roomId);
    res.json({ invite: serializeInvite(invite, room), room });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
