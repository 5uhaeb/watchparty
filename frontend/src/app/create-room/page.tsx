'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createRoom } from '@/lib/api';
import { validateVideoFormat } from '@/lib/videoFormats';

export default function CreateRoomPage() {
  const router = useRouter();
  const [name, setName] = useState('Friday Watch Party');
  const [sourceType, setSourceType] = useState<'youtube' | 'local' | 'ott-sync'>('youtube');
  const [url, setUrl] = useState('');
  const [ottPlatform, setOttPlatform] = useState('netflix');
  const [loading, setLoading] = useState(false);
  const [formatValidation, setFormatValidation] = useState<{ supported: boolean; message: string } | null>(null);

  const validateVideoUrl = (urlString: string): void => {
    if (!urlString) {
      setFormatValidation(null);
      return;
    }
    const result = validateVideoFormat(urlString);
    setFormatValidation(result);
  };

  const handleCreate = async () => {
    try {
      setLoading(true);
      const payload = {
        name,
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
    <div className="narrow-page">
      <header style={{ textAlign: 'center', marginBottom: '32px' }}>
        <h1>Create a room</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Host a synchronized viewing experience</p>
      </header>

      <div className="card glass form-stack">
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
            <option value="local">Video file (MP4, WebM, MOV, and more)</option>
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
              onChange={(e) => {
                setUrl(e.target.value);
                if (sourceType === 'local' && e.target.value) {
                  validateVideoUrl(e.target.value);
                } else {
                  setFormatValidation(null);
                }
              }}
              placeholder={sourceType === 'youtube' ? 'https://www.youtube.com/watch?v=...' : 'https://example.com/video.mp4'}
            />
            {sourceType === 'local' && (
              <>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: '1.4' }}>
                  <strong>Browser-native formats:</strong> MP4, WebM, Ogg, MOV, AVI<br/>
                  <strong>May require conversion:</strong> MKV, FLV, WMV (→ convert to MP4 using ffmpeg/HandBrake)<br/>
                  <strong>Note:</strong> Ensure the video URL is publicly accessible.
                </p>
                {formatValidation && (
                  <p style={{
                    fontSize: '0.75rem',
                    color: formatValidation.supported ? 'var(--text-secondary)' : '#ff6b6b',
                    marginTop: '8px',
                    fontWeight: formatValidation.supported ? 400 : 500
                  }}>
                    {formatValidation.message}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        <button className="button" style={{ marginTop: '12px', width: '100%' }} onClick={handleCreate} disabled={loading}>
          {loading ? 'Initializing experience...' : 'Create watch party'}
        </button>
      </div>
    </div>
  );
}
