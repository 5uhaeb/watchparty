importScripts('vendor/socket.io.min.js');

const STORAGE_KEYS = ['backendUrl', 'roomCode', 'token', 'webAppUrl'];
const WATCH_URLS = [
  'https://www.netflix.com/*',
  'https://*.primevideo.com/*',
  'https://www.amazon.com/gp/video/*',
  'https://www.hotstar.com/*',
  'https://hotstar.com/*',
  'https://*.hotstar.com/*',
  'https://jiohotstar.com/*',
  'https://*.jiohotstar.com/*',
];
const PROVIDER_PATTERNS = [
  { provider: 'netflix', pattern: /netflix\.com/i },
  { provider: 'prime', pattern: /primevideo\.com|amazon\.com\/gp\/video/i },
  { provider: 'hotstar', pattern: /hotstar\.com|jiohotstar\.com/i },
];

let socket = null;
let activeConfig = null;
let eventQueue = [];
let lastStatus = {
  connected: false,
  connecting: false,
  canControlPlayback: false,
  provider: '',
  roomCode: '',
  message: 'Not connected.',
  error: '',
  hasVideo: false,
  userId: '',
};

function normalizeBackendUrl(url) {
  return (url || '').trim().replace(/\/$/, '');
}

function detectProvider(url = '') {
  return PROVIDER_PATTERNS.find((entry) => entry.pattern.test(url))?.provider || '';
}

async function getConfig() {
  return chrome.storage.local.get(STORAGE_KEYS);
}

async function queryWatchTabs() {
  return chrome.tabs.query({ url: WATCH_URLS });
}

async function broadcastToContent(message) {
  const tabs = await queryWatchTabs();
  await Promise.all(
    tabs.map((tab) => {
      if (!tab.id) return Promise.resolve();
      return chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    })
  );
}

function setStatus(patch) {
  lastStatus = { ...lastStatus, ...patch };
  chrome.storage.local.set({ extensionStatus: lastStatus }).catch(() => {});
  broadcastToContent({ type: 'watchparty:status', ...lastStatus }).catch(() => {});
}

function disconnect(message = 'Disconnected.') {
  socket?.disconnect();
  socket = null;
  activeConfig = null;
  eventQueue = [];
  setStatus({ connected: false, connecting: false, canControlPlayback: false, message });
}

function friendlyError(message = '') {
  const text = String(message || '');
  if (/expired|jwt|token|invalid/i.test(text)) return 'Invalid or expired token. Refresh the token from the web app.';
  if (/room not found/i.test(text)) return 'Room not found. Check the room code.';
  if (/ott-sync|source/i.test(text)) return 'Wrong source selected. Choose OTT / Hotstar in the WatchParty room.';
  return text || 'Extension sync error.';
}

function flushQueue() {
  if (!socket?.connected || !lastStatus.canControlPlayback) return;
  const pending = eventQueue.splice(0, 20);
  pending.forEach((message) => relayPlayerEvent(message));
}

async function connect() {
  const config = await getConfig();
  const backendUrl = normalizeBackendUrl(config.backendUrl);
  const roomCode = (config.roomCode || '').trim().toUpperCase();
  const token = (config.token || '').trim();

  if (!backendUrl || !roomCode || !token) {
    disconnect('Backend URL, room code, and token are required.');
    return { ok: false, message: lastStatus.message };
  }

  const nextConfigKey = `${backendUrl}|${roomCode}|${token}`;
  if (socket && activeConfig === nextConfigKey) {
    if (!socket.connected) socket.connect();
    return { ok: true, message: lastStatus.message || 'Connecting...' };
  }

  disconnect('Connecting...');
  activeConfig = nextConfigKey;
  setStatus({ connecting: true, roomCode, error: '', message: 'Connecting...' });

  socket = io(backendUrl, {
    transports: ['websocket'],
    auth: { extensionToken: token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    timeout: 12000,
  });

  socket.on('connect', () => {
    setStatus({ connected: true, connecting: true, roomCode, message: 'Joining room...' });
    socket.emit('extension:join', { roomCode, token });
  });

  socket.on('connect_error', (error) => {
    const authFailed = /jwt|auth|token/i.test(error?.message || '');
    setStatus({
      connected: false,
      connecting: false,
      canControlPlayback: false,
      error: authFailed ? 'Invalid or expired token. Refresh the token from the web app.' : 'Backend unreachable.',
      message: authFailed ? 'Invalid or expired token. Refresh the token from the web app.' : 'Backend unreachable. Check the Socket.IO URL.',
    });
  });

  socket.on('extension:joined', (payload = {}) => {
    setStatus({
      connected: true,
      connecting: false,
      roomCode,
      provider: payload.provider || lastStatus.provider,
      userId: payload.userId || lastStatus.userId,
      canControlPlayback: !!payload.canControlPlayback,
      message: payload.canControlPlayback ? 'Connected. This browser can control playback.' : 'Connected. Following host playback.',
      error: '',
    });
    flushQueue();
  });

  socket.on('extension:error', (payload = {}) => {
    const message = friendlyError(payload.message);
    setStatus({
      connected: socket?.connected || false,
      connecting: false,
      canControlPlayback: false,
      error: message,
      message,
    });
  });

  socket.on('room:state', ({ room } = {}) => {
    const source = room?.source || {};
    setStatus({
      provider: source.provider || lastStatus.provider,
      canControlPlayback:
        room?.ownerGuestId === lastStatus.userId ||
        room?.permissions?.controlPlayback === 'all',
    });
  });

  for (const eventName of ['player:play', 'player:pause', 'player:seek', 'player:heartbeat']) {
    socket.on(eventName, (payload) => {
      broadcastToContent({ type: 'watchparty:remote-player-event', eventName, payload });
    });
  }

  socket.on('disconnect', () => {
    setStatus({ connected: false, connecting: false, canControlPlayback: false, message: 'Disconnected. Reconnecting...' });
  });

  return { ok: true, message: 'Connecting...' };
}

async function relayPlayerEvent(message) {
  if (!socket?.connected) {
    eventQueue.push(message);
    await connect();
    return { ok: true, queued: true };
  }

  const config = await getConfig();
  const roomCode = (config.roomCode || '').trim().toUpperCase();
  if (!socket || !roomCode) return { ok: false, message: 'Not connected.' };
  if (!lastStatus.canControlPlayback) return { ok: false, message: 'This browser is following playback.' };

  socket.emit(message.eventName, {
    roomCode,
    sourceType: 'ott-sync',
    provider: message.provider,
    positionSec: message.positionSec,
    tabUrlHash: message.tabUrlHash,
    title: message.title,
    pageUrl: message.pageUrl,
    paused: message.paused,
    playbackRate: message.playbackRate,
  });

  return { ok: true };
}

async function getPopupStatus() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeUrl = tabs[0]?.url || '';
  return {
    ...lastStatus,
    activeProvider: detectProvider(activeUrl),
    activeTabUrl: activeUrl,
  };
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

  if (message?.type === 'watchparty:content-status') {
    setStatus({
      provider: message.provider || lastStatus.provider,
      hasVideo: !!message.hasVideo,
      message: message.message || lastStatus.message,
    });
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === 'watchparty:get-status') {
    getPopupStatus().then(sendResponse);
    return true;
  }

  return false;
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && detectProvider(tab.url || '')) {
    broadcastToContent({ type: 'watchparty:status', ...lastStatus }).catch(() => {});
  }
});

connect();
