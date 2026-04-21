const mongoose = require('mongoose');

const friendshipSchema = new mongoose.Schema(
  {
    requesterId: { type: String, required: true },
    addresseeId: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'blocked'],
      default: 'pending'
    },
    respondedAt: Date
  },
  { timestamps: true }
);

friendshipSchema.index({ requesterId: 1, addresseeId: 1 }, { unique: true });

module.exports = mongoose.model('Friendship', friendshipSchema);
