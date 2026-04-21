const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    title: { type: String, required: true, default: 'Untitled room' },
    createdByGuestId: { type: String, required: true },
    ownerGuestId: { type: String, required: true },
    adminGuestIds: [{ type: String }],
    permissions: {
      changeSource: { type: String, enum: ['ownerAdmin'], default: 'ownerAdmin' },
      editTitle: { type: String, enum: ['ownerAdmin'], default: 'ownerAdmin' }
    },
    source: { type: mongoose.Schema.Types.Mixed, default: null },
    playback: {
      isPlaying: { type: Boolean, default: false },
      currentTime: { type: Number, default: 0 },
      updatedAt: { type: Date, default: Date.now }
    },
    participants: [
      {
        userId: String,
        name: String,
        joinedAt: { type: Date, default: Date.now }
      }
    ],
    isActive: { type: Boolean, default: true },
    lastActivityAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

roomSchema.index({ lastActivityAt: 1 }, { expireAfterSeconds: 60 * 60 * 6 });

module.exports = mongoose.model('Room', roomSchema);
