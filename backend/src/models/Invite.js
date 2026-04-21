const mongoose = require('mongoose');

const inviteSchema = new mongoose.Schema(
  {
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    fromUserId: { type: String, required: true },
    toUserId: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'expired'],
      default: 'pending'
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Invite', inviteSchema);
