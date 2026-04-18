const API = process.env.NEXT_PUBLIC_API_URL;

export async function createRoom(payload: {
  name: string;
  hostUserId: string;
  sourceType: 'youtube' | 'local' | 'ott-sync';
  sourceData: { url?: string; fileName?: string; ottPlatform?: string };
}) {
  const res = await fetch(`${API}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
