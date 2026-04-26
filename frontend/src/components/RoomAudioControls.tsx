'use client';

import { useEffect, useRef, useState } from 'react';
import { JanusAudioBridgeClient, getAudioServerWsUrl } from '@/lib/janusAudioBridge';
import { captureWatchMediaAudio, findWatchMediaElement } from '@/lib/watchMediaAudioPublisher';

type Props = {
  roomCode: string;
  currentUser: { id: string; name: string };
  microphoneStream: MediaStream | null;
  isActive: boolean;
  isMicEnabled: boolean;
  micVolume: number;
  mediaVolume: number;
  mixedVolume: number;
  publishMediaAudio?: boolean;
  onWarning?: (message: string) => void;
};

export default function RoomAudioControls({
  roomCode,
  currentUser,
  microphoneStream,
  isActive,
  isMicEnabled,
  micVolume,
  mediaVolume,
  mixedVolume,
  publishMediaAudio = false,
  onWarning,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bridgeRef = useRef<JanusAudioBridgeClient | null>(null);
  const lastMediaTrackIdsRef = useRef('');
  const retryTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const [status, setStatus] = useState('');
  const [mediaStatus, setMediaStatus] = useState('');
  const [captureUnsupported, setCaptureUnsupported] = useState(false);
  const [reconnectKey, setReconnectKey] = useState(0);

  useEffect(() => {
    if (!isActive || !microphoneStream) return;
    let cancelled = false;
    let connected = false;

    const scheduleReconnect = (reason: string) => {
      if (cancelled) return;
      if (retryTimerRef.current !== null) return;
      const attempt = reconnectAttemptsRef.current + 1;
      reconnectAttemptsRef.current = attempt;
      const delayMs = Math.min(30000, 1500 * attempt);
      setStatus(`${reason} Reconnecting room audio in ${Math.round(delayMs / 1000)}s.`);
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        setReconnectKey((value) => value + 1);
      }, delayMs);
    };

    const bridge = new JanusAudioBridgeClient({
      roomId: roomCode,
      userId: currentUser.id,
      displayName: currentUser.name,
      wsUrl: getAudioServerWsUrl(),
      onWarning,
      onStatus: setStatus,
      onDisconnect: () => {
        if (connected) scheduleReconnect('Room audio disconnected.');
      },
      onMixedStream: (stream) => {
        if (!audioRef.current) return;
        audioRef.current.srcObject = stream;
        audioRef.current.volume = mixedVolume;
        audioRef.current.play().catch(() => {
          setStatus('Tap Enable audio if the browser blocks room audio playback.');
        });
      },
    });

    bridgeRef.current = bridge;
    bridge.connect(microphoneStream)
      .then(() => {
        if (cancelled) return;
        connected = true;
        reconnectAttemptsRef.current = 0;
        bridge.setMicVolume(micVolume);
        bridge.setMicEnabled(isMicEnabled);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Could not connect to room audio server.';
        onWarning?.(message);
        scheduleReconnect(message);
      });

    return () => {
      cancelled = true;
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      bridge.disconnect().catch(() => null);
      bridgeRef.current = null;
      lastMediaTrackIdsRef.current = '';
      if (audioRef.current) audioRef.current.srcObject = null;
    };
  }, [currentUser.id, currentUser.name, isActive, microphoneStream, onWarning, reconnectKey, roomCode]);

  useEffect(() => {
    bridgeRef.current?.setMicVolume(micVolume);
  }, [micVolume]);

  useEffect(() => {
    bridgeRef.current?.setMediaVolume(mediaVolume);
  }, [mediaVolume]);

  useEffect(() => {
    bridgeRef.current?.setMicEnabled(isMicEnabled);
  }, [isMicEnabled]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = mixedVolume;
  }, [mixedVolume]);

  useEffect(() => {
    if (!isActive) return;

    const publishCurrentMedia = () => {
      const bridge = bridgeRef.current;
      if (!bridge) return;

      if (!publishMediaAudio) {
        bridge.unpublishMediaAudio().catch(() => null);
        lastMediaTrackIdsRef.current = '';
        setMediaStatus('');
        return;
      }

      const result = captureWatchMediaAudio(findWatchMediaElement());
      if (result.ok === false) {
        const reason = result.reason;
        if (reason.includes('cannot capture')) setCaptureUnsupported(true);
        setMediaStatus(reason);
        bridge.unpublishMediaAudio().catch(() => null);
        lastMediaTrackIdsRef.current = '';
        return;
      }

      const trackIds = result.stream.getAudioTracks().map((track) => track.id).join(':');
      if (trackIds && trackIds === lastMediaTrackIdsRef.current) return;
      lastMediaTrackIdsRef.current = trackIds;

      bridge.publishMediaAudio(result.stream)
        .then((published) => {
          if (published) {
            bridge.setMediaVolume(mediaVolume);
            setCaptureUnsupported(false);
            setMediaStatus('Watch player audio is mixed through the room audio server.');
          }
        })
        .catch(() => {
          setMediaStatus('Watch player audio could not be published. Microphone room audio is still available.');
        });
    };

    publishCurrentMedia();
    const intervalId = window.setInterval(publishCurrentMedia, 2500);
    return () => window.clearInterval(intervalId);
  }, [isActive, mediaVolume, publishMediaAudio]);

  const unlockAudio = async () => {
    await bridgeRef.current?.resume();
    await audioRef.current?.play().catch(() => null);
  };

  const reconnectAudio = async () => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    await bridgeRef.current?.disconnect().catch(() => null);
    bridgeRef.current = null;
    lastMediaTrackIdsRef.current = '';
    setStatus('Reconnecting room audio...');
    setReconnectKey((value) => value + 1);
  };

  return (
    <div className="room-audio-controls" style={{ display: 'grid', gap: 10 }}>
      <audio ref={audioRef} autoPlay playsInline />
      <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.4 }}>
        Call audio is mixed through the room audio server. The room host publishes watch audio when the browser can capture it.
      </div>
      {captureUnsupported && (
        <div style={{ color: '#f59e0b', fontSize: '0.82rem', lineHeight: 1.4 }}>
          Your browser does not support watch player audio capture. The room audio server will keep mixing microphones.
        </div>
      )}
      {(status || mediaStatus) && (
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', lineHeight: 1.35 }}>
          {status || 'Room audio ready.'} {mediaStatus}
        </div>
      )}
      <button className="button button-secondary" onClick={unlockAudio} style={{ padding: '9px', fontSize: '0.85rem' }}>
        Enable room audio
      </button>
      <button className="button button-secondary" onClick={reconnectAudio} style={{ padding: '9px', fontSize: '0.85rem' }}>
        Reconnect room audio
      </button>
    </div>
  );
}
