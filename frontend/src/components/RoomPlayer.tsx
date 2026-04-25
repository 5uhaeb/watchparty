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

  const adapterType = sourceType === 'local' || sourceType === 'file' ? 'file' : sourceType;
  const effectiveUrl = adapterType === 'file' ? localBlobUrl || videoUrl : videoUrl;

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
    if (adapterType === 'localStream') return;

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
    if (!isHost || adapterType === 'localStream') return;

    const intervalId = window.setInterval(() => {
      socket.emit('player:heartbeat', {
        roomCode,
        positionSec: currentPosition(),
      });
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [adapterType, currentPosition, isHost, roomCode]);

  useEffect(() => {
    if (!isHost || adapterType === 'localStream') return;

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

    if (!isHost || adapterType === 'localStream' || isApplyingRemoteRef.current) return;

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

  const enterFullscreen = async () => {
    const element = document.querySelector('[data-watch-stage]') || document.querySelector('[data-player-shell]');
    if (!(element instanceof HTMLElement)) return;

    try {
      await element.requestFullscreen?.();
    } catch (err) {
      console.error('Fullscreen failed', err);
    }
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
    return <OttControls roomCode={roomCode} currentUserId={currentUserId} isHost={isHost} />;
  }

  return (
    <div className="player-stack">
      <div className="player-toolbar">
        {isHost && (
          <button onClick={syncNow} style={{ padding: '8px 14px' }}>
            Sync Now
          </button>
        )}
        <button onClick={enterFullscreen} style={{ padding: '8px 14px' }}>
          Full Screen
        </button>
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

function OttControls({
  roomCode,
  currentUserId,
  isHost = false,
}: {
  roomCode: string;
  currentUserId?: string;
  isHost?: boolean;
}) {
  const [time, setTime] = useState('0');
  const [isPlaying, setIsPlaying] = useState(false);
  const startedAtRef = useRef<number | null>(null);
  const startedPositionRef = useRef(0);

  const applyState = useCallback((playing: boolean, positionSec: number, serverTs?: number) => {
    const latencySec = playing && serverTs ? Math.max(0, (Date.now() - serverTs) / 1000) : 0;
    const nextPosition = Math.max(0, positionSec + latencySec);

    setIsPlaying(playing);
    setTime(nextPosition.toFixed(1));
    startedPositionRef.current = nextPosition;
    startedAtRef.current = playing ? Date.now() : null;
  }, []);

  useEffect(() => {
    const onPlay = ({ positionSec, atServerTs }: { positionSec: number; atServerTs?: number }) => {
      applyState(true, Number(positionSec || 0), atServerTs);
    };
    const onPause = ({ positionSec }: { positionSec: number }) => {
      applyState(false, Number(positionSec || 0));
    };
    const onSeek = ({ positionSec }: { positionSec: number }) => {
      applyState(isPlaying, Number(positionSec || 0));
    };
    const onHeartbeat = ({ positionSec, atServerTs }: { positionSec: number; atServerTs?: number }) => {
      if (!isPlaying) return;
      const latencySec = atServerTs ? Math.max(0, (Date.now() - atServerTs) / 1000) : 0;
      const target = Number(positionSec || 0) + latencySec;
      const local = Number(time) || 0;
      if (Math.abs(target - local) > 1.5) applyState(true, Number(positionSec || 0), atServerTs);
    };
    const onPlayerState = (state: { isPlaying: boolean; positionSec: number; serverTs?: number }) => {
      applyState(state.isPlaying, Number(state.positionSec || 0), state.serverTs);
    };

    socket.on('player:play', onPlay);
    socket.on('player:pause', onPause);
    socket.on('player:seek', onSeek);
    socket.on('player:heartbeat', onHeartbeat);
    socket.on('player:state', onPlayerState);

    socket.emit('player:state', { roomCode });

    return () => {
      socket.off('player:play', onPlay);
      socket.off('player:pause', onPause);
      socket.off('player:seek', onSeek);
      socket.off('player:heartbeat', onHeartbeat);
      socket.off('player:state', onPlayerState);
    };
  }, [applyState, isPlaying, roomCode, time]);

  useEffect(() => {
    if (!isPlaying) return;

    const intervalId = window.setInterval(() => {
      if (!startedAtRef.current) return;
      const elapsed = (Date.now() - startedAtRef.current) / 1000;
      setTime((startedPositionRef.current + elapsed).toFixed(1));
    }, 500);

    return () => window.clearInterval(intervalId);
  }, [isPlaying]);

  useEffect(() => {
    if (!isHost || !isPlaying) return;

    const intervalId = window.setInterval(() => {
      socket.emit('player:heartbeat', {
        roomCode,
        positionSec: parseFloat(time) || 0,
      });
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [isHost, isPlaying, roomCode, time]);

  const broadcast = (isPlaying: boolean) => {
    const positionSec = parseFloat(time) || 0;
    applyState(isPlaying, positionSec);
    socket.emit(isPlaying ? 'player:play' : 'player:pause', {
      roomCode,
      userId: currentUserId,
      positionSec,
    });
  };

  const broadcastSeek = () => {
    const positionSec = parseFloat(time) || 0;
    applyState(isPlaying, positionSec);
    socket.emit('player:seek', {
      roomCode,
      userId: currentUserId,
      positionSec,
    });
  };

  return (
    <div className="ott-panel">
      <h3>OTT Sync Mode</h3>
      <p>
        Open Netflix / Prime / Hotstar in another tab. Everyone can use the
        sync controls below.
      </p>

      <div className="player-toolbar">
        <input
          value={time}
          onChange={(e) => setTime(e.target.value)}
          placeholder="Time (seconds)"
          className="input"
          style={{ width: 140 }}
        />
        <button onClick={() => broadcast(true)} style={{ padding: '8px 20px' }}>
          Play All
        </button>
        <button
          onClick={() => broadcast(false)}
          style={{ padding: '8px 20px' }}
        >
          Pause All
        </button>
        <button onClick={broadcastSeek} style={{ padding: '8px 20px' }}>
          Seek All
        </button>
      </div>
      <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
        OTT status: {isPlaying ? 'Playing' : 'Paused'} at {time || '0'}s
      </div>
    </div>
  );
}
