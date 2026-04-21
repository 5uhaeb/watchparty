'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { createRoom } from '@/lib/api';

export default function CreateRoomPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [name, setName] = useState('Friday Watch Party');
  const [sourceType, setSourceType] = useState<'youtube' | 'local' | 'ott-sync'>('youtube');
  const [url, setUrl] = useState('');
  const [ottPlatform, setOttPlatform] = useState('netflix');
  const [loading, setLoading] = useState(false);

  if (!session?.user) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <div className="card glass" style={{ textAlign: 'center', maxWidth: '400px' }}>
          <div className="label-tag" style={{ marginBottom: '12px' }}>Sign in</div>
          <h2>Authentication required</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
            Please log in to create and host your own watch party rooms.
          </p>
          <button className="button" onClick={() => signIn('google')}>
            Login with Google
          </button>
        </div>
      </div>
    );
  }

  const handleCreate = async () => {
    try {
      setLoading(true);
      const payload = {
        name,
        hostUserId: session.user.email || session.user.name || 'host',
        sourceType,
        sourceData:
          sourceType === 'ott-sync'
            ? { ottPlatform }
            : { url }
      };

      const room = await createRoom(payload);
      router.push(`/room/${room.code}`);
    } catch (error) {
      alert('Failed to create room');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <header style={{ textAlign: 'center', marginBottom: '32px' }}>
        <h1>Create a room</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Host a synchronized viewing experience</p>
      </header>

      <div className="card glass" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <label className="label-tag" style={{ display: 'block', marginBottom: '8px' }}>
            Room name
          </label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Movie Night" />
        </div>

        <div>
          <label className="label-tag" style={{ display: 'block', marginBottom: '8px' }}>
            Source type
          </label>
          <select className="select" value={sourceType} onChange={(e) => setSourceType(e.target.value as 'youtube' | 'local' | 'ott-sync')}>
            <option value="youtube">YouTube video</option>
            <option value="local">MP4 / local link</option>
            <option value="ott-sync">OTT sync</option>
          </select>
        </div>

        {sourceType === 'ott-sync' ? (
          <div>
            <label className="label-tag" style={{ display: 'block', marginBottom: '8px' }}>
              Platform
            </label>
            <select className="select" value={ottPlatform} onChange={(e) => setOttPlatform(e.target.value)}>
              <option value="netflix">Netflix</option>
              <option value="prime">Prime Video</option>
              <option value="hotstar">Hotstar</option>
            </select>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
              Note: OTT sync mode is for metadata synchronization only. Content is not rebroadcasted.
            </p>
          </div>
        ) : (
          <div>
            <label className="label-tag" style={{ display: 'block', marginBottom: '8px' }}>
              {sourceType === 'youtube' ? 'YouTube URL' : 'Video URL'}
            </label>
            <input
              className="input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={sourceType === 'youtube' ? 'https://www.youtube.com/watch?v=...' : 'https://example.com/video.mp4'}
            />
          </div>
        )}

        <button className="button" style={{ marginTop: '12px', width: '100%' }} onClick={handleCreate} disabled={loading}>
          {loading ? 'Initializing experience...' : 'Create watch party'}
        </button>
      </div>
    </div>
  );
}
