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

export default function RoomPlayer({
  roomCode,
  videoUrl,
  sourceType = 'youtube',
  isHost = false,
  currentUserId,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isSyncingRef = useRef(false);

  const [localBlobUrl, setLocalBlobUrl] = useState<string | null>(null);
  const [localFileName, setLocalFileName] = useState<string | null>(null);

  const effectiveUrl =
    sourceType === 'local' ? localBlobUrl || videoUrl : videoUrl;

  useEffect(() => {
    return () => {
      if (localBlobUrl) URL.revokeObjectURL(localBlobUrl);
    };
  }, [localBlobUrl]);

  useEffect(() => {
    if (sourceType === 'youtube' || sourceType === 'ott-sync') return;

    const video = videoRef.current;
    if (!video) return;

    const emitPlayback = () => {
      if (isSyncingRef.current) return;

      socket.emit('playback:update', {
        roomCode,
        userId: currentUserId,
        playback: {
          isPlaying: !video.paused,
          currentTime: video.currentTime,
        },
      });
    };

    const onPlay = () => emitPlayback();
    const onPause = () => emitPlayback();
    const onSeeked = () => emitPlayback();

    const onRemoteUpdate = (playback: {
      isPlaying: boolean;
      currentTime: number;
    }) => {
      isSyncingRef.current = true;

      if (Math.abs(video.currentTime - playback.currentTime) > 1.2) {
        video.currentTime = playback.currentTime;
      }

      if (playback.isPlaying && video.paused) {
        video.play().catch(() => {});
      }

      if (!playback.isPlaying && !video.paused) {
        video.pause();
      }

      window.setTimeout(() => {
        isSyncingRef.current = false;
      }, 300);
    };

    const onReconnectSync = (playback: {
      isPlaying: boolean;
      currentTime: number;
    }) => {
      video.currentTime = playback.currentTime;
      if (playback.isPlaying) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('seeked', onSeeked);

    socket.on('playback:update', onRemoteUpdate);
    socket.on('reconnect:sync', onReconnectSync);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('seeked', onSeeked);
      socket.off('playback:update', onRemoteUpdate);
      socket.off('reconnect:sync', onReconnectSync);
    };
  }, [roomCode, sourceType, currentUserId, effectiveUrl]);

  const syncNow = () => {
    const video = videoRef.current;
    if (!video) return;

    socket.emit('playback:update', {
      roomCode,
      userId: currentUserId,
      playback: {
        isPlaying: !video.paused,
        currentTime: video.currentTime,
      },
    });
  };

  const enterFullscreen = async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (video.requestFullscreen) {
        await video.requestFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen failed', err);
    }
  };

  if (sourceType === 'local' && isHost && !localBlobUrl && !videoUrl) {
    return (
      <div>
        <h3>Load Local Video</h3>
        <p>
          As host, pick a local file. Playback changes will sync to everyone
          else.
        </p>
        <input
          type="file"
          accept="video/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setLocalBlobUrl(URL.createObjectURL(file));
            setLocalFileName(file.name);
          }}
        />
      </div>
    );
  }

  if (sourceType === 'local' && !isHost && !videoUrl && !localBlobUrl) {
    return (
      <div>
        <h3>Load Local Video</h3>
        <p>
          The host is watching a local file. Load the same file here and it will
          sync.
        </p>
        <input
          type="file"
          accept="video/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setLocalBlobUrl(URL.createObjectURL(file));
            setLocalFileName(file.name);
          }}
        />
      </div>
    );
  }

  if (!effectiveUrl && sourceType !== 'ott-sync') {
    return (
      <div>
        <h3>No Media Source</h3>
        <p>Waiting for a video link…</p>
      </div>
    );
  }

  if (sourceType === 'ott-sync') {
    return (
      <OttControls roomCode={roomCode} currentUserId={currentUserId} />
    );
  }

  if (sourceType === 'youtube') {
    return (
      <YouTubePlayer
        roomCode={roomCode}
        videoUrl={videoUrl || ''}
        isHost={isHost}
        currentUserId={currentUserId}
      />
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <button onClick={syncNow} style={{ padding: '8px 14px' }}>
          Sync Now
        </button>
        <button onClick={enterFullscreen} style={{ padding: '8px 14px' }}>
          Full Screen
        </button>
      </div>

      {localFileName && (
        <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>{localFileName}</div>
      )}

      <video
        ref={videoRef}
        src={effectiveUrl}
        controls
        playsInline
        style={{
          width: '100%',
          borderRadius: 16,
          background: '#000',
        }}
      />
    </div>
  );
}

function OttControls({
  roomCode,
  currentUserId,
}: {
  roomCode: string;
  currentUserId?: string;
}) {
  const [time, setTime] = useState('0');

  const broadcast = (isPlaying: boolean) => {
    socket.emit('playback:update', {
      roomCode,
      userId: currentUserId,
      playback: {
        isPlaying,
        currentTime: parseFloat(time) || 0,
      },
    });
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <h3>OTT Sync Mode</h3>
      <p>
        Open Netflix / Prime / Hotstar in another tab. Everyone can use the
        sync controls below.
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input
          value={time}
          onChange={(e) => setTime(e.target.value)}
          placeholder="Time (seconds)"
          style={{
            padding: '8px 12px',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'rgba(255,255,255,0.05)',
            color: 'var(--text-primary)',
            width: 140,
            fontSize: '0.9rem',
          }}
        />
        <button onClick={() => broadcast(true)} style={{ padding: '8px 20px' }}>
          ▶ Play All
        </button>
        <button
          onClick={() => broadcast(false)}
          style={{ padding: '8px 20px' }}
        >
          ⏸ Pause All
        </button>
      </div>
    </div>
  );
}
