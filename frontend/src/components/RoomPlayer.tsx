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
  mediaTimeMs?: number;
  wallClockMs?: number;
  atServerTs?: number;
  byUserId?: string;
  isPlaying?: boolean;
  playbackRate?: number;
};

const HARD_SYNC_DRIFT_SEC = 0.4;
const SOFT_SYNC_DRIFT_SEC = 0.1;

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
    : sourceType === 'game'
      ? 'game'
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

  const applyHostSync = useCallback((payload: TimedPlayback, force = false) => {
    if (!playerRef.current) return;
    const basePositionSec = Number.isFinite(payload.mediaTimeMs)
      ? Number(payload.mediaTimeMs) / 1000
      : Number(payload.positionSec || 0);
    const wallClockMs = payload.wallClockMs || payload.atServerTs || Date.now();
    const shouldPlay = payload.isPlaying ?? playerRef.current.getState() === 'playing';
    const elapsedSec = shouldPlay ? Math.max(0, (Date.now() - wallClockMs) / 1000) : 0;
    const targetPosition = Math.max(0, basePositionSec + elapsedSec);
    const driftSec = targetPosition - currentPosition();

    withRemoteGuard(() => {
      if (force || Math.abs(driftSec) > HARD_SYNC_DRIFT_SEC) {
        playerRef.current?.seek(targetPosition);
        playerRef.current?.setPlaybackRate?.(1);
      } else if (Math.abs(driftSec) > SOFT_SYNC_DRIFT_SEC && shouldPlay) {
        playerRef.current?.setPlaybackRate?.(driftSec > 0 ? 1.03 : 0.97);
        window.setTimeout(() => playerRef.current?.setPlaybackRate?.(1), 1500);
      } else {
        playerRef.current?.setPlaybackRate?.(1);
      }

      if (shouldPlay) playerRef.current?.play();
      else playerRef.current?.pause();
    }, force ? 900 : 500);
  }, [currentPosition, withRemoteGuard]);

  const syncNow = useCallback((showToast = false) => {
    const state = playerRef.current?.getState();
    const positionSec = currentPosition();
    const payload = {
      roomCode,
      userId: currentUserId,
      positionSec,
      mediaTimeMs: Math.round(positionSec * 1000),
      wallClockMs: Date.now(),
      playbackRate: 1,
    };

    if (state === 'playing') {
      socket.emit('player:play', payload);
    } else {
      socket.emit('player:pause', payload);
    }

    if (showToast) {
      window.dispatchEvent(new CustomEvent('watchparty:toast', { detail: 'Synced to host' }));
    }
  }, [currentPosition, currentUserId, roomCode]);

  useEffect(() => {
    if (adapterType === 'localStream' || adapterType === 'embed' || adapterType === 'game') return;

    const onPlay = (payload: TimedPlayback) => {
      if (payload.byUserId !== currentUserId) applyHostSync({ ...payload, isPlaying: true });
    };
    const onPause = (payload: TimedPlayback) => {
      if (payload.byUserId !== currentUserId) applyHostSync({ ...payload, isPlaying: false });
    };
    const onSeek = (payload: TimedPlayback) => {
      if (payload.byUserId !== currentUserId) applyHostSync(payload, true);
    };
    const onHeartbeat = (payload: TimedPlayback) => {
      if (payload.byUserId === currentUserId) return;
      applyHostSync({ ...payload, isPlaying: true });
    };
    const onReconnectSync = (playback: { isPlaying: boolean; currentTime: number; atServerTs?: number; wallClockMs?: number; mediaTimeMs?: number }) => {
      applyHostSync({
        positionSec: playback.currentTime || 0,
        mediaTimeMs: playback.mediaTimeMs,
        wallClockMs: playback.wallClockMs || playback.atServerTs,
        isPlaying: playback.isPlaying,
      }, true);
    };
    const onPlayerState = (state: TimedPlayback & { serverTs?: number }) => {
      applyHostSync({
        ...state,
        wallClockMs: state.wallClockMs || state.serverTs,
      }, true);
    };
    const onManualSync = (event: Event) => {
      const detail = (event as CustomEvent<{ force?: boolean }>).detail || {};
      if (isHost) {
        syncNow(true);
        return;
      }
      socket.timeout(3000).emit('player:manual-sync', { roomCode }, (_error: Error | null, payload?: TimedPlayback & { serverTs?: number; isPlaying?: boolean }) => {
        if (!payload) return;
        applyHostSync({ ...payload, wallClockMs: payload.wallClockMs || payload.serverTs }, true);
        window.dispatchEvent(new CustomEvent('watchparty:toast', { detail: 'Synced to host' }));
      });
    };

    socket.on('player:play', onPlay);
    socket.on('player:pause', onPause);
    socket.on('player:seek', onSeek);
    socket.on('player:heartbeat', onHeartbeat);
    socket.on('reconnect:sync', onReconnectSync);
    socket.on('player:state', onPlayerState);
    socket.on('player:manual-sync', onPlayerState);
    window.addEventListener('watchparty:sync-now', onManualSync);
    const stateTimer = window.setTimeout(() => socket.emit('player:state', { roomCode }), 250);

    return () => {
      window.clearTimeout(stateTimer);
      socket.off('player:play', onPlay);
      socket.off('player:pause', onPause);
      socket.off('player:seek', onSeek);
      socket.off('player:heartbeat', onHeartbeat);
      socket.off('reconnect:sync', onReconnectSync);
      socket.off('player:state', onPlayerState);
      socket.off('player:manual-sync', onPlayerState);
      window.removeEventListener('watchparty:sync-now', onManualSync);
    };
  }, [adapterType, applyHostSync, currentUserId, isHost, roomCode, syncNow]);

  useEffect(() => {
    if (!isHost || adapterType === 'localStream' || adapterType === 'embed' || adapterType === 'game') return;

    const intervalId = window.setInterval(() => {
      socket.emit('player:heartbeat', {
        roomCode,
        positionSec: currentPosition(),
      });
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [adapterType, currentPosition, isHost, roomCode]);

  useEffect(() => {
    if (!isHost || adapterType === 'localStream' || adapterType === 'embed' || adapterType === 'game') return;

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

    if (!isHost || adapterType === 'localStream' || adapterType === 'embed' || adapterType === 'game' || isApplyingRemoteRef.current) return;

    const positionSec = currentPosition();
    if (state === 'playing' && previousState !== 'playing') {
      socket.emit('player:play', { roomCode, userId: currentUserId, positionSec });
    }

    if (state === 'paused' && previousState === 'playing') {
      socket.emit('player:pause', { roomCode, userId: currentUserId, positionSec });
    }

    lastObservedPositionRef.current = positionSec;
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

  if (adapterType === 'game') {
    return (
      <div className="player-stack">
        <div className="player-toolbar">
          <a className="button button-secondary" href={effectiveUrl || '/games/hyperion/index.html'} target="_blank" rel="noopener noreferrer">
            Open Hyperion
          </a>
        </div>
        <div className="player-shell" data-player-shell>
          <iframe
            src={effectiveUrl || '/games/hyperion/index.html'}
            className="player-frame"
            allow="autoplay; fullscreen; gamepad"
            allowFullScreen
            style={{ border: 0, display: 'block' }}
            title="HYPERION.EXE"
          />
        </div>
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
            className="player-frame player-frame-embed"
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
          <button onClick={() => syncNow(true)} style={{ padding: '8px 14px' }}>
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
    return /\.(mp4|webm|ogg|ogv|mov|m4v|m3u8|mpd)(?:$|[?#])/i.test(parsed.pathname) ||
      parsed.search.toLowerCase().includes('m3u8');
  } catch {
    return false;
  }
}
