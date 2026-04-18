'use client';

import { useEffect, useRef, useState } from 'react';
import { socket } from '@/lib/socket';

declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    YT: any;
  }
}

interface Props {
  roomCode: string;
  videoUrl: string;
  isHost?: boolean;
  currentUserId?: string;
}

export default function YouTubePlayer({ roomCode, videoUrl, isHost = false, currentUserId }: Props) {
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isApiReady, setIsApiReady] = useState(false);
  const isSyncingRef = useRef(false); // prevents echo when we apply remote events

  const videoId =
    videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)?.[1] || videoUrl;

  // Load YouTube IFrame API once
  useEffect(() => {
    if (window.YT?.Player) {
      setIsApiReady(true);
      return;
    }
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.getElementsByTagName('script')[0].parentNode?.insertBefore(
      tag,
      document.getElementsByTagName('script')[0]
    );
    window.onYouTubeIframeAPIReady = () => setIsApiReady(true);
  }, []);

  useEffect(() => {
    if (!isApiReady || !videoId || !containerRef.current) return;

    playerRef.current = new window.YT.Player(containerRef.current, {
      videoId,
      playerVars: { autoplay: 0, controls: isHost ? 1 : 0, rel: 0, modestbranding: 1 },
      events: {
        onStateChange: (event: any) => {
          if (isSyncingRef.current) return;
          if (!isHost) return; // only host broadcasts

          const state = event.data;
          if (state === 1 /* PLAYING */ || state === 2 /* PAUSED */) {
            socket.emit('playback:update', {
              roomCode,
              userId: currentUserId,
              playback: {
                isPlaying: state === 1,
                currentTime: playerRef.current.getCurrentTime()
              }
            });
          }
        }
      }
    });

    const applyRemotePlayback = (playback: { isPlaying: boolean; currentTime: number }) => {
      if (!playerRef.current) return;
      isSyncingRef.current = true;
      const curr = playerRef.current.getCurrentTime();
      if (Math.abs(curr - playback.currentTime) > 2) {
        playerRef.current.seekTo(playback.currentTime, true);
      }
      if (playback.isPlaying) playerRef.current.playVideo();
      else playerRef.current.pauseVideo();
      setTimeout(() => { isSyncingRef.current = false; }, 400);
    };

    const onReconnectSync = (playback: { isPlaying: boolean; currentTime: number }) => {
      if (!playerRef.current) return;
      playerRef.current.seekTo(playback.currentTime, true);
      if (playback.isPlaying) playerRef.current.playVideo();
    };

    socket.on('playback:update', applyRemotePlayback);
    socket.on('reconnect:sync', onReconnectSync);

    return () => {
      socket.off('playback:update', applyRemotePlayback);
      socket.off('reconnect:sync', onReconnectSync);
      playerRef.current?.destroy();
    };
  }, [isApiReady, videoId, roomCode, isHost, currentUserId]);

  return (
    <div className="card glass" style={{ padding: 0, overflow: 'hidden', aspectRatio: '16/9', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {!isHost && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 1, cursor: 'default' }} title="Only the host can control playback" />
      )}
    </div>
  );
}
