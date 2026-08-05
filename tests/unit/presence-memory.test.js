const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getPresenceList,
  isMember,
  presenceDisconnect,
  presenceJoin,
} = require('../../backend/src/lib/presence');

function createIo(events) {
  return {
    to(roomCode) {
      return {
        emit(name, payload) {
          events.push({ roomCode, name, payload });
        },
      };
    },
  };
}

function createSocket(id, guestId, displayName = 'Guest') {
  return {
    id,
    roomCode: 'MEM123',
    data: { guestId, displayName, avatarHue: 42 },
  };
}

test('in-memory presence tracks join, disconnect, and reconnect', async () => {
  const events = [];
  const io = createIo(events);
  const firstSocket = createSocket('socket-1', 'guest-1', 'First Guest');

  const joined = await presenceJoin(io, 'MEM123', firstSocket);
  assert.equal(joined.length, 1);
  assert.equal(joined[0].state, 'online');
  assert.equal(await isMember('MEM123', 'guest-1'), true);

  await presenceDisconnect(io, firstSocket);
  const reconnecting = await getPresenceList('MEM123');
  assert.equal(reconnecting[0].state, 'reconnecting');
  assert.ok(reconnecting[0].reconnectExpiresAt);

  const secondSocket = createSocket('socket-2', 'guest-1', 'First Guest');
  const rejoined = await presenceJoin(io, 'MEM123', secondSocket);
  assert.equal(rejoined[0].state, 'online');
  assert.equal(rejoined[0].socketId, 'socket-2');
  assert.ok(events.some((event) => event.name === 'participant:back'));
});
