'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from '@/lib/socket';
import LocalStreamPlayer from '@/components/LocalStreamPlayer';
import LocalFilePlayer from '@/players/LocalFilePlayer';
import YouTubePlayer from '@/players/YouTubePlayer';
import type { PlayerAdapter, PlayerState } from '@/players/types';

interface Props {
  roomCode: string;
  videoUrl?: string;
  sourceType?: string;
  sourceData?: any;
  localStreamFile?: File | null;
  isHost?: boolean;
  currentUserId?: string;
  onLocalStreamStopped?: () => void;
}

type TimedPlayback = {
  positionSec: number;
  atServerTs?: number;
  byUserId?: string;
};

export default function RoomPlayer({
  roomCode,
  videoUrl,
  sourceType = 'youtube',
  sourceData,
  localStreamFile,
  isHost = false,
  currentUserId,
  onLocalStreamStopped,
}: Props) {
  const playerRef = useRef<PlayerAdapter | null>(null);
  const isApplyingRemoteRef = useRef(false);
  const lastStateRef = useRef<PlayerState>('unknown');
  const lastSeekRef = useRef(0);
  const lastObservedPositionRef = useRef(0);

  const [localBlobUrl, setLocalBlobUrl] = useState<string | null>(null);
  const [localFileName, setLocalFileName] = useState<string | null>(null);

  const adapterType = sourceType === 'local' || sourceType === 'file'
    ? 'file'
    : sourceType === 'url' && sourceData?.mode === 'embed'
      ? 'embed'
      : sourceType;
  const effectiveUrl = adapterType === 'file'
    ? localBlobUrl || videoUrl
    : videoUrl || sourceData?.url;

  useEffect(() => {
    return () => {
      if (localBlobUrl) URL.revokeObjectURL(localBlobUrl);
    };
  }, [localBlobUrl]);

  const currentPosition = useCallback(() => {
    return playerRef.current?.getCurrentTime() || 0;
  }, []);

  const withRemoteGuard = useCallback((apply: () => void, releaseAfterMs = 700) => {
    isApplyingRemoteRef.current = true;
    apply();
    window.setTimeout(() => {
      isApplyingRemoteRef.current = false;
    }, releaseAfterMs);
  }, []);

  const applyPlay = useCallback(
    ({ positionSec, atServerTs }: TimedPlayback) => {
      const latencySec = atServerTs ? Math.max(0, (Date.now() - atServerTs) / 1000) : 0;
      const compensatedPosition = positionSec + latencySec;

      withRemoteGuard(() => {
        if (Math.abs(currentPosition() - compensatedPosition) > 0.4) {
          playerRef.current?.seek(compensatedPosition);
        }
        playerRef.current?.play();
      });
    },
    [currentPosition, withRemoteGuard]
  );

  const applyPause = useCallback(
    ({ positionSec }: TimedPlayback) => {
      withRemoteGuard(() => {
        if (Math.abs(currentPosition() - positionSec) > 0.4) {
          playerRef.current?.seek(positionSec);
        }
        playerRef.current?.pause();
      });
    },
    [currentPosition, withRemoteGuard]
  );

  const applySeek = useCallback(
    ({ positionSec }: { positionSec: number }) => {
      withRemoteGuard(() => {
        playerRef.current?.seek(positionSec);
      }, 500);
    },
    [withRemoteGuard]
  );

  useEffect(() => {
    if (adapterType === 'localStream' || adapterType === 'embed') return;

    const onPlay = (payload: TimedPlayback) => {
      if (payload.byUserId !== currentUserId) applyPlay(payload);
    };
    const onPause = (payload: TimedPlayback) => {
      if (payload.byUserId !== currentUserId) applyPause(payload);
    };
    const onSeek = (payload: { positionSec: number; byUserId?: string }) => {
      if (payload.byUserId !== currentUserId) applySeek(payload);
    };
    const onHeartbeat = ({ positionSec, atServerTs, byUserId }: { positionSec: number; atServerTs?: number; byUserId?: string }) => {
      if (byUserId === currentUserId || !playerRef.current) return;

      const latencySec =
        playerRef.current.getState() === 'playing' && atServerTs
          ? Math.max(0, (Date.now() - atServerTs) / 1000)
          : 0;
      const targetPosition = positionSec + latencySec;
      const delta = targetPosition - playerRef.current.getCurrentTime();
      if (Math.abs(delta) > 1.5) {
        withRemoteGuard(() => {
          playerRef.current?.seek(targetPosition);
        }, 500);
      }
    };
    const onReconnectSync = (playback: { isPlaying: boolean; currentTime: number; atServerTs?: number }) => {
      const latencySec =
        playback.isPlaying && playback.atServerTs
          ? Math.max(0, (Date.now() - playback.atServerTs) / 1000)
          : 0;

      withRemoteGuard(() => {
        playerRef.current?.seek((playback.currentTime || 0) + latencySec);
        if (playback.isPlaying) {
          playerRef.current?.play();
        } else {
          playerRef.current?.pause();
        }
      });
    };
    const onPlayerState = (state: { isPlaying: boolean; positionSec: number; serverTs?: number }) => {
      const latencySec =
        state.isPlaying && state.serverTs
          ? Math.max(0, (Date.now() - state.serverTs) / 1000)
          : 0;

      withRemoteGuard(() => {
        playerRef.current?.seek((state.positionSec || 0) + latencySec);
        if (state.isPlaying) {
          playerRef.current?.play();
        } else {
          playerRef.current?.pause();
        }
      });
    };

    socket.on('player:play', onPlay);
    socket.on('player:pause', onPause);
    socket.on('player:seek', onSeek);
    socket.on('player:heartbeat', onHeartbeat);
    socket.on('reconnect:sync', onReconnectSync);
    socket.on('player:state', onPlayerState);
    const stateTimer = window.setTimeout(() => socket.emit('player:state', { roomCode }), 250);

    return () => {
      window.clearTimeout(stateTimer);
      socket.off('player:play', onPlay);
      socket.off('player:pause', onPause);
      socket.off('player:seek', onSeek);
      socket.off('player:heartbeat', onHeartbeat);
      socket.off('reconnect:sync', onReconnectSync);
      socket.off('player:state', onPlayerState);
    };
  }, [adapterType, applyPause, applyPlay, applySeek, currentUserId, roomCode, withRemoteGuard]);

  useEffect(() => {
    if (!isHost || adapterType === 'localStream' || adapterType === 'embed') return;

    const intervalId = window.setInterval(() => {
      socket.emit('player:heartbeat', {
        roomCode,
        positionSec: currentPosition(),
      });
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [adapterType, currentPosition, isHost, roomCode]);

  useEffect(() => {
    if (!isHost || adapterType === 'localStream' || adapterType === 'embed') return;

    const intervalId = window.setInterval(() => {
      if (!playerRef.current || isApplyingRemoteRef.current) return;

      const state = playerRef.current.getState();
      const positionSec = playerRef.current.getCurrentTime();
      const previousPosition = lastObservedPositionRef.current;
      lastObservedPositionRef.current = positionSec;

      const expectedDelta = state === 'playing' ? 0.5 : 0;
      const actualDelta = Math.abs(positionSec - previousPosition);
      const now = Date.now();

      if (actualDelta > expectedDelta + 1.5 && now - lastSeekRef.current > 800) {
        lastSeekRef.current = now;
        socket.emit('player:seek', { roomCode, userId: currentUserId, positionSec });
      }
    }, 500);

    return () => window.clearInterval(intervalId);
  }, [adapterType, currentUserId, isHost, roomCode]);

  const handleStateChange = (state: PlayerState) => {
    const previousState = lastStateRef.current;
    lastStateRef.current = state;

    if (!isHost || adapterType === 'localStream' || adapterType === 'embed' || isApplyingRemoteRef.current) return;

    const positionSec = currentPosition();
    if (state === 'playing' && previousState !== 'playing') {
      socket.emit('player:play', { roomCode, userId: currentUserId, positionSec });
    }

    if (state === 'paused' && previousState === 'playing') {
      socket.emit('player:pause', { roomCode, userId: currentUserId, positionSec });
    }

    lastObservedPositionRef.current = positionSec;
  };

  const syncNow = () => {
    const state = playerRef.current?.getState();
    const positionSec = currentPosition();

    if (state === 'playing') {
      socket.emit('player:play', { roomCode, userId: currentUserId, positionSec });
      return;
    }

    socket.emit('player:pause', { roomCode, userId: currentUserId, positionSec });
  };

  if (adapterType === 'localStream' || (isHost && localStreamFile)) {
    return (
      <LocalStreamPlayer
        roomCode={roomCode}
        isHost={isHost}
        currentUserId={currentUserId}
        file={isHost ? localStreamFile : null}
        sourceData={sourceData}
        onStopped={onLocalStreamStopped}
      />
    );
  }

  if (adapterType === 'file' && !effectiveUrl) {
    const fileName = sourceData?.fileName;
    const fileSizeMB = sourceData?.fileSize ? (sourceData.fileSize / 1024 / 1024).toFixed(1) : null;

    return (
      <div className="card glass player-stack" style={{ textAlign: 'center', padding: '40px' }}>
        <h3 style={{ margin: '0 0 12px' }}>Load Local Video</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
          {isHost
            ? fileName
              ? `You selected "${fileName}". Please pick it again to start playing.`
              : 'Pick a local file. Playback changes will sync to everyone else.'
            : fileName
              ? <>Host is watching: <strong style={{ color: 'var(--primary)' }}>{fileName}</strong> {fileSizeMB && `(${fileSizeMB} MB)`}. <br/> Please select this file from your computer to join sync.</>
              : 'Wait for the host to pick a local file or select one yourself if you have it.'}
        </p>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <input
            id="local-file-input"
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
          <button className="button" onClick={() => document.getElementById('local-file-input')?.click()}>
            Select Local File
          </button>
        </div>
      </div>
    );
  }

  if (!effectiveUrl && adapterType !== 'ott-sync') {
    return (
      <div>
        <h3>No Media Source</h3>
        <p>Waiting for a video link...</p>
      </div>
    );
  }

  if (adapterType === 'ott-sync') {
    return (
      <div className="card glass player-stack" style={{ textAlign: 'center', padding: '40px' }}>
        <h3 style={{ margin: '0 0 12px' }}>OTT sync is disabled</h3>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
          Pick a YouTube link or local file to keep using this room.
        </p>
      </div>
    );
  }

  if (adapterType === 'embed') {
    return (
      <div className="player-stack">
        <div className="player-toolbar">
          <a className="button button-secondary" href={effectiveUrl || '#'} target="_blank" rel="noopener noreferrer">
            Open URL
          </a>
        </div>
        <div className="player-shell" data-player-shell>
          <iframe
            src={effectiveUrl || ''}
            className="player-frame"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
            style={{ border: 0, display: 'block' }}
            title="Embedded video"
          />
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.4 }}>
          Embedded pages control their own playback. If the provider blocks embedding, use Open URL.
        </div>
      </div>
    );
  }

  return (
    <div className="player-stack">
      <div className="player-toolbar">
        {isHost && (
          <button onClick={syncNow} style={{ padding: '8px 14px' }}>
            Sync Now
          </button>
        )}
        {sourceType === 'url' && (
          <>
            <a className="button button-secondary" href={effectiveUrl || '#'} target="_blank" rel="noopener noreferrer">
              Open URL
            </a>
            {isDownloadableMediaUrl(effectiveUrl || '') && (
              <a className="button button-secondary" href={effectiveUrl || '#'} download rel="noopener noreferrer">
                Download media
              </a>
            )}
          </>
        )}
      </div>

      {localFileName && (
        <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>{localFileName}</div>
      )}

      <div className="player-shell" data-player-shell>
        {adapterType === 'youtube' ? (
          <YouTubePlayer
            ref={playerRef}
            videoUrl={effectiveUrl || ''}
            isHost={isHost}
            onStateChange={handleStateChange}
            onError={(error) => console.error('YouTube player error', error)}
          />
        ) : (
          <LocalFilePlayer
            ref={playerRef}
            src={effectiveUrl || ''}
            controls={isHost}
            onStateChange={handleStateChange}
            onError={(error) => console.error('Local player error', error)}
          />
        )}
      </div>
    </div>
  );
}

function isDownloadableMediaUrl(url: string) {
  try {
    const parsed = new URL(url);
    return /\.(mp4|webm|ogg|ogv|mov|m4v|m3u8)(?:$|[?#])/i.test(parsed.pathname);
  } catch {
    return false;
  }
}
