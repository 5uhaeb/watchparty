const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const guestRoutes = require('./routes/guestRoutes');
const roomRoutes = require('./routes/roomRoutes');

const app = express();

app.set('trust proxy', 1);

const allowedClientOrigins = new Set(
  String(process.env.CLIENT_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedClientOrigins.has(origin)) return true;
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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
