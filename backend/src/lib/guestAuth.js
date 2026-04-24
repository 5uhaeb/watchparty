const crypto = require('crypto');
const Guest = require('../models/Guest');
const { generateDisplayName, generateUlid } = require('./guest');

const COOKIE_NAME = 'wp_guest';
const JWT_TTL_SECONDS = 60 * 60 * 24;
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlJson(value) {
  return base64Url(JSON.stringify(value));
}

function decodeBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function getSecret() {
  const secret = process.env.GUEST_JWT_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('GUEST_JWT_SECRET is required');
  return secret;
}

function signGuestJwt(guest) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    guestId: guest._id || guest.guestId,
    displayName: guest.displayName,
    avatarHue: guest.avatarHue,
    iat: now,
    exp: now + JWT_TTL_SECONDS,
  };
  const body = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signature = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function decodeGuestJwt(token) {
  const [, payload] = String(token || '').split('.');
  if (!payload) throw new Error('Invalid JWT');
  return JSON.parse(decodeBase64Url(payload));
}

function verifyGuestJwt(token, { ignoreExpiration = false } = {}) {
  const [header, payload, signature] = String(token || '').split('.');
  if (!header || !payload || !signature) throw new Error('Invalid JWT');

  const expected = crypto.createHmac('sha256', getSecret()).update(`${header}.${payload}`).digest('base64url');
  const actual = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actual.length !== expectedBuffer.length || !crypto.timingSafeEqual(actual, expectedBuffer)) {
    throw new Error('Invalid JWT signature');
  }

  const claims = JSON.parse(decodeBase64Url(payload));
  if (!ignoreExpiration && claims.exp && claims.exp <= Math.floor(Date.now() / 1000)) {
    const error = new Error('JWT expired');
    error.code = 'JWT_EXPIRED';
    error.claims = claims;
    throw error;
  }
  return claims;
}

function parseCookies(header = '') {
  return header.split(';').reduce((cookies, part) => {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (!rawName) return cookies;
    cookies[rawName] = decodeURIComponent(rawValue.join('=') || '');
    return cookies;
  }, {});
}

function getBearerToken(header = '') {
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function getGuestToken(req, fallbackToken = null) {
  return (
    getBearerToken(req.headers.authorization) ||
    req.headers['x-guest-token'] ||
    fallbackToken ||
    parseCookies(req.headers.cookie || '')[COOKIE_NAME]
  );
}

function guestCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS * 1000,
  };
}

function setGuestCookie(res, token) {
  res.cookie(COOKIE_NAME, token, guestCookieOptions());
}

function clearGuestCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
  });
}

function serializeGuest(guest) {
  return {
    guestId: guest._id,
    displayName: guest.displayName,
    avatarHue: guest.avatarHue,
  };
}

async function createGuest() {
  return Guest.create({
    _id: generateUlid(),
    displayName: generateDisplayName(),
    avatarHue: crypto.randomInt(360),
    lastSeenAt: new Date(),
  });
}

async function touchGuest(guestId) {
  return Guest.findByIdAndUpdate(
    guestId,
    { lastSeenAt: new Date() },
    { new: true }
  );
}

async function getGuestFromToken(token, { allowExpiredRefresh = true } = {}) {
  if (!token) return null;

  try {
    const claims = verifyGuestJwt(token);
    const guest = await touchGuest(claims.guestId);
    return guest ? { guest, refreshed: false } : null;
  } catch (error) {
    if (!allowExpiredRefresh || error.code !== 'JWT_EXPIRED') throw error;
    const claims = error.claims || decodeGuestJwt(token);
    const guest = await touchGuest(claims.guestId);
    return guest ? { guest, refreshed: true } : null;
  }
}

async function bootstrapGuest(req, res) {
  const token = getGuestToken(req);
  const existing = await getGuestFromToken(token).catch(() => null);
  const guest = existing?.guest || await createGuest();
  const nextToken = existing?.refreshed || !existing ? signGuestJwt(guest) : token;
  setGuestCookie(res, nextToken);
  return { guest, token: nextToken };
}

async function requireGuest(req, res, next) {
  try {
    const result = await getGuestFromToken(getGuestToken(req));
    if (!result?.guest) {
      return res.status(401).json({ message: 'Guest auth required' });
    }

    if (result.refreshed) {
      setGuestCookie(res, signGuestJwt(result.guest));
    }

    req.guest = serializeGuest(result.guest);
    return next();
  } catch {
    return res.status(401).json({ message: 'Guest auth required' });
  }
}

module.exports = {
  COOKIE_NAME,
  bootstrapGuest,
  clearGuestCookie,
  createGuest,
  decodeGuestJwt,
  getGuestFromToken,
  getGuestToken,
  requireGuest,
  serializeGuest,
  setGuestCookie,
  signGuestJwt,
  verifyGuestJwt,
};
