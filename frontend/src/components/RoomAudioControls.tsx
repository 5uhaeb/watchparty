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
  onWarning,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bridgeRef = useRef<JanusAudioBridgeClient | null>(null);
  const lastMediaTrackIdsRef = useRef('');
  const [status, setStatus] = useState('');
  const [mediaStatus, setMediaStatus] = useState('');
  const [captureUnsupported, setCaptureUnsupported] = useState(false);

  useEffect(() => {
    if (!isActive || !microphoneStream) return;
    let cancelled = false;

    const bridge = new JanusAudioBridgeClient({
      roomId: roomCode,
      userId: currentUser.id,
      displayName: currentUser.name,
      wsUrl: getAudioServerWsUrl(),
      onWarning,
      onStatus: setStatus,
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
        bridge.setMicVolume(micVolume);
        bridge.setMicEnabled(isMicEnabled);
      })
      .catch((error) => {
        onWarning?.(error instanceof Error ? error.message : 'Could not connect to room audio server.');
      });

    return () => {
      cancelled = true;
      bridge.disconnect().catch(() => null);
      bridgeRef.current = null;
      lastMediaTrackIdsRef.current = '';
      if (audioRef.current) audioRef.current.srcObject = null;
    };
  }, [currentUser.id, currentUser.name, isActive, microphoneStream, onWarning, roomCode]);

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
  }, [isActive, mediaVolume]);

  const unlockAudio = async () => {
    await bridgeRef.current?.resume();
    await audioRef.current?.play().catch(() => null);
  };

  return (
    <div className="room-audio-controls" style={{ display: 'grid', gap: 10 }}>
      <audio ref={audioRef} autoPlay playsInline />
      <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.4 }}>
        Call and watch audio are mixed through the room audio server. Headphones are recommended to reduce echo.
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
    </div>
  );
}
