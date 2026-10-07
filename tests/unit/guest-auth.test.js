const test = require('node:test');
const assert = require('node:assert/strict');
const { signGuestJwt, verifyGuestJwt, getGuestToken } = require('../../backend/src/lib/guestAuth');

process.env.GUEST_JWT_SECRET = 'test-only-guest-key-not-used-by-a-deployment';

test('signed guest identities reject tampering and extra JWT segments', () => {
  const token = signGuestJwt({ _id: 'guest-1', displayName: 'Test Guest', avatarHue: 12 });
  assert.equal(verifyGuestJwt(token).guestId, 'guest-1');
  assert.throws(() => verifyGuestJwt(`${token}.extra`), /Invalid JWT/);
  const parts = token.split('.');
  parts[1] = Buffer.from(JSON.stringify({ guestId: 'forged' })).toString('base64url');
  assert.throws(() => verifyGuestJwt(parts.join('.')), /signature/);
});

test('malformed unrelated cookie does not prevent reading a guest token', () => {
  assert.equal(getGuestToken({ headers: { cookie: 'broken=%ZZ; wp_guest=test-token' } }), 'test-token');
});
