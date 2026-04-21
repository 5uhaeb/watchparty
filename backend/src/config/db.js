const mongoose = require('mongoose');

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    console.error('PRO TIP: Ensure your current IP (or Render/Vercel server IP) is whitelisted in MongoDB Atlas Network Access.');
    process.exit(1);
  }
}

module.exports = connectDB;
