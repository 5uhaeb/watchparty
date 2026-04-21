'use client';

import { useEffect, useRef } from 'react';
import { socket } from '@/lib/socket';
import { canDo, RoomState } from '@/lib/permissions';
import YouTubePlayer from './YouTubePlayer';

export default function RoomPlayer({ 
  roomCode, 
  videoUrl, 
  sourceType = 'youtube',
  roomState,
  userId
}: { 
  roomCode: string; 
  videoUrl?: string;
  sourceType?: string;
  roomState?: RoomState | null;
  userId?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (sourceType !== 'local' || !videoUrl) return;

    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => {
      if (roomState && userId && !canDo(roomState, userId, 'playPause')) {
        socket.emit('player:play', { positionSec: video.currentTime });
        return;
      }
      socket.emit('player:play', { positionSec: video.currentTime });
    };

    const onPause = () => {
      if (roomState && userId && !canDo(roomState, userId, 'playPause')) {
        socket.emit('player:pause', { positionSec: video.currentTime });
        return;
      }
      socket.emit('player:pause', { positionSec: video.currentTime });
    };

    const onSeeked = () => {
      if (roomState && userId && !canDo(roomState, userId, 'seek')) {
        socket.emit('player:seek', { positionSec: video.currentTime });
        return;
      }
      socket.emit('player:seek', { positionSec: video.currentTime });
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
  }, [roomCode, videoUrl, sourceType, roomState, userId]);

  const canControlPlayback = roomState && userId ? canDo(roomState, userId, 'playPause') : true;
  const canSeek = roomState && userId ? canDo(roomState, userId, 'seek') : true;

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
    return <YouTubePlayer roomCode={roomCode} videoUrl={videoUrl} roomState={roomState} userId={userId} />;
  }

  return (
    <div className="card glass" style={{ padding: 0, overflow: 'hidden' }}>
      <video 
        ref={videoRef} 
        src={videoUrl} 
        controls={canControlPlayback && canSeek} 
        width="100%" 
        style={{ display: 'block' }} 
      />
      {!canControlPlayback && (
        <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.8)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
          Playback controls disabled
        </div>
      )}
    </div>
  );
}
