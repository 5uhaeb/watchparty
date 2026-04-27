const DEFAULTS = {
  socketUrl: 'https://watchparty-6a3e.onrender.com',
  apiUrl: 'https://watchparty-6a3e.onrender.com/api',
  roomCode: '',
  displayName: ''
};

let settings = { ...DEFAULTS };
let guest = null;
let socket = null;
let video = null;
let applyingRemote = false;
let overlay = null;
let messageList = null;
let participantCount = null;
let statusPill = null;
let heartbeatId = null;

init();

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'watchparty:settings-updated') {
    reconnect();
  }
});

async function init() {
  buildOverlay();
  await reconnect();
  setInterval(findVideo, 1500);
}

async function reconnect() {
  settings = await chrome.storage.sync.get(DEFAULTS);
  settings.roomCode = String(settings.roomCode || '').toUpperCase();
  settings.socketUrl = trimTrailingSlash(settings.socketUrl || DEFAULTS.socketUrl);
  settings.apiUrl = trimTrailingSlash(settings.apiUrl || DEFAULTS.apiUrl);
  updateStatus(settings.roomCode ? 'Connecting' : 'Set room');
  if (socket) socket.disconnect();
  if (heartbeatId) clearInterval(heartbeatId);
  if (!settings.roomCode) {
    addSystem('Open the extension popup and enter a WatchParty room code.');
    return;
  }
  guest = await bootstrapGuest();
  if (!guest) return;
  connectSocket();
}

async function bootstrapGuest() {
  try {
    const stored = await chrome.storage.local.get(['guestToken', 'guestId', 'displayName']);
    const response = await fetch(`${settings.apiUrl}/guest/bootstrap`, {
      method: 'POST',
      headers: stored.guestToken ? { 'x-guest-token': stored.guestToken } : {},
      credentials: 'omit'
    });
    if (!response.ok) throw new Error(`Guest bootstrap failed: ${response.status}`);
    const data = await response.json();
    const displayName = settings.displayName || data.displayName || stored.displayName || 'Guest';
    const next = {
      guestToken: data.token,
      guestId: data.guestId,
      displayName
    };
    await chrome.storage.local.set(next);
    return next;
  } catch (error) {
    console.error('[WatchParty] bootstrap failed', error);
    updateStatus('Auth failed');
    addSystem('Could not connect to WatchParty. Check API URL in the extension popup.');
    return null;
  }
}

function connectSocket() {
  socket = io(settings.socketUrl, {
    transports: ['websocket', 'polling'],
    auth: { token: guest.guestToken },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000
  });

  socket.on('connect', () => {
    updateStatus('Connected');
    socket.emit('room:join', {
      roomCode: settings.roomCode,
      user: { id: guest.guestId, name: guest.displayName }
    });
    socket.emit('chat:history', { roomCode: settings.roomCode });
    socket.emit('player:state', { roomCode: settings.roomCode });
    attachVideoEvents();
    heartbeatId = setInterval(sendHeartbeat, 3000);
  });

  socket.on('disconnect', () => updateStatus('Reconnecting'));
  socket.on('connect_error', (error) => {
    console.error('[WatchParty] socket error', error.message);
    updateStatus('Socket error');
  });
  socket.on('room:presence', (payload) => setParticipantCount(payload?.members?.length || 1));
  socket.on('room:state', (payload) => {
    if (payload?.room?.participants) setParticipantCount(payload.room.participants.length);
  });
  socket.on('chat:history', (messages) => {
    clearMessages();
    (messages || []).slice(-30).forEach(addChatMessage);
  });
  socket.on('chat:new', addChatMessage);
  socket.on('player:play', (payload) => applyPlayback({ ...payload, isPlaying: true }));
  socket.on('player:pause', (payload) => applyPlayback({ ...payload, isPlaying: false }));
  socket.on('player:seek', (payload) => applyPlayback(payload, true));
  socket.on('player:heartbeat', (payload) => applyPlayback({ ...payload, isPlaying: true }));
  socket.on('player:state', (payload) => applyPlayback({
    ...payload,
    wallClockMs: payload.wallClockMs || payload.serverTs,
  }, true));
  socket.on('reconnect:sync', (payload) => applyPlayback({
    positionSec: payload.currentTime || payload.positionSec || 0,
    wallClockMs: payload.wallClockMs || payload.atServerTs,
    isPlaying: payload.isPlaying,
  }, true));
}

