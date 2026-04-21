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
};

type Props = {
  roomCode: string;
  isHost: boolean;
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
  file,
  sourceData,
  onStopped,
}: Props) {
  const hostVideoRef = useRef<CapturableVideo | null>(null);
  const viewerVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const viewerPeerRef = useRef<RTCPeerConnection | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const [status, setStatus] = useState(isHost ? 'Choose a file to start streaming.' : 'Connecting...');
  const [viewerCount, setViewerCount] = useState(0);
  const [needsPlayClick, setNeedsPlayClick] = useState(false);

  const fileName = sourceData?.fileName || file?.name || 'Local video';
  const sizeBytes = sourceData?.sizeBytes || sourceData?.fileSize || file?.size;
  const durationSec = sourceData?.durationSec;

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
      setStatus('Streaming to viewers.');
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      cleanupHostStream(true);
    };
  }, [captureHostStream, cleanupHostStream, file, isHost]);

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

      video.srcObject = event.streams[0];
      video.play().then(
        () => {
          setNeedsPlayClick(false);
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

    return () => {
      socket.off('webrtc:signal', handleSignal);
      viewerPeerRef.current = null;
      pc.close();
      if (viewerVideoRef.current) viewerVideoRef.current.srcObject = null;
    };
  }, [isHost, sourceData?.hostSocketId]);

  const stopStreaming = () => {
    cleanupHostStream(true);
    onStopped?.();
    setStatus('Stream stopped.');
  };

  const playViewerVideo = () => {
    viewerVideoRef.current?.play().then(() => {
      setNeedsPlayClick(false);
      setStatus('Watching host stream.');
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
        <video ref={hostVideoRef} className="local-video-frame" controls playsInline />
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
        </p>
      </div>
      <video ref={viewerVideoRef} className="local-video-frame" autoPlay playsInline title="Controlled by host." />
      <div className="player-toolbar">
        <button className="button button-secondary" disabled title="Controlled by host.">
          Controlled by host
        </button>
        {needsPlayClick && (
          <button className="button" onClick={playViewerVideo}>
            Play stream
          </button>
        )}
      </div>
    </div>
  );
}
