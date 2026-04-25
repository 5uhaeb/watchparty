'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from '@/lib/socket';
import { ICE_SERVERS } from '@/lib/iceServers';
import { formatFileSize, formatDuration } from '@/lib/formats';

type LocalStreamSource = {
  fileName?: string;
  sizeBytes?: number;
  fileSize?: number;
  durationSec?: number;
  hostSocketId?: string;
  hostGuestId?: string;
};

type Props = {
  roomCode: string;
  isHost: boolean;
  currentUserId?: string;
  file?: File | null;
  sourceData?: LocalStreamSource;
  onStopped?: () => void;
};

type CapturableVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

export default function LocalStreamPlayer({
  roomCode,
  isHost,
  currentUserId,
  file,
  sourceData,
  onStopped,
}: Props) {
  const hostVideoRef = useRef<CapturableVideo | null>(null);
  const viewerVideoRef = useRef<HTMLVideoElement | null>(null);
  const viewerAudioRef = useRef<HTMLAudioElement | null>(null);
  const fallbackVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const viewerPeerRef = useRef<RTCPeerConnection | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const [status, setStatus] = useState(isHost ? 'Choose a file to start streaming.' : 'Connecting...');
  const [viewerCount, setViewerCount] = useState(0);
  const [needsPlayClick, setNeedsPlayClick] = useState(false);
  const [remoteTrackSummary, setRemoteTrackSummary] = useState('');
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [fallbackFileName, setFallbackFileName] = useState('');

  const fileName = sourceData?.fileName || file?.name || 'Local video';
  const sizeBytes = sourceData?.sizeBytes || sourceData?.fileSize || file?.size;
  const durationSec = sourceData?.durationSec;

  useEffect(() => {
    return () => {
      if (fallbackUrl) URL.revokeObjectURL(fallbackUrl);
    };
  }, [fallbackUrl]);

  const closeHostPeers = useCallback(() => {
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    setViewerCount(0);
  }, []);

  const cleanupHostStream = useCallback((emitStop: boolean) => {
    closeHostPeers();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    if (emitStop) {
      socket.emit('room:setSource', { type: 'clear' });
    }
  }, [closeHostPeers]);

  const captureHostStream = useCallback(() => {
    const video = hostVideoRef.current;
    if (!video) return null;

    const stream = video.captureStream?.() ?? video.mozCaptureStream?.();
    if (!stream) {
      setStatus('This browser cannot capture local video playback.');
      return null;
    }

    streamRef.current = stream;
    return stream;
  }, []);

  const createOfferForViewer = useCallback(
    async (viewerSocketId: string) => {
      if (!isHost) return;

      const stream = streamRef.current || captureHostStream();
      if (!stream) return;

      peersRef.current.get(viewerSocketId)?.close();

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peersRef.current.set(viewerSocketId, pc);
      setViewerCount(peersRef.current.size);

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        socket.emit('webrtc:signal', {
          toSocketId: viewerSocketId,
          data: { candidate: event.candidate },
        });
      };

      pc.onconnectionstatechange = () => {
        if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
          peersRef.current.delete(viewerSocketId);
          setViewerCount(peersRef.current.size);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('webrtc:signal', {
        toSocketId: viewerSocketId,
        data: { sdp: pc.localDescription },
      });
    },
    [captureHostStream, isHost]
  );

  useEffect(() => {
    if (!isHost || !file || !hostVideoRef.current) return;

    const video = hostVideoRef.current;
    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;
    video.src = objectUrl;
    video.load();
    setStatus('Loading local file...');

    const handleLoadedMetadata = () => {
      const stream = captureHostStream();
      if (!stream) return;

      socket.emit('room:setSource', {
        type: 'localStream',
        fileName: file.name,
        sizeBytes: file.size,
        durationSec: Number.isFinite(video.duration) ? video.duration : undefined,
      });
      setStatus('Streaming to viewers. Press play if the video is paused.');
    };
    const emitPlay = () => socket.emit('player:play', { roomCode, userId: currentUserId, positionSec: video.currentTime || 0 });
    const emitPause = () => socket.emit('player:pause', { roomCode, userId: currentUserId, positionSec: video.currentTime || 0 });
    const emitSeek = () => socket.emit('player:seek', { roomCode, userId: currentUserId, positionSec: video.currentTime || 0 });
    const handlePlaybackReady = () => {
      captureHostStream();
      for (const viewerSocketId of peersRef.current.keys()) {
        createOfferForViewer(viewerSocketId).catch(() => null);
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', emitPlay);
    video.addEventListener('pause', emitPause);
    video.addEventListener('seeked', emitSeek);
    video.addEventListener('play', handlePlaybackReady);
    video.addEventListener('canplay', handlePlaybackReady);
    const heartbeatId = window.setInterval(() => {
      if (!video.paused && !video.ended) {
        socket.emit('player:heartbeat', { roomCode, positionSec: video.currentTime || 0 });
      }
    }, 3000);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', emitPlay);
      video.removeEventListener('pause', emitPause);
      video.removeEventListener('seeked', emitSeek);
      video.removeEventListener('play', handlePlaybackReady);
      video.removeEventListener('canplay', handlePlaybackReady);
      window.clearInterval(heartbeatId);
      cleanupHostStream(true);
    };
  }, [captureHostStream, cleanupHostStream, createOfferForViewer, currentUserId, file, isHost, roomCode]);

  useEffect(() => {
    if (isHost || !fallbackUrl) return;

    const video = fallbackVideoRef.current;
    if (!video) return;

    const applyPosition = (positionSec: number, playing: boolean, atServerTs?: number) => {
      const latencySec = playing && atServerTs ? Math.max(0, (Date.now() - atServerTs) / 1000) : 0;
      const target = Math.max(0, positionSec + latencySec);
      if (Math.abs((video.currentTime || 0) - target) > 0.5) video.currentTime = target;
      if (playing) video.play().catch(() => null);
      else video.pause();
    };

    const onPlay = ({ positionSec, atServerTs, byUserId }: { positionSec: number; atServerTs?: number; byUserId?: string }) => {
      if (byUserId !== currentUserId) applyPosition(positionSec || 0, true, atServerTs);
    };
    const onPause = ({ positionSec, byUserId }: { positionSec: number; byUserId?: string }) => {
      if (byUserId !== currentUserId) applyPosition(positionSec || 0, false);
    };
    const onSeek = ({ positionSec, byUserId }: { positionSec: number; byUserId?: string }) => {
      if (byUserId !== currentUserId) applyPosition(positionSec || 0, !video.paused);
    };
    const onHeartbeat = ({ positionSec, atServerTs, byUserId }: { positionSec: number; atServerTs?: number; byUserId?: string }) => {
      if (byUserId === currentUserId) return;
      if (!video.paused) applyPosition(positionSec || 0, true, atServerTs);
    };
    const onPlayerState = ({ positionSec, isPlaying, serverTs }: { positionSec: number; isPlaying: boolean; serverTs?: number }) => {
      applyPosition(positionSec || 0, !!isPlaying, serverTs);
    };

    socket.on('player:play', onPlay);
    socket.on('player:pause', onPause);
    socket.on('player:seek', onSeek);
    socket.on('player:heartbeat', onHeartbeat);
    socket.on('player:state', onPlayerState);
    socket.emit('player:state', { roomCode });

    return () => {
      socket.off('player:play', onPlay);
      socket.off('player:pause', onPause);
      socket.off('player:seek', onSeek);
      socket.off('player:heartbeat', onHeartbeat);
      socket.off('player:state', onPlayerState);
    };
  }, [currentUserId, fallbackUrl, isHost, roomCode]);

  useEffect(() => {
    if (!isHost) return;

    const handleViewerReady = ({ viewerSocketId }: { viewerSocketId: string }) => {
      createOfferForViewer(viewerSocketId).catch((error) => {
        console.error('Failed to create local stream offer', error);
        setStatus('Could not connect a viewer.');
      });
    };

    const handleSignal = async ({ fromSocketId, data }: { fromSocketId: string; data: any }) => {
      const pc = peersRef.current.get(fromSocketId);
      if (!pc) return;

      try {
        if (data.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        } else if (data.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      } catch (error) {
        console.error('Host WebRTC signal failed', error);
      }
    };

    socket.on('webrtc:viewerReady', handleViewerReady);
    socket.on('webrtc:signal', handleSignal);

    return () => {
      socket.off('webrtc:viewerReady', handleViewerReady);
      socket.off('webrtc:signal', handleSignal);
      closeHostPeers();
    };
  }, [closeHostPeers, createOfferForViewer, isHost]);

  useEffect(() => {
    if (isHost || !sourceData?.hostSocketId) return;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    viewerPeerRef.current = pc;
    setStatus('Connecting...');

    pc.ontrack = (event) => {
      const video = viewerVideoRef.current;
      if (!video) return;

      const remoteStream = event.streams[0];
      const videoTracks = remoteStream.getVideoTracks().length;
      const audioTracks = remoteStream.getAudioTracks().length;
      setRemoteTrackSummary(`${videoTracks} video / ${audioTracks} audio track${videoTracks + audioTracks === 1 ? '' : 's'}`);

      video.srcObject = remoteStream;
      video.muted = true;
      video.volume = 1;
      video.load();
      if (viewerAudioRef.current) {
        viewerAudioRef.current.srcObject = remoteStream;
        viewerAudioRef.current.volume = 1;
      }
      video.play().then(
        () => {
          setNeedsPlayClick(false);
          viewerAudioRef.current?.play().catch(() => {
            setNeedsPlayClick(true);
            setStatus('Video connected. Tap Start audio/video to hear audio.');
          });
          setStatus('Watching host stream.');
        },
        () => {
          setNeedsPlayClick(true);
          setStatus('Connected. Tap play to hear audio.');
        }
      );
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      socket.emit('webrtc:signal', {
        toSocketId: sourceData.hostSocketId,
        data: { candidate: event.candidate },
      });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setStatus((current) => current.startsWith('Connected') ? current : 'Connected. Tap play if video does not start.');
      }
      if (pc.connectionState === 'failed') {
        setStatus('Connection failed. TURN may be required for this network.');
      }
      if (pc.connectionState === 'disconnected') {
        setStatus('Stream disconnected.');
      }
    };

    const handleSignal = async ({ fromSocketId, data }: { fromSocketId: string; data: any }) => {
      if (fromSocketId !== sourceData.hostSocketId) return;

      try {
        if (data.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('webrtc:signal', {
            toSocketId: fromSocketId,
            data: { sdp: pc.localDescription },
          });
        } else if (data.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      } catch (error) {
        console.error('Viewer WebRTC signal failed', error);
        setStatus('Could not connect to host stream.');
      }
    };

    socket.on('webrtc:signal', handleSignal);
    socket.emit('webrtc:viewerReady');
    const readyIntervalId = window.setInterval(() => {
      if (viewerVideoRef.current?.srcObject) {
        window.clearInterval(readyIntervalId);
        return;
      }
      socket.emit('webrtc:viewerReady');
    }, 4000);

    const applyRemotePlayback = ({ positionSec, atServerTs, isPlaying, byUserId }: { positionSec?: number; atServerTs?: number; isPlaying?: boolean; byUserId?: string }) => {
      if (byUserId === currentUserId) return;
      const video = viewerVideoRef.current;
      const audio = viewerAudioRef.current;
      if (!video) return;
      const playing = isPlaying ?? true;
      const latencySec = playing && atServerTs ? Math.max(0, (Date.now() - atServerTs) / 1000) : 0;
      const target = Math.max(0, Number(positionSec || 0) + latencySec);
      if (Number.isFinite(target) && Math.abs((video.currentTime || 0) - target) > 0.7) {
        video.currentTime = target;
      }
      if (playing) {
        video.play().catch(() => setNeedsPlayClick(true));
        audio?.play().catch(() => setNeedsPlayClick(true));
      } else {
        video.pause();
        audio?.pause();
      }
    };
    const handlePlay = (payload: { positionSec?: number; atServerTs?: number; byUserId?: string }) => applyRemotePlayback({ ...payload, isPlaying: true });
    const handlePause = (payload: { positionSec?: number; byUserId?: string }) => applyRemotePlayback({ ...payload, isPlaying: false });
    const handleSeek = (payload: { positionSec?: number; byUserId?: string }) => applyRemotePlayback({ ...payload, isPlaying: !viewerVideoRef.current?.paused });
    const handleHeartbeat = (payload: { positionSec?: number; atServerTs?: number; byUserId?: string }) => {
      if (!viewerVideoRef.current?.paused) applyRemotePlayback({ ...payload, isPlaying: true });
    };
    const handlePlayerState = (payload: { positionSec?: number; isPlaying?: boolean; serverTs?: number }) => {
      applyRemotePlayback({ positionSec: payload.positionSec, isPlaying: payload.isPlaying, atServerTs: payload.serverTs });
    };
    socket.on('player:play', handlePlay);
    socket.on('player:pause', handlePause);
    socket.on('player:seek', handleSeek);
    socket.on('player:heartbeat', handleHeartbeat);
    socket.on('player:state', handlePlayerState);
    const stateTimer = window.setTimeout(() => socket.emit('player:state', { roomCode }), 300);

    return () => {
      socket.off('webrtc:signal', handleSignal);
      socket.off('player:play', handlePlay);
      socket.off('player:pause', handlePause);
      socket.off('player:seek', handleSeek);
      socket.off('player:heartbeat', handleHeartbeat);
      socket.off('player:state', handlePlayerState);
      window.clearTimeout(stateTimer);
      window.clearInterval(readyIntervalId);
      viewerPeerRef.current = null;
      pc.close();
      if (viewerVideoRef.current) viewerVideoRef.current.srcObject = null;
    };
  }, [currentUserId, isHost, roomCode, sourceData?.hostSocketId]);

  const stopStreaming = () => {
    cleanupHostStream(true);
    onStopped?.();
    setStatus('Stream stopped.');
  };

  const playViewerVideo = () => {
    const video = viewerVideoRef.current;
    if (!video) return;

    video.muted = true;
    video.volume = 1;
    Promise.allSettled([
      video.play(),
      viewerAudioRef.current?.play() || Promise.resolve(),
    ]).then((results) => {
      const blocked = results.some((result) => result.status === 'rejected');
      setNeedsPlayClick(false);
      setStatus(blocked ? 'Video playing. Tap again or use browser controls for audio.' : 'Watching host stream.');
    });
  };

  if (isHost) {
    return (
      <div className="player-stack">
        <div className="player-toolbar">
          <button className="button button-secondary" onClick={stopStreaming}>
            Stop streaming
          </button>
          <span className="label-tag">{viewerCount} viewer{viewerCount === 1 ? '' : 's'}</span>
        </div>
        <video ref={hostVideoRef} data-watch-media className="local-video-frame" controls playsInline preload="metadata" />
        <div className="card glass">
          <h3 style={{ margin: '0 0 8px' }}>Streaming local file</h3>
          <p style={{ color: 'var(--text-secondary)', margin: 0, overflowWrap: 'anywhere' }}>
            {fileName} ({formatFileSize(sizeBytes)}, {formatDuration(durationSec)})
          </p>
          <p style={{ color: 'var(--text-secondary)', margin: '8px 0 0', fontSize: '0.85rem' }}>
            {status}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="player-stack">
      <div className="card glass">
        <h3 style={{ margin: '0 0 8px' }}>Host is streaming</h3>
        <p style={{ color: 'var(--text-secondary)', margin: 0, overflowWrap: 'anywhere' }}>
          {fileName} ({formatFileSize(sizeBytes)}, {formatDuration(durationSec)})
        </p>
        <p style={{ color: 'var(--text-secondary)', margin: '8px 0 0', fontSize: '0.85rem' }}>
          {status}
          {remoteTrackSummary && ` (${remoteTrackSummary})`}
        </p>
      </div>
      <video
        ref={viewerVideoRef}
        data-watch-media
        className="local-video-frame"
        autoPlay
        controls
        muted
        playsInline
        preload="auto"
        title="Host stream"
        onLoadedMetadata={playViewerVideo}
        onCanPlay={playViewerVideo}
        onPlaying={() => setStatus('Watching host stream.')}
        onWaiting={() => setStatus('Buffering host stream...')}
        onClick={playViewerVideo}
      />
      <audio ref={viewerAudioRef} autoPlay />
      <div className="card glass" style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0 }}>Mobile fallback</h3>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
          If the host stream keeps buffering, select the same file on this device. It will sync to the host timeline.
        </p>
        <input
          id="local-stream-fallback-input"
          type="file"
          accept="video/*,.mp4,.webm,.mov,.m4v"
          style={{ display: 'none' }}
          onChange={(event) => {
            const selected = event.target.files?.[0];
            if (!selected) return;
            if (fallbackUrl) URL.revokeObjectURL(fallbackUrl);
            setFallbackUrl(URL.createObjectURL(selected));
            setFallbackFileName(selected.name);
          }}
        />
        <button className="button button-secondary" onClick={() => document.getElementById('local-stream-fallback-input')?.click()}>
          Select same file locally
        </button>
        {fallbackUrl && (
          <>
            <div style={{ color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>{fallbackFileName}</div>
            <video ref={fallbackVideoRef} data-watch-media className="local-video-frame" src={fallbackUrl} controls playsInline />
          </>
        )}
      </div>
      <div className="player-toolbar">
        <button className="button button-secondary" onClick={playViewerVideo}>
          {needsPlayClick ? 'Play stream' : 'Start audio/video'}
        </button>
      </div>
    </div>
  );
}
