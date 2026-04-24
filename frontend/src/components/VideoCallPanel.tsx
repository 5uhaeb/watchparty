'use client';

import { useEffect, useRef, useState } from 'react';
import { socket } from '@/lib/socket';
import { ICE_SERVERS } from '@/lib/iceServers';

interface PeerState {
  userId: string;
  name: string;
  stream: MediaStream | null;
  status: string;
}

const MAX_CALL_USERS = 10;

const CALL_MEDIA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    width: { ideal: 640, max: 960 },
    height: { ideal: 360, max: 540 },
    frameRate: { ideal: 15, max: 20 },
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
  },
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
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [peers, setPeers] = useState<PeerState[]>([]);
  const [callError, setCallError] = useState('');

  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());

  const updatePeer = (userId: string, patch: Partial<PeerState>) => {
    setPeers((current) =>
      current.map((peer) => peer.userId === userId ? { ...peer, ...patch } : peer)
    );
  };

  const ensurePeer = (userId: string, name = userId) => {
    setPeers((current) => {
      if (current.some((peer) => peer.userId === userId)) {
        return current.map((peer) => peer.userId === userId ? { ...peer, name } : peer);
      }
      return [...current, { userId, name, stream: null, status: 'Connecting' }];
    });
  };

  const createPC = (remoteUserId: string, remoteName: string, initiator: boolean) => {
    const existing = pcsRef.current.get(remoteUserId);
    if (existing) return existing;

    ensurePeer(remoteUserId, remoteName);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcsRef.current.set(remoteUserId, pc);

    localStreamRef.current?.getTracks().forEach((track) => {
      pc.addTrack(track, localStreamRef.current!);
    });

    const remoteStream = new MediaStream();
    pc.ontrack = (event) => {
      const incomingStream = event.streams[0] || remoteStream;
      incomingStream.getTracks().forEach((track) => {
        if (!remoteStream.getTracks().some((existingTrack) => existingTrack.id === track.id)) {
          remoteStream.addTrack(track);
        }
      });
      updatePeer(remoteUserId, { stream: remoteStream, status: 'Connected' });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') updatePeer(remoteUserId, { status: 'Connected' });
      if (pc.connectionState === 'connecting') updatePeer(remoteUserId, { status: 'Connecting' });
      if (['failed', 'disconnected'].includes(pc.connectionState)) {
        updatePeer(remoteUserId, { status: 'Reconnecting' });
        pc.restartIce?.();
      }
      if (pc.connectionState === 'closed') updatePeer(remoteUserId, { status: 'Left' });
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      socket.emit('call:signal', {
        to: remoteUserId,
        from: currentUser.id,
        signal: { type: 'ice-candidate', candidate: event.candidate },
      });
    };

    if (initiator) {
      pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          socket.emit('call:signal', {
            to: remoteUserId,
            from: currentUser.id,
            signal: { type: 'offer', sdp: pc.localDescription },
          });
        })
        .catch(() => updatePeer(remoteUserId, { status: 'Could not connect' }));
    }

    return pc;
  };

  const unlockAudio = async () => {
    setAudioUnlocked(true);
    const mediaElements = Array.from(document.querySelectorAll<HTMLMediaElement>('[data-call-media]'));
    await Promise.allSettled(mediaElements.map((element) => element.play()));
  };

  const joinCall = async () => {
    try {
      setCallError('');
      const stream = await navigator.mediaDevices.getUserMedia(CALL_MEDIA_CONSTRAINTS);
      localStreamRef.current = stream;
      setIsInCall(true);
      setAudioUnlocked(true);
      socket.emit('call:join', {
        roomCode,
        userId: currentUser.id,
        name: currentUser.name
      });
    } catch {
      setCallError('Could not access camera/microphone. Check browser permissions.');
    }
  };

  useEffect(() => {
    if (!isInCall || !localVideoRef.current || !localStreamRef.current) return;
    localVideoRef.current.srcObject = localStreamRef.current;
    localVideoRef.current.play().catch(() => null);
  }, [isInCall]);

  const leaveCall = () => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    pcsRef.current.forEach((pc) => pc.close());
    pcsRef.current.clear();
    localStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setPeers([]);
    setIsInCall(false);
    socket.emit('call:leave', { roomCode, userId: currentUser.id });
  };

  const toggleMic = () => {
    const next = !isMicOn;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
    setIsMicOn(next);
  };

  const toggleCam = () => {
    const next = !isCamOn;
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = next;
    });
    setIsCamOn(next);
  };

  useEffect(() => {
    if (!isInCall) return;

    const handleMembers = ({ members }: { members?: Array<{ userId: string; name: string }> }) => {
      for (const member of members || []) {
        if (member.userId !== currentUser.id) createPC(member.userId, member.name, true);
      }
    };

    const handleUserJoined = ({ userId, name }: { userId: string; name: string }) => {
      if (userId === currentUser.id) return;
      createPC(userId, name, true);
    };

    const handleFull = ({ limit }: { limit: number }) => {
      setCallError(`Video call is full. Limit is ${limit || MAX_CALL_USERS} users.`);
      leaveCall();
    };

    const handleNameChanged = ({ guestId, displayName }: { guestId?: string; displayName?: string }) => {
      if (!guestId || !displayName) return;
      updatePeer(guestId, { name: displayName });
    };

    const handleSignal = async ({
      from,
      signal
    }: {
      from: string;
      signal: { type: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
    }) => {
      let pc = pcsRef.current.get(from);

      try {
        if (signal.type === 'offer') {
          if (!pc) pc = createPC(from, from, false);
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp!));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('call:signal', {
            to: from,
            from: currentUser.id,
            signal: { type: 'answer', sdp: pc.localDescription },
          });
        } else if (signal.type === 'answer' && pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp!));
        } else if (signal.type === 'ice-candidate' && pc) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate!));
        }
      } catch {
        updatePeer(from, { status: 'Signal failed' });
      }
    };

    const handleUserLeft = ({ userId }: { userId: string }) => {
      pcsRef.current.get(userId)?.close();
      pcsRef.current.delete(userId);
      setPeers((current) => current.filter((peer) => peer.userId !== userId));
    };

    socket.on('call:members', handleMembers);
    socket.on('call:full', handleFull);
    socket.on('call:user-joined', handleUserJoined);
    socket.on('call:signal', handleSignal);
    socket.on('call:user-left', handleUserLeft);
    socket.on('guest:nameChanged', handleNameChanged);
    socket.on('participant:updated', handleNameChanged);

    return () => {
      socket.off('call:members', handleMembers);
      socket.off('call:full', handleFull);
      socket.off('call:user-joined', handleUserJoined);
      socket.off('call:signal', handleSignal);
      socket.off('call:user-left', handleUserLeft);
      socket.off('guest:nameChanged', handleNameChanged);
      socket.off('participant:updated', handleNameChanged);
    };
  }, [isInCall, currentUser.id, roomCode]);

  if (!isInCall) {
    return (
      <div className="card glass" style={{ padding: '20px', textAlign: 'center' }}>
        <div className="label-tag" style={{ marginBottom: '8px' }}>Call</div>
        <h3 style={{ margin: '0 0 6px' }}>Video Call</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 16px' }}>
          Up to {MAX_CALL_USERS} people. Call audio is separated from the watch player.
        </p>
        <button className="button" onClick={joinCall} style={{ width: '100%' }}>
          Join Call
        </button>
        {callError && <p style={{ color: 'var(--red)', margin: '10px 0 0' }}>{callError}</p>}
      </div>
    );
  }

  const totalVideos = peers.length + 1;
  const cols = totalVideos <= 1 ? 1 : totalVideos <= 4 ? 2 : 3;

  return (
    <div className="card glass" style={{ padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>
          Video Call
          <span style={{ marginLeft: '8px', background: 'var(--primary)', color: 'white', padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem' }}>
            {totalVideos}/{MAX_CALL_USERS}
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
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gap: '8px',
          marginBottom: '12px'
        }}
      >
        <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', background: '#000', aspectRatio: '4/3' }}>
          <video ref={localVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          {!isCamOn && (
            <div style={{ position: 'absolute', inset: 0, background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 700, color: 'white' }}>
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div style={{ position: 'absolute', bottom: '6px', left: '6px', background: 'rgba(0,0,0,0.65)', color: 'white', padding: '2px 7px', borderRadius: '6px', fontSize: '0.72rem' }}>
            You {!isMicOn ? 'Muted' : ''}
          </div>
        </div>

        {peers.map((peer) => (
          <PeerVideo key={peer.userId} peer={peer} audioUnlocked={audioUnlocked} />
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
        <button
          className="button button-secondary"
          onClick={unlockAudio}
          style={{ flex: 1, padding: '9px', fontSize: '0.85rem' }}
        >
          Enable audio
        </button>
      </div>
    </div>
  );
}

function PeerVideo({ peer, audioUnlocked }: { peer: PeerState; audioUnlocked: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!peer.stream) return;

    if (videoRef.current) {
      videoRef.current.srcObject = peer.stream;
      videoRef.current.play().catch(() => null);
    }
    if (audioRef.current) {
      audioRef.current.srcObject = peer.stream;
      if (audioUnlocked) audioRef.current.play().catch(() => null);
    }
  }, [audioUnlocked, peer.stream]);

  return (
    <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', background: '#000', aspectRatio: '4/3' }}>
      {peer.stream ? (
        <>
          <video ref={videoRef} data-call-media autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          <audio ref={audioRef} data-call-media autoPlay />
        </>
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: '#0d1117', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'white' }}>
            {peer.name.charAt(0).toUpperCase()}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{peer.status}</div>
        </div>
      )}
      <div style={{ position: 'absolute', bottom: '6px', left: '6px', background: 'rgba(0,0,0,0.65)', color: 'white', padding: '2px 7px', borderRadius: '6px', fontSize: '0.72rem' }}>
        {peer.name}
      </div>
    </div>
  );
}
