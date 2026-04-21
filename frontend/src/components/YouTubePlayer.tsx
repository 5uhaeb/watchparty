'use client';

import { useEffect, useRef, useState } from 'react';
import { socket } from '@/lib/socket';
import { canDo, RoomState } from '@/lib/permissions';

declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    YT: any;
  }
}

export default function YouTubePlayer({ roomCode, videoUrl, roomState, userId }: { roomCode: string; videoUrl: string; roomState?: RoomState | null; userId?: string }) {
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isApiReady, setIsApiReady] = useState(false);

  // Extract video ID from URL
  const videoId = videoUrl.match(/(?:https?:\/\/(?:www\.)?youtube\.com\/watch\?v=|https?:\/\/youtu\.be\/)([^& \n]+)/)?.[1] || videoUrl;

  useEffect(() => {
    if (window.YT && window.YT.Player) {
      setIsApiReady(true);
      return;
    }

    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
      setIsApiReady(true);
    };
  }, []);

  useEffect(() => {
    if (!isApiReady || !videoId || !containerRef.current) return;

    const canControlPlayback = roomState && userId ? canDo(roomState, userId, 'playPause') : true;
    const canSeek = roomState && userId ? canDo(roomState, userId, 'seek') : true;

    playerRef.current = new window.YT.Player(containerRef.current, {
      videoId: videoId,
      playerVars: {
        autoplay: 0,
        controls: canControlPlayback && canSeek ? 1 : 0,
        rel: 0,
        modestbranding: 1
      },
      events: {
        onStateChange: (event: any) => {
          const state = event.data;
          // YT.PlayerState.PLAYING = 1, PAUSED = 2, BUFFERING = 3
          if (state === 1) {
            if (canControlPlayback) {
              socket.emit('player:play', { positionSec: playerRef.current.getCurrentTime() });
            }
          } else if (state === 2) {
            if (canControlPlayback) {
              socket.emit('player:pause', { positionSec: playerRef.current.getCurrentTime() });
            }
          }
        }
      }
    });

    const onRemoteUpdate = (playback: { isPlaying: boolean; currentTime: number }) => {
      if (!playerRef.current) return;

      const currentTime = playerRef.current.getCurrentTime();
      if (Math.abs(currentTime - playback.currentTime) > 2) {
        if (canSeek) {
          playerRef.current.seekTo(playback.currentTime, true);
        }
      }

      if (playback.isPlaying) {
        playerRef.current.playVideo();
      } else {
        playerRef.current.pauseVideo();
      }
    };

    socket.on('playback:update', onRemoteUpdate);

    return () => {
      socket.off('playback:update', onRemoteUpdate);
      if (playerRef.current) {
        playerRef.current.destroy();
      }
    };
  }, [isApiReady, videoId, roomCode, roomState, userId]);

  const canControlPlayback = roomState && userId ? canDo(roomState, userId, 'playPause') : true;
  const canSeek = roomState && userId ? canDo(roomState, userId, 'seek') : true;

  return (
    <div className="card glass" style={{ padding: '0', overflow: 'hidden', aspectRatio: '16/9', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {(!canControlPlayback || !canSeek) && (
        <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.8)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
          {!canControlPlayback && 'Playback controls disabled'}
          {!canSeek && !canControlPlayback && ', '}
          {!canSeek && 'Seek disabled'}
        </div>
      )}
    </div>
  );
}
