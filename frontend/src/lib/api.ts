export async function createRoom(payload: {
  name: string;
  hostUserId: string;
  sourceType: 'youtube' | 'local' | 'ott-sync';
  sourceData: { url?: string; fileName?: string; ottPlatform?: string };
}) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) throw new Error('Failed to create room');
  return res.json();
}

export async function getRoom(code: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/rooms/${code}`, {
    cache: 'no-store'
  });

  if (!res.ok) throw new Error('Failed to load room');
  return res.json();
}
