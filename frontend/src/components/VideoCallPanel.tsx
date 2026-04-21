'use client';

import { useEffect, useRef, useState } from 'react';
import { socket } from '@/lib/socket';

interface PeerState {
  userId: string;
  name: string;
  stream: MediaStream | null;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

export default function VideoCallPanel({
  roomCode,
  currentUser
}: {
  roomCode: string;
  currentUser: { id: string; name: string };
}) {
  const [isInCall, setIsInCall] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [peers, setPeers] = useState<PeerState[]>([]);

  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  // Map: remoteUserId → RTCPeerConnection
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());

  const createPC = (remoteUserId: string, initiator: boolean) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcsRef.current.set(remoteUserId, pc);

    // Add local tracks
    localStreamRef.current?.getTracks().forEach(track =>
      pc.addTrack(track, localStreamRef.current!)
    );

    // Receive remote stream
    const remoteStream = new MediaStream();
    pc.ontrack = (e) => {
      e.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
      setPeers(prev =>
        prev.map(p => (p.userId === remoteUserId ? { ...p, stream: remoteStream } : p))
      );
    };

    // Relay ICE candidates through server
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('call:signal', {
          to: remoteUserId,
          from: currentUser.id,
          signal: { type: 'ice-candidate', candidate: e.candidate }
        });
      }
    };

    if (initiator) {
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
          socket.emit('call:signal', {
            to: remoteUserId,
            from: currentUser.id,
            signal: { type: 'offer', sdp: pc.localDescription }
          });
        });
    }

    return pc;
  };

  const joinCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      setIsInCall(true);
      socket.emit('call:join', {
        roomCode,
        userId: currentUser.id,
        name: currentUser.name
      });
    } catch {
      alert('Could not access camera/microphone. Please check permissions.');
    }
  };

  const leaveCall = () => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    pcsRef.current.forEach(pc => pc.close());
    pcsRef.current.clear();
    localStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setPeers([]);
    setIsInCall(false);
    socket.emit('call:leave', { roomCode, userId: currentUser.id });
  };

  const toggleMic = () => {
    localStreamRef.current?.getAudioTracks().forEach(t => {
      t.enabled = !t.enabled;
    });
    setIsMicOn(p => !p);
  };

  const toggleCam = () => {
    localStreamRef.current?.getVideoTracks().forEach(t => {
      t.enabled = !t.enabled;
    });
    setIsCamOn(p => !p);
  };

  useEffect(() => {
    if (!isInCall) return;

    const handleUserJoined = ({ userId, name }: { userId: string; name: string }) => {
      if (userId === currentUser.id) return;
      setPeers(prev => {
        if (prev.some(p => p.userId === userId)) return prev;
        return [...prev, { userId, name, stream: null }];
      });
      // Existing users send an offer to the newcomer.
      createPC(userId, true);
    };

    const handleSignal = async ({
      from,
      signal
    }: {
      from: string;
      signal: { type: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
    }) => {
      let pc = pcsRef.current.get(from);

      if (signal.type === 'offer') {
        if (!pc) {
          setPeers(prev => {
            if (prev.some(p => p.userId === from)) return prev;
            return [...prev, { userId: from, name: from, stream: null }];
          });
          pc = createPC(from, false);
        }
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp!));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('call:signal', {
          to: from,
          from: currentUser.id,
          signal: { type: 'answer', sdp: pc.localDescription }
        });
      } else if (signal.type === 'answer' && pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp!));
      } else if (signal.type === 'ice-candidate' && pc) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate!));
      }
    };

    const handleUserLeft = ({ userId }: { userId: string }) => {
      pcsRef.current.get(userId)?.close();
      pcsRef.current.delete(userId);
      setPeers(prev => prev.filter(p => p.userId !== userId));
    };

    socket.on('call:user-joined', handleUserJoined);
    socket.on('call:signal', handleSignal);
    socket.on('call:user-left', handleUserLeft);

    return () => {
      socket.off('call:user-joined', handleUserJoined);
      socket.off('call:signal', handleSignal);
      socket.off('call:user-left', handleUserLeft);
    };
  }, [isInCall, currentUser.id, roomCode]);

  if (!isInCall) {
    return (
      <div className="card glass" style={{ padding: '20px', textAlign: 'center' }}>
        <div className="label-tag" style={{ marginBottom: '8px' }}>Call</div>
        <h3 style={{ margin: '0 0 6px' }}>Video Call</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 16px' }}>
          Talk face-to-face while you watch
        </p>
        <button className="button" onClick={joinCall} style={{ width: '100%' }}>
          Join Call
        </button>
      </div>
    );
  }

  const totalVideos = peers.length + 1;
  const cols = totalVideos <= 1 ? 1 : 2;

  return (
    <div className="card glass" style={{ padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>
          Video Call
          <span style={{ marginLeft: '8px', background: 'var(--primary)', color: 'white', padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem' }}>
            {totalVideos}
          </span>
        </h3>
        <button
          className="button"
          onClick={leaveCall}
          style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', boxShadow: 'none' }}
        >
          Leave
        </button>
      </div>

      <div
        className="video-call-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: '8px',
          marginBottom: '12px'
        }}
      >
        {/* Local video */}
        <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', background: '#000', aspectRatio: '4/3' }}>
          <video ref={localVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          {!isCamOn && (
            <div style={{ position: 'absolute', inset: 0, background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 700, color: 'white' }}>
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div style={{ position: 'absolute', bottom: '6px', left: '6px', background: 'rgba(0,0,0,0.65)', color: 'white', padding: '2px 7px', borderRadius: '6px', fontSize: '0.72rem' }}>
            You {!isMicOn ? 'Muted' : ''}
          </div>
        </div>

        {/* Remote peers */}
        {peers.map(peer => (
          <PeerVideo key={peer.userId} peer={peer} />
        ))}
      </div>

      <div className="video-call-actions">
        <button
          className="button button-secondary"
          onClick={toggleMic}
          style={{ flex: 1, padding: '9px', fontSize: '0.85rem', background: isMicOn ? undefined : 'rgba(239,68,68,0.1)' }}
        >
          {isMicOn ? 'Mute' : 'Unmute'}
        </button>
        <button
          className="button button-secondary"
          onClick={toggleCam}
          style={{ flex: 1, padding: '9px', fontSize: '0.85rem', background: isCamOn ? undefined : 'rgba(239,68,68,0.1)' }}
        >
          {isCamOn ? 'Hide camera' : 'Show camera'}
        </button>
      </div>
    </div>
  );
}

function PeerVideo({ peer }: { peer: PeerState }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && peer.stream) {
      videoRef.current.srcObject = peer.stream;
    }
  }, [peer.stream]);

  return (
    <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', background: '#000', aspectRatio: '4/3' }}>
      {peer.stream ? (
        <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: '#0d1117', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'white' }}>
            {peer.name.charAt(0).toUpperCase()}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Connecting…</div>
        </div>
      )}
      <div style={{ position: 'absolute', bottom: '6px', left: '6px', background: 'rgba(0,0,0,0.65)', color: 'white', padding: '2px 7px', borderRadius: '6px', fontSize: '0.72rem' }}>
        {peer.name}
      </div>
    </div>
  );
}
