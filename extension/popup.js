const DEFAULTS = {
  socketUrl: 'https://watchparty-6a3e.onrender.com',
  apiUrl: 'https://watchparty-6a3e.onrender.com/api',
  roomCode: '',
  displayName: ''
};

const fields = ['roomCode', 'displayName', 'socketUrl', 'apiUrl'];

chrome.storage.sync.get(DEFAULTS, (settings) => {
  for (const field of fields) {
    document.getElementById(field).value = settings[field] || DEFAULTS[field];
  }
});

document.getElementById('save').addEventListener('click', async () => {
  const next = {};
  for (const field of fields) next[field] = document.getElementById(field).value.trim();
  next.roomCode = next.roomCode.toUpperCase();
  if (!next.roomCode) {
    setStatus('Enter a WatchParty room code.');
    return;
  }
  await chrome.storage.sync.set(next);
  setStatus('Saved. Refresh the Hotstar tab if the overlay does not reconnect.');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'watchparty:settings-updated' }).catch(() => null);
});

function setStatus(message) {
  document.getElementById('status').textContent = message;
}
