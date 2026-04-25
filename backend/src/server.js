const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const http = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const app = require('./app');
const connectDB = require('./config/db');
const registerRoomSocket = require('./socket/roomSocket');
const { getGuestFromToken, getGuestToken, serializeGuest } = require('./lib/guestAuth');
const { createAdapterClients, usingMockRedis } = require('./lib/redis');

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

app.set('io', io);

const adapterClients = createAdapterClients();
if (adapterClients) {
  io.adapter(createAdapter(adapterClients.pubClient, adapterClients.subClient));
} else if (usingMockRedis) {
  console.log('REDIS_URL not set; using in-memory Redis mock for dev presence.');
}

const handshakeBuckets = new Map();

function consumeHandshake(ip) {
  const now = Date.now();
  const bucket = handshakeBuckets.get(ip) || { tokens: 30, resetAt: now + 60 * 1000 };
  if (now >= bucket.resetAt) {
    bucket.tokens = 30;
    bucket.resetAt = now + 60 * 1000;
  }
  if (bucket.tokens <= 0) {
    handshakeBuckets.set(ip, bucket);
    return false;
  }
  bucket.tokens -= 1;
  handshakeBuckets.set(ip, bucket);
  return true;
}

io.use(async (socket, next) => {
  try {
    const ip = socket.handshake.address || socket.request.socket.remoteAddress || 'unknown';
    if (!consumeHandshake(ip)) return next(new Error('Rate limited'));

    const result = await getGuestFromToken(getGuestToken(socket.request, socket.handshake.auth?.token));
    if (!result?.guest) return next(new Error('JWT auth required'));

    const guest = serializeGuest(result.guest);
    socket.data.guestId = guest.guestId;
    socket.data.displayName = guest.displayName;
    socket.data.avatarHue = guest.avatarHue;
    return next();
  } catch {
    return next(new Error('JWT auth required'));
  }
});

io.on('connection', (socket) => {
  registerRoomSocket(io, socket);
});

server.listen(process.env.PORT || 5000, () => {
  console.log(`Server running on port ${process.env.PORT || 5000}`);
});