function buildOverlay() {
  if (overlay) return;
  overlay = document.createElement('section');
  overlay.id = 'watchparty-companion';
  overlay.innerHTML = `
    <div class="wp-topbar">
      <div class="wp-title">WatchParty</div>
      <div class="wp-pill" id="wp-status">Offline</div>
      <div class="wp-pill" id="wp-count">1</div>
      <button class="wp-icon" id="wp-sync" title="Sync now">Sync</button>
      <button class="wp-icon" id="wp-collapse" title="Collapse">-</button>
    </div>
    <div class="wp-reactions">
      <button>😂</button><button>😍</button><button>😱</button><button>😡</button><button>👍</button><button>💔</button>
    </div>
    <div class="wp-body" id="wp-messages"></div>
    <form class="wp-composer" id="wp-form">
      <input id="wp-input" placeholder="Type message here..." autocomplete="off">
      <button>Send</button>
    </form>
  `;
  document.documentElement.appendChild(overlay);
  messageList = overlay.querySelector('#wp-messages');
  participantCount = overlay.querySelector('#wp-count');
  statusPill = overlay.querySelector('#wp-status');
  overlay.querySelector('#wp-collapse').addEventListener('click', () => overlay.classList.toggle('wp-collapsed'));
  overlay.querySelector('#wp-sync').addEventListener('click', requestManualSync);
  overlay.querySelector('#wp-form').addEventListener('submit', sendChat);
  overlay.querySelectorAll('.wp-reactions button').forEach((button) => {
    button.addEventListener('click', () => sendReaction(button.textContent));
  });
  addSystem('Open the extension popup, enter a WatchParty room code, then watch together.');
}

function sendChat(event) {
  event.preventDefault();
  const input = overlay.querySelector('#wp-input');
  const text = input.value.trim();
  if (!text || !socket?.connected) return;
  socket.emit('chat:send', {
    roomCode: settings.roomCode,
    userName: guest.displayName,
    text
  });
  input.value = '';
}

function sendReaction(emoji) {
  if (!socket?.connected) return;
  socket.emit('chat:send', {
    roomCode: settings.roomCode,
    userName: guest.displayName,
    text: emoji
  });
  showToast(emoji);
}

function addChatMessage(message) {
  if (!messageList || !message?.text) return;
  const row = document.createElement('div');
  row.className = 'wp-msg';
  row.innerHTML = `<strong></strong><span></span>`;
  row.querySelector('strong').textContent = message.username || message.userName || 'Guest';
  row.querySelector('span').textContent = message.text;
  messageList.appendChild(row);
  while (messageList.children.length > 60) messageList.firstElementChild?.remove();
  messageList.scrollTop = messageList.scrollHeight;
}

function addSystem(text) {
  addChatMessage({ username: 'System', text });
}

function clearMessages() {
  if (messageList) messageList.innerHTML = '';
}

function findVideo() {
  const next = Array.from(document.querySelectorAll('video')).find((item) => item.readyState >= 0);
  if (!next || next === video) return;
  if (video) detachVideoEvents(video);
  video = next;
  attachVideoEvents();
  updateStatus(socket?.connected ? 'Connected' : 'No socket');
}

