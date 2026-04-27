const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const guestRoutes = require('./routes/guestRoutes');
const roomRoutes = require('./routes/roomRoutes');

const app = express();

app.set('trust proxy', 1);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (origin === process.env.CLIENT_URL) return true;
  if (/^chrome-extension:\/\//.test(origin)) return true;
  if (/^moz-extension:\/\//.test(origin)) return true;
  return false;
}

app.use(cors({
  origin(origin, callback) {
    callback(null, isAllowedOrigin(origin));
  },
  credentials: true
}));

app.use(express.json());   // <-- add this
app.use(express.urlencoded({ extended: true })); // optional but useful

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' }
});

app.use('/api/', limiter);

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/guest', guestRoutes);
app.use('/api/rooms', roomRoutes);

module.exports = app;
