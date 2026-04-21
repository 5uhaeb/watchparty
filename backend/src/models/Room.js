const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    ownerUserId: { type: String, required: true },
    adminUserIds: [{ type: String }],
    permissions: {
      playPause: { type: String, enum: ['owner', 'admins', 'everyone'], default: 'admins' },
      seek: { type: String, enum: ['owner', 'admins', 'everyone'], default: 'admins' },
      changeSource: { type: String, enum: ['owner', 'admins', 'everyone'], default: 'admins' },
      chat: { type: String, enum: ['owner', 'admins', 'everyone'], default: 'everyone' },
      invite: { type: String, enum: ['owner', 'admins', 'everyone'], default: 'admins' },
      kickMute: { type: String, enum: ['owner', 'admins'], default: 'admins' },
      managePerms: { type: String, enum: ['owner', 'admins'], default: 'owner' },
      manageAdmins: { type: String, enum: ['owner', 'admins'], default: 'owner' }
    },
    mutedUserIds: [{ type: String }],
    bannedUserIds: [{ type: String }],
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
