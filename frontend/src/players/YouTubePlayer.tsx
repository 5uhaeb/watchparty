'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import type { PlayerAdapter, PlayerEventHandlers, PlayerState } from './types';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youTubeApiPromise: Promise<any> | null = null;

function loadYouTubeIframeApi() {
  if (typeof window === 'undefined') return Promise.reject(new Error('YouTube API needs a browser'));
  if (window.YT?.Player) return Promise.resolve(window.YT);

  if (!youTubeApiPromise) {
    youTubeApiPromise = new Promise((resolve) => {
      const previousReady = window.onYouTubeIframeAPIReady;

      window.onYouTubeIframeAPIReady = () => {
        previousReady?.();
        resolve(window.YT);
      };

      const existing = document.querySelector<HTMLScriptElement>(
        'script[src="https://www.youtube.com/iframe_api"]'
      );

      if (!existing) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.body.appendChild(tag);
      }
    });
  }

  return youTubeApiPromise;
}

function getYouTubeVideoId(url: string) {
  const trimmed = url.trim();
  const match = trimmed.match(
    /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\/)([^&?/\s]+)/
  );

  return match?.[1] || trimmed;
}

function mapYouTubeState(state: number): PlayerState {
  switch (state) {
    case -1:
      return 'unstarted';
    case 0:
      return 'ended';
    case 1:
      return 'playing';
    case 2:
      return 'paused';
    case 3:
      return 'buffering';
    case 5:
      return 'cued';
    default:
      return 'unknown';
  }
}

type Props = PlayerEventHandlers & {
  videoUrl: string;
  isHost?: boolean;
};

const YouTubePlayer = forwardRef<PlayerAdapter, Props>(function YouTubePlayer(
  { videoUrl, isHost = false, onReady, onStateChange, onError },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const callbacksRef = useRef({ onReady, onStateChange, onError });
  const videoId = useMemo(() => getYouTubeVideoId(videoUrl), [videoUrl]);

  useEffect(() => {
    callbacksRef.current = { onReady, onStateChange, onError };
  }, [onReady, onStateChange, onError]);

  useImperativeHandle(ref, () => ({
    play: () => playerRef.current?.playVideo?.(),
    pause: () => playerRef.current?.pauseVideo?.(),
    seek: (seconds: number) => playerRef.current?.seekTo?.(seconds, true),
    setPlaybackRate: (rate: number) => playerRef.current?.setPlaybackRate?.(rate),
    getCurrentTime: () => playerRef.current?.getCurrentTime?.() || 0,
    getDuration: () => playerRef.current?.getDuration?.() || 0,
    getState: () => mapYouTubeState(playerRef.current?.getPlayerState?.()),
  }));

  useEffect(() => {
    let cancelled = false;

    loadYouTubeIframeApi()
      .then((YT) => {
        if (cancelled || !containerRef.current || !videoId) return;

        playerRef.current?.destroy?.();
        playerRef.current = new YT.Player(containerRef.current, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 0,
            controls: isHost ? 1 : 0,
            modestbranding: 1,
            rel: 0,
          },
          events: {
            onReady: (event: any) => {
              const iframe = event.target?.getIframe?.();
              if (iframe) {
                iframe.setAttribute('allowfullscreen', 'true');
                iframe.setAttribute(
                  'allow',
                  'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen'
                );
                iframe.style.width = '100%';
                iframe.style.height = '100%';
                iframe.style.border = '0';
              }
              callbacksRef.current.onReady?.();
            },
            onStateChange: (event: any) => {
              callbacksRef.current.onStateChange?.(mapYouTubeState(event.data));
            },
            onError: (event: any) => {
              callbacksRef.current.onError?.(event.data);
            },
          },
        });
      })
      .catch((error) => callbacksRef.current.onError?.(error));

    return () => {
      cancelled = true;
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [videoId, isHost]);

  return (
    <div className="player-frame" style={{ position: 'relative' }}>
      <div ref={containerRef} />
    </div>
  );
});

export default YouTubePlayer;
