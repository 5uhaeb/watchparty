const mongoose = require('mongoose');

const guestSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    displayName: { type: String, required: true },
    lastSeenAt: { type: Date, default: Date.now },
    avatarHue: { type: Number, min: 0, max: 359, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

guestSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

module.exports = mongoose.model('Guest', guestSchema);
