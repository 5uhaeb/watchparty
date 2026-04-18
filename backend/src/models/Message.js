const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    roomCode: { type: String, required: true },
    userName: { type: String, required: true },
    text: { type: String, required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Message', messageSchema);
