const fields = {
  backendUrl: document.getElementById('backendUrl'),
  webAppUrl: document.getElementById('webAppUrl'),
  roomCode: document.getElementById('roomCode'),
  token: document.getElementById('token'),
};

const statusEl = document.getElementById('status');
const connectionStateEl = document.getElementById('connectionState');
const providerStateEl = document.getElementById('providerState');
const videoStateEl = document.getElementById('videoState');
const controlStateEl = document.getElementById('controlState');

function setStatus(message) {
  statusEl.textContent = message;
}

function providerLabel(provider) {
  if (provider === 'hotstar') return 'Hotstar/JioHotstar';
  if (provider === 'prime') return 'Prime Video';
  if (provider === 'netflix') return 'Netflix';
  if (provider === 'ott') return 'Any supported OTT';
  return provider || 'Unknown';
}

function renderStatus(status = {}) {
  connectionStateEl.textContent = status.connected ? 'Connected' : status.connecting ? 'Connecting' : 'Not connected';
  providerStateEl.textContent = providerLabel(status.activeProvider || status.provider);
  videoStateEl.textContent = status.hasVideo ? 'Detected' : 'Not detected yet';
  controlStateEl.textContent = status.canControlPlayback ? 'Controller' : 'Follower';
  setStatus(status.error || status.message || '');
}

async function loadSettings() {
  const saved = await chrome.storage.local.get(['backendUrl', 'webAppUrl', 'roomCode', 'token', 'extensionStatus']);
  fields.backendUrl.value = saved.backendUrl || 'http://localhost:5000';
  fields.webAppUrl.value = saved.webAppUrl || 'http://localhost:3000';
  fields.roomCode.value = saved.roomCode || '';
  fields.token.value = saved.token || '';
  renderStatus(saved.extensionStatus || {});
  refreshStatus();
}

async function saveSettings() {
  const payload = {
    backendUrl: fields.backendUrl.value.trim(),
    webAppUrl: fields.webAppUrl.value.trim(),
    roomCode: fields.roomCode.value.trim().toUpperCase(),
    token: fields.token.value.trim(),
  };
  await chrome.storage.local.set(payload);
  return payload;
}

async function saveAndConnect() {
  await saveSettings();
  const response = await chrome.runtime.sendMessage({ type: 'watchparty:connect' });
  setStatus(response?.message || (response?.ok ? 'Connected.' : 'Connection failed.'));
  refreshStatus();
}

async function openTokenPage() {
  const { webAppUrl } = await saveSettings();
  if (!webAppUrl) {
    setStatus('Enter the web app URL first.');
    return;
  }
  chrome.tabs.create({ url: `${webAppUrl.replace(/\/$/, '')}/api/extension/token` });
}

async function openRoom() {
  const { webAppUrl, roomCode } = await saveSettings();
  if (!webAppUrl || !roomCode) {
    setStatus('Enter the web app URL and room code first.');
    return;
  }
  chrome.tabs.create({ url: `${webAppUrl.replace(/\/$/, '')}/room/${roomCode}` });
}

async function refreshStatus() {
  const status = await chrome.runtime.sendMessage({ type: 'watchparty:get-status' }).catch(() => null);
  if (status) renderStatus(status);
}

document.getElementById('save').addEventListener('click', saveAndConnect);
document.getElementById('openToken').addEventListener('click', openTokenPage);
document.getElementById('refreshToken').addEventListener('click', openTokenPage);
document.getElementById('openRoom').addEventListener('click', openRoom);

loadSettings();
window.setInterval(refreshStatus, 1500);
