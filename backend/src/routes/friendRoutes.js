const express = require('express');
const Friendship = require('../models/Friendship');
const User = require('../models/User');

const router = express.Router();

function getUserId(req) {
  return req.get('x-user-id') || req.body.userId || req.query.userId;
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.email,
    name: user.name,
    email: user.email,
    image: user.image
  };
}

async function decorateFriendship(friendship) {
  const [requester, addressee] = await Promise.all([
    User.findOne({ email: friendship.requesterId }),
    User.findOne({ email: friendship.addresseeId })
  ]);

  return {
    id: friendship._id,
    requesterId: friendship.requesterId,
    addresseeId: friendship.addresseeId,
    status: friendship.status,
    createdAt: friendship.createdAt,
    respondedAt: friendship.respondedAt,
    requester: publicUser(requester),
    addressee: publicUser(addressee)
  };
}

router.get('/search', async (req, res) => {
  try {
    const userId = getUserId(req);
    const q = String(req.query.q || '').trim();
    if (!userId) return res.status(400).json({ message: 'userId is required' });
    if (q.length < 2) return res.json([]);

    const users = await User.find({
      email: { $ne: userId },
      $or: [
        { email: { $regex: q, $options: 'i' } },
        { name: { $regex: q, $options: 'i' } }
      ]
    }).limit(10);

    res.json(users.map(publicUser));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/request', async (req, res) => {
  try {
    const requesterId = getUserId(req);
    const { toUserId } = req.body;

    if (!requesterId || !toUserId) {
      return res.status(400).json({ message: 'userId and toUserId are required' });
    }
    if (requesterId === toUserId) {
      return res.status(400).json({ message: 'Cannot friend yourself' });
    }

    const reverse = await Friendship.findOne({ requesterId: toUserId, addresseeId: requesterId });
    if (reverse?.status === 'pending') {
      reverse.status = 'accepted';
      reverse.respondedAt = new Date();
      await reverse.save();
      return res.status(201).json(await decorateFriendship(reverse));
    }

    const friendship = await Friendship.findOneAndUpdate(
      { requesterId, addresseeId: toUserId },
      { requesterId, addresseeId: toUserId, status: 'pending' },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    req.app.get('io')?.to(`user:${toUserId}`).emit('friend:request', await decorateFriendship(friendship));
    res.status(201).json(await decorateFriendship(friendship));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Friend request already exists' });
    }
    res.status(500).json({ message: error.message });
  }
});

router.post('/respond', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { friendshipId, action } = req.body;
    if (!userId || !friendshipId || !action) {
      return res.status(400).json({ message: 'userId, friendshipId, and action are required' });
    }

    const friendship = await Friendship.findById(friendshipId);
    if (!friendship) return res.status(404).json({ message: 'Friendship not found' });
    if (friendship.addresseeId !== userId) return res.status(403).json({ message: 'Forbidden' });

    if (action === 'accept') friendship.status = 'accepted';
    else if (action === 'block') friendship.status = 'blocked';
    else if (action === 'decline') {
      await friendship.deleteOne();
      return res.json({ id: friendshipId, status: 'declined' });
    } else {
      return res.status(400).json({ message: 'Invalid action' });
    }

    friendship.respondedAt = new Date();
    await friendship.save();

    const decorated = await decorateFriendship(friendship);
    req.app.get('io')?.to(`user:${friendship.requesterId}`).emit('friend:updated', decorated);
    req.app.get('io')?.to(`user:${friendship.addresseeId}`).emit('friend:updated', decorated);
    res.json(decorated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const friendships = await Friendship.find({
      $or: [{ requesterId: userId }, { addresseeId: userId }],
      status: { $in: ['pending', 'accepted'] }
    }).sort({ updatedAt: -1 });

    const decorated = await Promise.all(friendships.map(decorateFriendship));
    res.json({
      friends: decorated.filter((item) => item.status === 'accepted'),
      incoming: decorated.filter((item) => item.status === 'pending' && item.addresseeId === userId),
      outgoing: decorated.filter((item) => item.status === 'pending' && item.requesterId === userId)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
