const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    userId: { type: String, required: true },
    username: { type: String, required: true },
    type: {
      type: String,
      enum: ['chat', 'system'],
      default: 'chat'
    },
    text: { type: String, required: true }
  },
  { timestamps: true }
);

messageSchema.index({ roomId: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
