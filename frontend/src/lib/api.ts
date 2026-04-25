import { guestAuthHeaders } from './guestToken';
import { API_URL } from './env';

export async function createRoom(payload: { title?: string } = {}) {
  const res = await fetch(`${API_URL}/rooms`, {
    method: 'POST',
    headers: guestAuthHeaders({ 'Content-Type': 'application/json' }),
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
  const res = await fetch(`${API_URL}/rooms/${code.toUpperCase()}`, { cache: 'no-store' });
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
    `${API_URL}/rooms/${encodeURIComponent(roomIdOrCode)}/messages?${params.toString()}`,
    { cache: 'no-store' }
  );
  if (!res.ok) throw new Error('Failed to load messages');
  return res.json();
}
