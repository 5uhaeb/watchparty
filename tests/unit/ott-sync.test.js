const test = require('node:test');
const assert = require('node:assert/strict');
const { decideDriftAction, shouldSendLocalEvent } = require('../../extension/ott-sync-math');
const roomSocket = require('../../backend/src/socket/roomSocket');

const {
  can,
  consumeBucket,
  parsePositionSec,
  validateOttPayload,
} = roomSocket._test;

test('drift calculation ignores tiny drift', () => {
  assert.equal(decideDriftAction(10, 10.2, true, 4).action, 'none');
});

test('drift calculation uses playbackRate for medium drift', () => {
  assert.deepEqual(decideDriftAction(10, 10.8, true, 4), {
    action: 'rate',
    drift: 0.8000000000000007,
    rate: 1.05,
  });
  assert.equal(decideDriftAction(10, 9.4, true, 4).rate, 0.95);
});

test('drift calculation seeks for large drift or buffering video', () => {
  assert.equal(decideDriftAction(10, 13, true, 4).action, 'seek');
  assert.equal(decideDriftAction(10, 10.8, true, 1).action, 'seek');
});

test('provider filtering rejects mismatched OTT provider', () => {
  const room = { source: { type: 'ott-sync', provider: 'hotstar' } };
  const result = validateOttPayload(room, { sourceType: 'ott-sync', provider: 'prime' });
  assert.equal(result.ok, false);
  assert.match(result.message, /Wrong provider/);
});

test('provider filtering allows wildcard OTT source', () => {
  const room = { source: { type: 'ott-sync', provider: 'ott' } };
  const result = validateOttPayload(room, { sourceType: 'ott-sync', provider: 'netflix' });
  assert.equal(result.ok, true);
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

test('extension loop prevention suppresses remote-applied local echoes', () => {
  assert.equal(shouldSendLocalEvent({
    hasVideo: true,
    controlAllowed: true,
    ignoreUntilMs: 2000,
    nowMs: 1500,
  }), false);
  assert.equal(shouldSendLocalEvent({
    hasVideo: true,
    controlAllowed: true,
    ignoreUntilMs: 2000,
    nowMs: 2500,
  }), true);
  assert.equal(shouldSendLocalEvent({
    hasVideo: true,
    controlAllowed: false,
    ignoreUntilMs: 0,
    nowMs: 2500,
  }), false);
});
