require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const connectDB = require('./config/db');
const registerRoomSocket = require('./socket/roomSocket');

connectDB();

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (
        !origin ||
        origin === process.env.CLIENT_URL ||
        origin.startsWith('chrome-extension://') ||
        origin.startsWith('moz-extension://')
      ) {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed by CORS'));
    },
    credentials: true
  }
});

io.on('connection', (socket) => {
  registerRoomSocket(io, socket);
});

server.listen(process.env.PORT || 5000, () => {
  console.log(`Server running on port ${process.env.PORT || 5000}`);
});
