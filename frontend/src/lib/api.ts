const API = process.env.NEXT_PUBLIC_API_URL;

export async function createRoom(payload: {
  name: string;
  sourceType: 'youtube' | 'local' | 'localStream' | 'ott-sync';
  sourceData: { url?: string; fileName?: string; sizeBytes?: number; durationSec?: number; ottPlatform?: string };
}) {
  const res = await fetch(`${API}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to create room');
  }
  return res.json();
}

export async function getRoom(code: string) {
  const res = await fetch(`${API}/rooms/${code.toUpperCase()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Room not found');
  return res.json();
}

export async function getRoomMessages(
  roomIdOrCode: string,
  options: { limit?: number; before?: string } = {}
) {
  const params = new URLSearchParams();
  params.set('limit', String(options.limit ?? 50));
  if (options.before) params.set('before', options.before);

  const res = await fetch(
    `${API}/rooms/${encodeURIComponent(roomIdOrCode)}/messages?${params.toString()}`,
    { cache: 'no-store' }
  );
  if (!res.ok) throw new Error('Failed to load messages');
  return res.json();
}
