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

export default function YouTubePlayer({
  roomCode,
  videoUrl,
  currentUserId,
}: Props) {
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [isApiReady, setIsApiReady] = useState(false);
  const isSyncingRef = useRef(false);

  const videoId =
    videoUrl.match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/ \s]+)/
    )?.[1] || videoUrl;

  useEffect(() => {
    if (window.YT?.Player) {
      setIsApiReady(true);
      return;
    }

    const existing = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
    );

    if (existing) {
      window.onYouTubeIframeAPIReady = () => setIsApiReady(true);
      return;
    }

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.body.appendChild(tag);

    window.onYouTubeIframeAPIReady = () => setIsApiReady(true);
  }, []);

  useEffect(() => {
    if (!isApiReady || !videoId || !containerRef.current) return;

    playerRef.current = new window.YT.Player(containerRef.current, {
      videoId,
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 0,
        controls: 1,
        fs: 1,
        rel: 0,
        modestbranding: 1,
      },
      events: {
        onReady: (event: any) => {
          const iframe = event.target?.getIframe?.();
          if (iframe) {
            iframe.setAttribute('allowfullscreen', 'true');
            iframe.setAttribute(
              'allow',
              'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen'
            );
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            iframe.style.border = '0';
          }
        },
        onStateChange: (event: any) => {
          if (isSyncingRef.current) return;

          const state = event.data;
          if (state === 1 || state === 2) {
            socket.emit('playback:update', {
              roomCode,
              userId: currentUserId,
              playback: {
                isPlaying: state === 1,
                currentTime: playerRef.current?.getCurrentTime?.() || 0,
              },
            });
          }
        },
      },
    });

    const applyRemotePlayback = (playback: {
      isPlaying: boolean;
      currentTime: number;
    }) => {
      if (!playerRef.current) return;

      isSyncingRef.current = true;

      const curr = playerRef.current.getCurrentTime?.() || 0;
      if (Math.abs(curr - playback.currentTime) > 1.5) {
        playerRef.current.seekTo(playback.currentTime, true);
      }

      if (playback.isPlaying) {
        playerRef.current.playVideo?.();
      } else {
        playerRef.current.pauseVideo?.();
      }

      window.setTimeout(() => {
        isSyncingRef.current = false;
      }, 400);
    };

    const onReconnectSync = (playback: {
      isPlaying: boolean;
      currentTime: number;
    }) => {
      if (!playerRef.current) return;

      playerRef.current.seekTo(playback.currentTime, true);
      if (playback.isPlaying) {
        playerRef.current.playVideo?.();
      } else {
        playerRef.current.pauseVideo?.();
      }
    };

    socket.on('playback:update', applyRemotePlayback);
    socket.on('reconnect:sync', onReconnectSync);

    return () => {
      socket.off('playback:update', applyRemotePlayback);
      socket.off('reconnect:sync', onReconnectSync);
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [isApiReady, videoId, roomCode, currentUserId]);

  const syncNow = () => {
    if (!playerRef.current) return;

    const state = playerRef.current.getPlayerState?.();
    socket.emit('playback:update', {
      roomCode,
      userId: currentUserId,
      playback: {
        isPlaying: state === 1,
        currentTime: playerRef.current.getCurrentTime?.() || 0,
      },
    });
  };

  const enterFullscreen = async () => {
    const iframe = playerRef.current?.getIframe?.();
    if (!iframe) return;

    try {
      if (iframe.requestFullscreen) {
        await iframe.requestFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen failed', err);
    }
  };

  return (
    <div
      style={{
        display: 'grid',
        gap: 12,
      }}
    >
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

      <div
        ref={wrapperRef}
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 9',
          borderRadius: 16,
          overflow: 'hidden',
          background: '#000',
        }}
      >
        <div ref={containerRef} />
      </div>
    </div>
  );
}
