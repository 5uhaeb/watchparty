'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import Hls from 'hls.js';
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

function isHlsUrl(src: string) {
  try {
    const url = new URL(src, window.location.href);
    return /\.m3u8(?:$|[?#])/i.test(url.pathname) || url.search.toLowerCase().includes('m3u8');
  } catch {
    return /\.m3u8(?:$|[?#])/i.test(src);
  }
}

const LocalFilePlayer = forwardRef<PlayerAdapter, Props>(function LocalFilePlayer(
  { src, controls = true, onReady, onStateChange, onError },
  ref
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    play: () => {
      videoRef.current?.play().catch((error) => onError?.(error));
    },
    pause: () => videoRef.current?.pause(),
    seek: (seconds: number) => {
      if (videoRef.current) videoRef.current.currentTime = seconds;
    },
    setPlaybackRate: (rate: number) => {
      if (videoRef.current) videoRef.current.playbackRate = rate;
    },
    getCurrentTime: () => videoRef.current?.currentTime || 0,
    getDuration: () => videoRef.current?.duration || 0,
    getState: () => getVideoState(videoRef.current),
  }));

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let hls: Hls | null = null;

    setError(null);

    if (isHlsUrl(src)) {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
      } else if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 90,
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls?.startLoad();
            setError('Stream network error. Retrying...');
            return;
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls?.recoverMediaError();
            setError('Stream decoding error. Retrying...');
            return;
          }
          setError('This HLS stream could not be played by the browser.');
          onError?.(data);
        });
        hls.loadSource(src);
        hls.attachMedia(video);
      } else {
        setError('This browser does not support HLS playback.');
      }
    } else {
      video.src = src;
    }

    const ready = () => {
      setError(null);
      onReady?.();
    };
    const stateChanged = () => onStateChange?.(getVideoState(video));
    const errored = () => {
      const mediaError = video.error;
      let errorMsg = 'Video failed to load';
      
      if (mediaError) {
        switch (mediaError.code) {
          case 1:
            errorMsg = 'Video loading aborted';
            break;
          case 2:
            errorMsg = 'Network error - check if the video URL is accessible';
            break;
          case 3:
            errorMsg = 'Video decoding failed';
            break;
          case 4:
            errorMsg = 'Video format not supported by your browser';
            break;
          default:
            errorMsg = `Video error: ${mediaError.message}`;
        }
      }

      // Check if it's a local file path (Windows or Unix style)
      if (src && (src.includes('C:\\') || src.startsWith('/'))) {
        errorMsg = `Local file paths cannot be played directly. Please use a publicly accessible HTTP/HTTPS URL or upload the file.`;
      }

      setError(errorMsg);
      onError?.(mediaError);
    };

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
      hls?.destroy();
    };
  }, [onReady, onStateChange, onError, src]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <video
        ref={videoRef}
        data-watch-media
        controls={controls}
        playsInline
        preload="metadata"
        crossOrigin="anonymous"
        className="local-video-frame"
      />
      {error && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: '#ff6b6b',
            padding: '24px',
            textAlign: 'center',
            fontSize: '14px',
            lineHeight: '1.5',
            pointerEvents: 'none',
          }}
        >
          <div style={{ maxWidth: '400px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>❌ {error}</div>
            <div style={{ fontSize: '12px', color: '#aaa', marginTop: '12px' }}>
              Use a public HTTP/HTTPS URL or implement file upload support
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default LocalFilePlayer;