function attachVideoEvents() {
  findVideoOnce();
  if (!video || video.dataset.watchpartyAttached === 'true') return;
  video.dataset.watchpartyAttached = 'true';
  video.addEventListener('play', sendPlay);
  video.addEventListener('pause', sendPause);
  video.addEventListener('seeked', sendSeek);
  video.addEventListener('ratechange', sendHeartbeat);
  updateStatus(socket?.connected ? 'Connected' : 'Video ready');
}

function detachVideoEvents(target) {
  target.removeEventListener('play', sendPlay);
  target.removeEventListener('pause', sendPause);
  target.removeEventListener('seeked', sendSeek);
  target.removeEventListener('ratechange', sendHeartbeat);
  delete target.dataset.watchpartyAttached;
}

function findVideoOnce() {
  if (!video) video = document.querySelector('video');
}

function playbackPayload() {
  if (!video) return null;
  return {
    roomCode: settings.roomCode,
    userId: guest?.guestId,
    positionSec: Math.max(0, video.currentTime || 0),
    mediaTimeMs: Math.round(Math.max(0, video.currentTime || 0) * 1000),
    wallClockMs: Date.now(),
    playbackRate: video.playbackRate || 1,
    sourceType: 'hotstar-extension',
    title: document.title,
    pageUrl: location.href,
  };
}

function sendPlay() {
  if (applyingRemote || !socket?.connected) return;
  const payload = playbackPayload();
  if (payload) socket.emit('player:play', payload);
}

function sendPause() {
  if (applyingRemote || !socket?.connected) return;
  const payload = playbackPayload();
  if (payload) socket.emit('player:pause', payload);
}

function sendSeek() {
  if (applyingRemote || !socket?.connected) return;
  const payload = playbackPayload();
  if (payload) socket.emit('player:seek', payload);
}

function sendHeartbeat() {
  if (applyingRemote || !socket?.connected || !video || video.paused) return;
  const payload = playbackPayload();
  if (payload) socket.emit('player:heartbeat', payload);
}

function applyPlayback(payload, force = false) {
  if (!payload || payload.byUserId === guest?.guestId) return;
  findVideoOnce();
  if (!video) return;

  const base = Number.isFinite(payload.mediaTimeMs)
    ? payload.mediaTimeMs / 1000
    : Number(payload.positionSec || payload.currentTime || 0);
  const wallClockMs = payload.wallClockMs || payload.atServerTs || payload.serverTs || Date.now();
  const shouldPlay = payload.isPlaying ?? !video.paused;
  const elapsed = shouldPlay ? Math.max(0, (Date.now() - wallClockMs) / 1000) : 0;
  const target = Math.max(0, base + elapsed);
  const drift = target - (video.currentTime || 0);

  applyingRemote = true;
  try {
    if (force || Math.abs(drift) > 0.4) {
      video.currentTime = target;
      video.playbackRate = 1;
    } else if (Math.abs(drift) > 0.1 && shouldPlay) {
      video.playbackRate = drift > 0 ? 1.03 : 0.97;
      setTimeout(() => { if (video) video.playbackRate = 1; }, 1500);
    }
    if (shouldPlay) video.play().catch(() => null);
    else video.pause();
  } finally {
    setTimeout(() => { applyingRemote = false; }, 700);
  }
}

function requestManualSync() {
  if (!socket?.connected) return;
  socket.timeout(3000).emit('player:manual-sync', { roomCode: settings.roomCode }, (_error, payload) => {
    if (payload) applyPlayback({ ...payload, wallClockMs: payload.wallClockMs || payload.serverTs }, true);
    showToast('Synced to host');
  });
}

function updateStatus(text) {
  if (statusPill) statusPill.textContent = text;
}

function setParticipantCount(count) {
  if (participantCount) participantCount.textContent = String(count || 1);
}

function showToast(text) {
  const toast = document.createElement('div');
  toast.className = 'wp-toast';
  toast.textContent = text;
  document.documentElement.appendChild(toast);
  setTimeout(() => toast.remove(), 1400);
}

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}
