'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createRoom } from '@/lib/api';
import { useGuest } from '@/components/GuestProvider';

export default function CreateRoomPage() {
  const router = useRouter();
  const { guest, updateName } = useGuest();
  const [title, setTitle] = useState('');
  const [nameDraft, setNameDraft] = useState(guest?.displayName || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (guest?.displayName) setNameDraft(guest.displayName);
  }, [guest?.displayName]);

  const handleCreate = async () => {
    try {
      setLoading(true);
      setError('');
      const nextName = nameDraft.trim();
      if (nextName && nextName !== guest?.displayName) {
        await updateName(nextName);
      }
      const room = await createRoom(title.trim() ? { title } : {});
      router.push(`/room/${room.code}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not create the room. Please try again.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="narrow-page">
      <header style={{ textAlign: 'center', marginBottom: '32px' }}>
        <h1>Create a room</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Start empty, then pick YouTube or a local stream inside the room.
        </p>
      </header>

      <div className="card glass form-stack">
        <label style={{ display: 'grid', gap: 8 }}>
          <span className="label-tag">Display name</span>
          <input
            className="input"
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            maxLength={24}
            placeholder="Your guest name"
          />
        </label>

        <label style={{ display: 'grid', gap: 8 }}>
          <span className="label-tag">Optional title</span>
          <input
            className="input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleCreate()}
            maxLength={60}
            placeholder="Untitled room"
          />
        </label>

        <button className="button" style={{ width: '100%' }} onClick={handleCreate} disabled={loading} aria-describedby={error ? 'create-room-error' : undefined}>
          {loading ? 'Creating...' : 'Create room'}
        </button>
        {error && <p id="create-room-error" role="alert" style={{ margin: 0, color: 'var(--red)' }}>{error}</p>}
      </div>
    </div>
  );
}
