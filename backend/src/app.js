const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const guestRoutes = require('./routes/guestRoutes');
const roomRoutes = require('./routes/roomRoutes');
const { isAllowedOrigin } = require('./lib/origins');

const app = express();

app.set('trust proxy', 1);

// Reject the request itself: CORS response headers alone do not prevent writes.
app.use((req, res, next) => {
  if (!isAllowedOrigin(req.headers.origin)) return res.status(403).json({ message: 'Origin not allowed' });
  next();
});

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
