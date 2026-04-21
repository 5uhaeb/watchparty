// TypeScript source mirror for background.js. Keep the JS file as the load-unpacked MV3 artifact.
importScripts('vendor/socket.io.min.js');

const STORAGE_KEYS = ['backendUrl', 'roomCode', 'token'];
const WATCH_URLS = [
  'https://www.netflix.com/*',
  'https://*.primevideo.com/*',
  'https://www.amazon.com/gp/video/*',
];

let socket = null;
let activeConfig = null;

function normalizeBackendUrl(url) {
  return (url || '').trim().replace(/\/$/, '');
}

async function getConfig() {
  return chrome.storage.local.get(STORAGE_KEYS);
}

async function broadcastToContent(message) {
  const tabs = await chrome.tabs.query({ url: WATCH_URLS });
  await Promise.all(
    tabs.map((tab) => {
      if (!tab.id) return Promise.resolve();
      return chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    })
  );
}

function disconnect() {
  socket?.disconnect();
  socket = null;
  activeConfig = null;
}

async function connect() {
  const config = await getConfig();
  const backendUrl = normalizeBackendUrl(config.backendUrl);
  const roomCode = (config.roomCode || '').trim().toUpperCase();
  const token = (config.token || '').trim();

  if (!backendUrl || !roomCode || !token) {
    disconnect();
    return { ok: false, message: 'Backend URL, room code, and token are required.' };
  }

  const nextConfigKey = `${backendUrl}|${roomCode}|${token}`;
  if (socket?.connected && activeConfig === nextConfigKey) {
    return { ok: true, message: 'Already connected.' };
  }

  disconnect();
  activeConfig = nextConfigKey;

  socket = io(backendUrl, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    socket.emit('extension:join', { roomCode, token });
  });

  socket.on('extension:joined', () => {
    broadcastToContent({ type: 'watchparty:status', connected: true, roomCode });
  });

  socket.on('extension:error', (payload) => {
    broadcastToContent({ type: 'watchparty:error', message: payload?.message || 'Extension sync error' });
  });

  for (const eventName of ['player:play', 'player:pause', 'player:seek', 'player:heartbeat']) {
    socket.on(eventName, (payload) => {
      broadcastToContent({ type: 'watchparty:remote-player-event', eventName, payload });
    });
  }

  socket.on('disconnect', () => {
    broadcastToContent({ type: 'watchparty:status', connected: false, roomCode });
  });

  return { ok: true, message: 'Connecting...' };
}

async function relayPlayerEvent(message) {
  if (!socket?.connected) {
    await connect();
  }

  const config = await getConfig();
  const roomCode = (config.roomCode || '').trim().toUpperCase();
  if (!socket || !roomCode) return { ok: false, message: 'Not connected.' };

  socket.emit(message.eventName, {
    roomCode,
    positionSec: message.positionSec,
  });

  return { ok: true };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    backendUrl: 'http://localhost:5000',
    webAppUrl: 'http://localhost:3000',
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'watchparty:connect') {
    connect().then(sendResponse);
    return true;
  }

  if (message?.type === 'watchparty:disconnect') {
    disconnect();
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === 'watchparty:local-player-event') {
    relayPlayerEvent(message).then(sendResponse);
    return true;
  }

  return false;
});

connect();
