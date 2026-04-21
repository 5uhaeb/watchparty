'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { PlayerAdapter, PlayerEventHandlers, PlayerState } from './types';

type Props = PlayerEventHandlers & {
  src: string;
  controls?: boolean;
};

function getVideoState(video: HTMLVideoElement | null): PlayerState {
  if (!video) return 'unknown';
  if (video.ended) return 'ended';
  if (video.paused) return 'paused';
  return 'playing';
}

const LocalFilePlayer = forwardRef<PlayerAdapter, Props>(function LocalFilePlayer(
  { src, controls = true, onReady, onStateChange, onError },
  ref
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useImperativeHandle(ref, () => ({
    play: () => {
      videoRef.current?.play().catch((error) => onError?.(error));
    },
    pause: () => videoRef.current?.pause(),
    seek: (seconds: number) => {
      if (videoRef.current) videoRef.current.currentTime = seconds;
    },
    getCurrentTime: () => videoRef.current?.currentTime || 0,
    getDuration: () => videoRef.current?.duration || 0,
    getState: () => getVideoState(videoRef.current),
  }));

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const ready = () => onReady?.();
    const stateChanged = () => onStateChange?.(getVideoState(video));
    const errored = () => onError?.(video.error);

    video.addEventListener('loadedmetadata', ready);
    video.addEventListener('play', stateChanged);
    video.addEventListener('pause', stateChanged);
    video.addEventListener('seeked', stateChanged);
    video.addEventListener('ended', stateChanged);
    video.addEventListener('error', errored);

    return () => {
      video.removeEventListener('loadedmetadata', ready);
      video.removeEventListener('play', stateChanged);
      video.removeEventListener('pause', stateChanged);
      video.removeEventListener('seeked', stateChanged);
      video.removeEventListener('ended', stateChanged);
      video.removeEventListener('error', errored);
    };
  }, [onReady, onStateChange, onError]);

  return (
    <video
      ref={videoRef}
      src={src}
      controls={controls}
      playsInline
      className="local-video-frame"
    />
  );
});

export default LocalFilePlayer;
