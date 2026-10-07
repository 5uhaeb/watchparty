const test = require('node:test');
const assert = require('node:assert/strict');
const register = require('../../backend/src/socket/roomSocket');
const Room = require('../../backend/src/models/Room');

function harness() {
  const handlers = new Map();
  const emitted = [];
  const socket = {
    id: 'sender-socket', roomCode: 'ROOMAA', callRoomCode: 'ROOMAA', callUserId: 'signed-user',
    data: { guestId: 'signed-user' }, rateBuckets: {},
    on: (name, handler) => handlers.set(name, handler),
    emit: (event, payload) => emitted.push({ event, payload }),
    to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }),
  };
  const io = {
    in: () => ({ fetchSockets: async () => [{ id: 'receiver', callUserId: 'other-user' }] }),
    to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }),
  };
  register(io, socket);
  return { socket, handlers, emitted };
}

test('call events cannot broadcast to another room', async () => {
  for (const event of ['call:media-state', 'call:speaking', 'call:leave', 'call:video-frame']) {
    const { handlers, emitted } = harness();
    await handlers.get(event)({ roomCode: 'ROOMBB', speaking: true, state: { muted: false }, frame: 'data:image/jpeg;base64,AAAA' });
    assert.equal(emitted.length, 0, event);
  }
});

test('call signaling uses the server-authenticated sender identity', async () => {
  const { handlers, emitted } = harness();
  await handlers.get('call:signal')({ to: 'receiver', from: 'forged-host', signal: { type: 'offer', sdp: 'test' } });
  assert.equal(emitted[0].payload.fromUserId, 'signed-user');
  assert.equal(emitted[0].room, 'receiver');
});

test('malformed socket payloads are handled without uncaught rejections', async () => {
  const { handlers, emitted } = harness();
  await handlers.get('chat:send')(null);
  assert.equal(emitted[0].event, 'error:validation');
  await handlers.get('chat:send')({ text: { value: 'bad type' } });
  assert.equal(emitted.length, 1);
});

test('room lookup rejects operator objects before touching the database', async () => {
  const previous = Room.findOne;
  Room.findOne = () => assert.fail('database must not be queried');
  try {
    const { handlers } = harness();
    await handlers.get('room:join')({ roomCode: { $ne: null } });
  } finally { Room.findOne = previous; }
});
