const test = require('node:test');
const assert = require('node:assert/strict');
const roomSocket = require('../../backend/src/socket/roomSocket');

const {
  can,
  consumeBucket,
  parsePositionSec,
  validateOttPayload,
} = roomSocket._test;

test('OTT playback events are disabled', () => {
  const room = { source: { type: 'ott-sync', provider: 'hotstar' } };
  const result = validateOttPayload(room, { sourceType: 'ott-sync', provider: 'prime' });
  assert.equal(result.ok, false);
  assert.match(result.message, /disabled/);
});

test('malformed playback positions are rejected', () => {
  assert.equal(parsePositionSec(-1), null);
  assert.equal(parsePositionSec('nope'), null);
  assert.equal(parsePositionSec(49 * 60 * 60), null);
  assert.equal(parsePositionSec('12.5'), 12.5);
});

test('heartbeat bucket is independently rate limited', () => {
  const socket = { rateBuckets: {}, emit() {} };
  const allowed = [];
  for (let index = 0; index < 7; index += 1) {
    allowed.push(consumeBucket(socket, 'player:heartbeat', 6, 20 * 1000));
  }
  assert.deepEqual(allowed, [true, true, true, true, true, true, false]);
});

test('permission checks default to host-only and allow everyone mode', () => {
  const room = {
    ownerGuestId: 'host-1',
    adminGuestIds: ['admin-1'],
    permissions: { controlPlayback: 'ownerAdmin' },
  };
  assert.equal(can(room, 'host-1', 'controlPlayback'), true);
  assert.equal(can(room, 'admin-1', 'controlPlayback'), true);
  assert.equal(can(room, 'guest-1', 'controlPlayback'), false);

  room.permissions.controlPlayback = 'all';
  assert.equal(can(room, 'guest-1', 'controlPlayback'), true);
});
