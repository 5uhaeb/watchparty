const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    hostUserId: { type: String, required: true },
    sourceType: {
      type: String,
      enum: ['youtube', 'local', 'ott-sync'],
      default: 'youtube'
    },
    sourceData: {
      url: String,
      fileName: String,
      ottPlatform: String
    },
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
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Room', roomSchema);
