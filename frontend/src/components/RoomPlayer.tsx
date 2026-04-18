'use client';

import { useEffect, useRef, useState } from 'react';
import { socket } from '@/lib/socket';
import YouTubePlayer from './YouTubePlayer';

interface Props {
  roomCode: string;
  videoUrl?: string;
  sourceType?: string;
  isHost?: boolean;
  currentUserId?: string;
}

export default function RoomPlayer({ roomCode, videoUrl, sourceType = 'youtube', isHost = false, currentUserId }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isSyncingRef = useRef(false); // prevents echo on remote-triggered events

  // Local file state (host only)
  const [localBlobUrl, setLocalBlobUrl] = useState<string | null>(null);
  const [localFileName, setLocalFileName] = useState<string | null>(null);

  const effectiveUrl = sourceType === 'local' ? (localBlobUrl || videoUrl) : videoUrl;

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (localBlobUrl) URL.revokeObjectURL(localBlobUrl);
    };
  }, [localBlobUrl]);

  // Sync logic for HTML5 video (local / mp4-url)
  useEffect(() => {
    if (sourceType === 'youtube') return;
    const video = videoRef.current;
    if (!video) return;

    const emit = (isPlaying: boolean) => {
      if (isSyncingRef.current) return;
      socket.emit('playback:update', {
        roomCode,
        userId: currentUserId,
        playback: { isPlaying, currentTime: video.currentTime }
      });
    };

    const onPlay = () => emit(true);
    const onPause = () => emit(false);
    const onSeeked = () => emit(!video.paused);

    const onRemoteUpdate = (playback: { isPlaying: boolean; currentTime: number }) => {
      isSyncingRef.current = true;
      if (Math.abs(video.currentTime - playback.currentTime) > 1.5) {
        video.currentTime = playback.currentTime;
      }
      if (playback.isPlaying && video.paused) video.play().catch(() => {});
      if (!playback.isPlaying && !video.paused) video.pause();
      setTimeout(() => { isSyncingRef.current = false; }, 300);
    };

    const onReconnectSync = (playback: { isPlaying: boolean; currentTime: number }) => {
      video.currentTime = playback.currentTime;
      if (playback.isPlaying) video.play().catch(() => {});
    };

    if (isHost) {
      video.addEventListener('play', onPlay);
      video.addEventListener('pause', onPause);
      video.addEventListener('seeked', onSeeked);
    }
    socket.on('playback:update', onRemoteUpdate);
    socket.on('reconnect:sync', onReconnectSync);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('seeked', onSeeked);
      socket.off('playback:update', onRemoteUpdate);
      socket.off('reconnect:sync', onReconnectSync);
    };
  }, [roomCode, sourceType, isHost, currentUserId, effectiveUrl]);

  // ── Local file picker (host only) ──────────────────────────────────────────
  if (sourceType === 'local' && isHost && !localBlobUrl && !videoUrl) {
    return (
      <div className="card glass" style={{ aspectRatio: '16/9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem' }}>📁</div>
        <h3 style={{ margin: 0 }}>Load Local Video</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0, maxWidth: '320px' }}>
          As host, pick a local file. Your playback controls will sync to everyone else.
          Other participants should load the same file on their end.
        </p>
        <label className="button" style={{ cursor: 'pointer' }}>
          Choose File
          <input
            type="file"
            accept="video/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setLocalBlobUrl(URL.createObjectURL(file));
              setLocalFileName(file.name);
            }}
          />
        </label>
      </div>
    );
  }

  // ── Participant local-file prompt ──────────────────────────────────────────
  if (sourceType === 'local' && !isHost && !videoUrl && !localBlobUrl) {
    return (
      <div className="card glass" style={{ aspectRatio: '16/9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem' }}>📁</div>
        <h3 style={{ margin: 0 }}>Load Local Video</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0, maxWidth: '320px' }}>
          The host is watching a local file. Load the same file here — playback will be synced automatically.
        </p>
        <label className="button" style={{ cursor: 'pointer' }}>
          Choose Same File
          <input
            type="file"
            accept="video/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setLocalBlobUrl(URL.createObjectURL(file));
              setLocalFileName(file.name);
            }}
          />
        </label>
      </div>
    );
  }

  // ── No URL set at all ─────────────────────────────────────────────────────
  if (!effectiveUrl && sourceType !== 'ott-sync') {
    return (
      <div className="card glass" style={{ aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🎬</div>
          <h3 style={{ margin: '0 0 8px' }}>No Media Source</h3>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>Waiting for a video link…</p>
        </div>
      </div>
    );
  }

  // ── OTT Sync info panel ───────────────────────────────────────────────────
  if (sourceType === 'ott-sync') {
    return (
      <div className="card glass" style={{ aspectRatio: '16/9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '2.5rem' }}>📺</div>
        <h3 style={{ margin: 0 }}>OTT Sync Mode</h3>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '420px', fontSize: '0.9rem', lineHeight: 1.6 }}>
          Open your OTT platform (Netflix / Prime / Hotstar) in another tab and play the title.
          Use the controls below to sync play/pause/seek with your watch party.
        </p>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontStyle: 'italic', margin: 0 }}>
          Note: Direct embedding of OTT platforms is blocked by those services. This mode syncs
          your control events only — each user opens the platform independently.
        </p>
        {isHost && (
          <OttControls roomCode={roomCode} currentUserId={currentUserId} />
        )}
        {!isHost && (
          <div style={{ padding: '12px 24px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '10px', fontSize: '0.9rem' }}>
            Host will control sync. Keep your player open and follow along.
          </div>
        )}
      </div>
    );
  }

  // ── YouTube ───────────────────────────────────────────────────────────────
  if (sourceType === 'youtube') {
    return <YouTubePlayer roomCode={roomCode} videoUrl={effectiveUrl!} isHost={isHost} currentUserId={currentUserId} />;
  }

  // ── HTML5 video (local blob or direct URL) ────────────────────────────────
  return (
    <div className="card glass" style={{ padding: 0, overflow: 'hidden', borderRadius: '16px' }}>
      {localFileName && (
        <div style={{ padding: '8px 16px', background: 'rgba(0,0,0,0.4)', fontSize: '0.8rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
          {localFileName}
          {isHost && <span style={{ marginLeft: '8px', color: 'var(--primary)' }}>(Host — controls broadcast to all)</span>}
          {!isHost && <span style={{ marginLeft: '8px', color: 'var(--text-secondary)' }}>(synced to host)</span>}
        </div>
      )}
      <video
        ref={videoRef}
        src={effectiveUrl}
        controls={isHost}
        style={{ display: 'block', width: '100%', background: '#000' }}
      />
    </div>
  );
}

// OTT manual sync controls for host
function OttControls({ roomCode, currentUserId }: { roomCode: string; currentUserId?: string }) {
  const [time, setTime] = useState('0');

  const broadcast = (isPlaying: boolean) => {
    socket.emit('playback:update', {
      roomCode,
      userId: currentUserId,
      playback: { isPlaying, currentTime: parseFloat(time) || 0 }
    });
  };

  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
      <input
        type="number"
        value={time}
        onChange={e => setTime(e.target.value)}
        placeholder="Time (seconds)"
        style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', width: '140px', fontSize: '0.9rem' }}
      />
      <button className="button" onClick={() => broadcast(true)} style={{ padding: '8px 20px' }}>
        ▶ Play All
      </button>
      <button className="button button-secondary" onClick={() => broadcast(false)} style={{ padding: '8px 20px' }}>
        ⏸ Pause All
      </button>
    </div>
  );
}
