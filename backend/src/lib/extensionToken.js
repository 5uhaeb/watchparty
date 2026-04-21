const crypto = require('crypto');

const TOKEN_TTL_SEC = 10 * 60;

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64urlJson(value) {
  return base64url(JSON.stringify(value));
}

function getSecret() {
  return process.env.EXTENSION_TOKEN_SECRET || process.env.GUEST_JWT_SECRET || process.env.SESSION_SECRET;
}

function signExtensionToken(user, ttlSec = TOKEN_TTL_SEC) {
  const secret = getSecret();
  if (!secret) throw new Error('EXTENSION_TOKEN_SECRET is not configured');

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    aud: 'watchparty-extension',
    sub: user.id,
    name: user.name || user.id,
    iat: now,
    exp: now + ttlSec,
  };
  const unsigned = `${base64urlJson(header)}.${base64urlJson(payload)}`;
  const signature = crypto.createHmac('sha256', secret).update(unsigned).digest('base64url');

  return { token: `${unsigned}.${signature}`, expiresAt: payload.exp * 1000 };
}

function verifyExtensionToken(token) {
  const secret = getSecret();
  if (!secret) throw new Error('EXTENSION_TOKEN_SECRET is not configured');
  if (!token || typeof token !== 'string') return null;

  const [encodedHeader, encodedPayload, signature] = token.split('.');
  if (!encodedHeader || !encodedPayload || !signature) return null;

  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const expected = crypto.createHmac('sha256', secret).update(unsigned).digest('base64url');
  const provided = Buffer.from(signature);
  const valid = provided.length === Buffer.from(expected).length
    && crypto.timingSafeEqual(provided, Buffer.from(expected));

  if (!valid) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch (_error) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== 'watchparty-extension' || payload.exp < now) return null;

  return payload;
}

module.exports = {
  signExtensionToken,
  verifyExtensionToken,
};
