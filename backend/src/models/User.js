const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    image: String,
    provider: { type: String, default: 'google' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
