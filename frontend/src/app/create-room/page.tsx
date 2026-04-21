'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createRoom } from '@/lib/api';

export default function CreateRoomPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    try {
      setLoading(true);
      const room = await createRoom(title.trim() ? { title } : {});
      router.push(`/room/${room.code}`);
    } catch (error) {
      alert('Failed to create room');
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

        <button className="button" style={{ width: '100%' }} onClick={handleCreate} disabled={loading}>
          {loading ? 'Creating...' : 'Create room'}
        </button>
      </div>
    </div>
  );
}
