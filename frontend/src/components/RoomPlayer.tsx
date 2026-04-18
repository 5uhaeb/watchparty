'use client';

import { useEffect, useRef } from 'react';
import { socket } from '@/lib/socket';
import YouTubePlayer from './YouTubePlayer';

export default function RoomPlayer({ 
  roomCode, 
  videoUrl, 
  sourceType = 'youtube' 
}: { 
  roomCode: string; 
  videoUrl?: string;
  sourceType?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (sourceType !== 'local' || !videoUrl) return;

    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => {
      socket.emit('playback:update', {
        roomCode,
        playback: { isPlaying: true, currentTime: video.currentTime }
      });
    };

    const onPause = () => {
      socket.emit('playback:update', {
        roomCode,
        playback: { isPlaying: false, currentTime: video.currentTime }
      });
    };

    const onSeeked = () => {
      socket.emit('playback:update', {
        roomCode,
        playback: { isPlaying: !video.paused, currentTime: video.currentTime }
      });
    };

    const onRemoteUpdate = (playback: { isPlaying: boolean; currentTime: number }) => {
      if (Math.abs(video.currentTime - playback.currentTime) > 1.5) {
        video.currentTime = playback.currentTime;
      }
      if (playback.isPlaying && video.paused) video.play().catch(() => {});
      if (!playback.isPlaying && !video.paused) video.pause();
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('seeked', onSeeked);
    socket.on('playback:update', onRemoteUpdate);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('seeked', onSeeked);
      socket.off('playback:update', onRemoteUpdate);
    };
  }, [roomCode, videoUrl, sourceType]);

  if (!videoUrl) {
    return (
      <div className="card glass" style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div>
          <h3>No Media Source</h3>
          <p style={{ color: 'var(--text-secondary)' }}>Waiting for a video link to be added...</p>
        </div>
      </div>
    );
  }

  if (sourceType === 'youtube') {
    return <YouTubePlayer roomCode={roomCode} videoUrl={videoUrl} />;
  }

  return (
    <div className="card glass" style={{ padding: 0, overflow: 'hidden' }}>
      <video ref={videoRef} src={videoUrl} controls width="100%" style={{ display: 'block' }} />
    </div>
  );
}
