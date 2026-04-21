const fields = {
  backendUrl: document.getElementById('backendUrl'),
  webAppUrl: document.getElementById('webAppUrl'),
  roomCode: document.getElementById('roomCode'),
  token: document.getElementById('token'),
};

const statusEl = document.getElementById('status');

function setStatus(message) {
  statusEl.textContent = message;
}

async function loadSettings() {
  const saved = await chrome.storage.local.get(['backendUrl', 'webAppUrl', 'roomCode', 'token']);
  fields.backendUrl.value = saved.backendUrl || 'http://localhost:5000';
  fields.webAppUrl.value = saved.webAppUrl || 'http://localhost:3000';
  fields.roomCode.value = saved.roomCode || '';
  fields.token.value = saved.token || '';
}

async function saveAndConnect() {
  const payload = {
    backendUrl: fields.backendUrl.value.trim(),
    webAppUrl: fields.webAppUrl.value.trim(),
    roomCode: fields.roomCode.value.trim().toUpperCase(),
    token: fields.token.value.trim(),
  };

  await chrome.storage.local.set(payload);
  const response = await chrome.runtime.sendMessage({ type: 'watchparty:connect' });
  setStatus(response?.message || (response?.ok ? 'Connected.' : 'Connection failed.'));
}

async function openTokenPage() {
  const webAppUrl = fields.webAppUrl.value.trim().replace(/\/$/, '');
  if (!webAppUrl) {
    setStatus('Enter the web app URL first.');
    return;
  }
  await chrome.storage.local.set({ webAppUrl });
  chrome.tabs.create({ url: `${webAppUrl}/api/extension/token` });
}

document.getElementById('save').addEventListener('click', saveAndConnect);
document.getElementById('openToken').addEventListener('click', openTokenPage);

loadSettings();
