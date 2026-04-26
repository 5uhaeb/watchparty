'use client';

import { useEffect, useRef, useState } from 'react';
import { socket } from '@/lib/socket';
import { ICE_SERVERS } from '@/lib/iceServers';
import RoomAudioControls from '@/components/RoomAudioControls';

interface PeerState {
  socketId: string;
  userId: string;
  name: string;
  stream: MediaStream | null;
  status: string;
  badges: string[];
}

const MAX_CALL_USERS = 10;

const CALL_MEDIA_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  video: true,
};

export default function VideoCallPanel({
  roomCode,
  currentUser,
  displayMode = 'full',
}: {
  roomCode: string;
  currentUser: { id: string; name: string };
  displayMode?: 'full' | 'tiles';
}) {
  const [isInCall, setIsInCall] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [peers, setPeers] = useState<PeerState[]>([]);
  const [callError, setCallError] = useState('');
  const [audioSupportWarning, setAudioSupportWarning] = useState('');
  const [localBadges, setLocalBadges] = useState<string[]>([]);
  const [microphoneStream, setMicrophoneStream] = useState<MediaStream | null>(null);
  const [micVolume, setMicVolume] = useState(1);
  const [mediaVolume, setMediaVolume] = useState(1);
  const [mixedRoomVolume, setMixedRoomVolume] = useState(1);
  const [advancedAudio, setAdvancedAudio] = useState(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const peersStateRef = useRef<PeerState[]>([]);
  const hasJoinedCallRef = useRef(false);

  useEffect(() => {
    peersStateRef.current = peers;
  }, [peers]);

  const updatePeer = (socketId: string, patch: Partial<PeerState>) => {
    setPeers((current) =>
      current.map((peer) => peer.socketId === socketId ? { ...peer, ...patch } : peer)
    );
  };

  const ensurePeer = (socketId: string, userId: string, name = userId) => {
    setPeers((current) => {
      if (current.some((peer) => peer.socketId === socketId)) {
        return current.map((peer) => peer.socketId === socketId ? { ...peer, userId, name } : peer);
      }
      return [...current, { socketId, userId, name, stream: null, status: 'Connecting', badges: [] }];
    });
  };

  const flashLocalBadge = (badge: string) => {
    setLocalBadges((current) => Array.from(new Set([...current, badge])));
    window.setTimeout(() => {
      setLocalBadges((current) => current.filter((item) => item !== badge));
    }, 3800);
  };

  const flashPeerBadge = (socketId: string, badge: string) => {
    updatePeer(socketId, {
      badges: Array.from(new Set([...(peersStateRef.current.find((peer) => peer.socketId === socketId)?.badges || []), badge])),
    });
    window.setTimeout(() => {
      setPeers((current) =>
        current.map((peer) =>
          peer.socketId === socketId
            ? { ...peer, badges: peer.badges.filter((item) => item !== badge) }
            : peer
        )
      );
    }, 3800);
  };

  const addLocalTracksToPeerConnection = (pc: RTCPeerConnection) => {
    const localStream = localStreamRef.current;
    if (!localStream) return;

    localStream.getVideoTracks().forEach((cameraVideoTrack) => {
      pc.addTrack(cameraVideoTrack, localStream);
    });
  };

  const createPC = (remoteSocketId: string, remoteUserId: string, remoteName: string, initiator: boolean) => {
    const existing = pcsRef.current.get(remoteSocketId);
    if (existing) return existing;

    ensurePeer(remoteSocketId, remoteUserId, remoteName);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcsRef.current.set(remoteSocketId, pc);

    addLocalTracksToPeerConnection(pc);

    const remoteStream = new MediaStream();
    pc.ontrack = (event) => {
      const incomingStream = event.streams[0] || remoteStream;
      incomingStream.getTracks().forEach((track) => {
        if (!remoteStream.getTracks().some((existingTrack) => existingTrack.id === track.id)) {
          remoteStream.addTrack(track);
        }
      });
      updatePeer(remoteSocketId, { stream: remoteStream, status: 'Connected' });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') updatePeer(remoteSocketId, { status: 'Connected' });
      if (pc.connectionState === 'connecting') updatePeer(remoteSocketId, { status: 'Connecting' });
      if (['failed', 'disconnected'].includes(pc.connectionState)) {
        updatePeer(remoteSocketId, { status: 'Reconnecting via relay' });
        pc.restartIce?.();
      }
      if (pc.connectionState === 'closed') updatePeer(remoteSocketId, { status: 'Left' });
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        updatePeer(remoteSocketId, { status: 'Connected' });
      }
      if (pc.iceConnectionState === 'checking') {
        updatePeer(remoteSocketId, { status: 'Connecting' });
      }
      if (pc.iceConnectionState === 'failed') {
        updatePeer(remoteSocketId, { status: 'Relay needed' });
      }
      if (pc.iceConnectionState === 'disconnected') {
        updatePeer(remoteSocketId, { status: 'Reconnecting' });
      }
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      socket.emit('call:signal', {
        to: remoteSocketId,
        from: currentUser.id,
        signal: { type: 'ice-candidate', candidate: event.candidate },
      });
    };

    if (initiator) {
      pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: true })
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          socket.emit('call:signal', {
            to: remoteSocketId,
            from: currentUser.id,
            signal: { type: 'offer', sdp: pc.localDescription },
          });
        })
        .catch(() => updatePeer(remoteSocketId, { status: 'Could not connect' }));
    }

    return pc;
  };

  const flushPendingIce = async (socketId: string, pc: RTCPeerConnection) => {
    const pending = pendingIceRef.current.get(socketId) || [];
    pendingIceRef.current.delete(socketId);
    for (const candidate of pending) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => null);
    }
  };

  const unlockAudio = async () => {
    const mediaElements = Array.from(document.querySelectorAll<HTMLMediaElement>('[data-call-media]'));
    await Promise.allSettled(mediaElements.map((element) => element.play()));
  };

  const joinCall = async () => {
    try {
      setCallError('');
      setAudioSupportWarning('');
      const localCameraStream = await navigator.mediaDevices.getUserMedia({
        ...CALL_MEDIA_CONSTRAINTS,
        audio: {
          echoCancellation: !advancedAudio,
          noiseSuppression: !advancedAudio,
          autoGainControl: !advancedAudio,
        },
      });

      const stream = new MediaStream([
        ...localCameraStream.getVideoTracks(),
      ]);
      localStreamRef.current = stream;
      setMicrophoneStream(new MediaStream(localCameraStream.getAudioTracks()));
      setIsInCall(true);
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
    microphoneStream?.getTracks().forEach((track) => track.stop());
    pcsRef.current.forEach((pc) => pc.close());
    pcsRef.current.clear();
    localStreamRef.current = null;
    hasJoinedCallRef.current = false;
    setMicrophoneStream(null);
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setPeers([]);
    setIsInCall(false);
    socket.emit('call:leave', { roomCode, userId: currentUser.id });
  };

  const toggleMic = () => {
    const next = !isMicOn;
    microphoneStream?.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
    setIsMicOn(next);
    flashLocalBadge(next ? 'Mic on' : 'Muted');
    socket.emit('call:media-state', { roomCode, state: { micOn: next, camOn: isCamOn } });
  };

  const toggleCam = () => {
    const next = !isCamOn;
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = next;
    });
    setIsCamOn(next);
    flashLocalBadge(next ? 'Camera on' : 'Camera off');
    socket.emit('call:media-state', { roomCode, state: { micOn: isMicOn, camOn: next } });
  };

  useEffect(() => {
    if (!isInCall) return;

    const handleMembers = ({ members }: { members?: Array<{ socketId: string; userId: string; name: string }> }) => {
      for (const member of members || []) {
        if (member.userId !== currentUser.id) ensurePeer(member.socketId, member.userId, member.name);
      }
    };

    const handleUserJoined = ({ socketId, userId, name }: { socketId: string; userId: string; name: string }) => {
      if (userId === currentUser.id) return;
      createPC(socketId, userId, name, true);
    };

    const handleFull = ({ limit }: { limit: number }) => {
      setCallError(`Video call is full. Limit is ${limit || MAX_CALL_USERS} users.`);
      leaveCall();
    };

    const handleNameChanged = ({ guestId, displayName }: { guestId?: string; displayName?: string }) => {
      if (!guestId || !displayName) return;
      setPeers((current) => current.map((peer) => peer.userId === guestId ? { ...peer, name: displayName } : peer));
    };

    const handleMediaState = ({ socketId, state }: { socketId?: string; state?: { micOn?: boolean; camOn?: boolean } }) => {
      if (!socketId || !state) return;
      if (state.micOn === false) flashPeerBadge(socketId, 'Muted');
      if (state.micOn === true) flashPeerBadge(socketId, 'Mic on');
      if (state.camOn === false) flashPeerBadge(socketId, 'Camera off');
      if (state.camOn === true) flashPeerBadge(socketId, 'Camera on');
    };

    const handleSpeaking = ({ socketId, speaking }: { socketId?: string; speaking?: boolean }) => {
      if (socketId && speaking) flashPeerBadge(socketId, 'Speaking');
    };

    const handleSignal = async ({
      fromSocketId,
      fromUserId,
      fromName,
      signal
    }: {
      fromSocketId: string;
      fromUserId?: string;
      fromName?: string;
      signal: { type: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
    }) => {
      let pc = pcsRef.current.get(fromSocketId);

      try {
        if (signal.type === 'offer') {
          if (!pc) pc = createPC(fromSocketId, fromUserId || fromSocketId, fromName || fromUserId || fromSocketId, false);
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp!));
          await flushPendingIce(fromSocketId, pc);
          const answer = await pc.createAnswer({ offerToReceiveAudio: false, offerToReceiveVideo: true });
          await pc.setLocalDescription(answer);
          socket.emit('call:signal', {
            to: fromSocketId,
            from: currentUser.id,
            signal: { type: 'answer', sdp: pc.localDescription },
          });
        } else if (signal.type === 'answer' && pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp!));
          await flushPendingIce(fromSocketId, pc);
        } else if (signal.type === 'ice-candidate' && pc) {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate!));
          } else {
            const pending = pendingIceRef.current.get(fromSocketId) || [];
            pending.push(signal.candidate!);
            pendingIceRef.current.set(fromSocketId, pending);
          }
        } else if (signal.type === 'ice-candidate') {
          const pending = pendingIceRef.current.get(fromSocketId) || [];
          pending.push(signal.candidate!);
          pendingIceRef.current.set(fromSocketId, pending);
        }
      } catch {
        updatePeer(fromSocketId, { status: 'Signal failed' });
      }
    };

    const handleUserLeft = ({ userId }: { userId: string }) => {
      for (const [socketId, pc] of pcsRef.current) {
        const peer = peersStateRef.current.find((item) => item.socketId === socketId);
        if (peer?.userId === userId) {
          pc.close();
          pcsRef.current.delete(socketId);
        }
      }
      setPeers((current) => current.filter((peer) => peer.userId !== userId));
    };

    socket.on('call:members', handleMembers);
    socket.on('call:full', handleFull);
    socket.on('call:user-joined', handleUserJoined);
    socket.on('call:signal', handleSignal);
    socket.on('call:user-left', handleUserLeft);
    socket.on('guest:nameChanged', handleNameChanged);
    socket.on('participant:updated', handleNameChanged);
    socket.on('call:media-state', handleMediaState);
    socket.on('call:speaking', handleSpeaking);

    const joinTimer = window.setTimeout(() => {
      if (!hasJoinedCallRef.current) {
        hasJoinedCallRef.current = true;
        socket.emit('call:join', {
          roomCode,
          userId: currentUser.id,
          name: currentUser.name
        });
      }
    }, 0);

    return () => {
      window.clearTimeout(joinTimer);
      socket.off('call:members', handleMembers);
      socket.off('call:full', handleFull);
      socket.off('call:user-joined', handleUserJoined);
      socket.off('call:signal', handleSignal);
      socket.off('call:user-left', handleUserLeft);
      socket.off('guest:nameChanged', handleNameChanged);
      socket.off('participant:updated', handleNameChanged);
      socket.off('call:media-state', handleMediaState);
      socket.off('call:speaking', handleSpeaking);
    };
  }, [isInCall, currentUser.id, currentUser.name, roomCode]);

  if (!isInCall) {
    return (
      <div className="card glass video-call-card video-call-card-idle" style={{ padding: '20px', textAlign: 'center' }}>
        <div className="label-tag" style={{ marginBottom: '8px' }}>Call</div>
        <h3 style={{ margin: '0 0 6px' }}>Video Call</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 16px' }}>
          Call and watch audio are mixed through the room audio server. Headphones are recommended.
        </p>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: '0.82rem', marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={advancedAudio}
            onChange={(event) => setAdvancedAudio(event.target.checked)}
          />
          Advanced audio mode (turn off echo cleanup)
        </label>
        <button className="button" onClick={joinCall} style={{ width: '100%' }}>
          Join Call
        </button>
        {callError && <p style={{ color: 'var(--red)', margin: '10px 0 0' }}>{callError}</p>}
      </div>
    );
  }

  const totalVideos = peers.length + 1;
  const cols = totalVideos <= 1 ? 1 : totalVideos <= 4 ? 2 : 3;
  const isTilesOnly = displayMode === 'tiles';

  return (
    <div className={`card glass video-call-card ${isTilesOnly ? 'video-call-card-tiles' : ''}`} style={{ padding: '16px' }}>
      <div className="video-call-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: 8 }}>
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
        <div className="video-call-tile" style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', background: '#000', aspectRatio: '4/3' }}>
          <video ref={localVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          <StatusBadges badges={localBadges} />
          {!isCamOn && (
            <div style={{ position: 'absolute', inset: 0, background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 700, color: 'white' }}>
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="video-call-name-badge" style={{ position: 'absolute', bottom: '6px', left: '6px', background: 'rgba(0,0,0,0.65)', color: 'white', padding: '2px 7px', borderRadius: '6px', fontSize: '0.72rem' }}>
            You {!isMicOn ? 'Muted' : ''}
          </div>
        </div>

        {peers.map((peer) => (
          <PeerVideo key={peer.socketId} peer={peer} />
        ))}
      </div>

      {!isTilesOnly && audioSupportWarning && (
        <div className="call-audio-warning" style={{ marginBottom: 12, color: '#f59e0b', fontSize: '0.82rem', lineHeight: 1.4 }}>
          {audioSupportWarning}
        </div>
      )}

      {!isTilesOnly && (
      <div className="call-audio-controls" style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
        <VolumeSlider label="Mic volume" value={micVolume} onChange={setMicVolume} />
        <VolumeSlider label="Media volume" value={mediaVolume} onChange={setMediaVolume} />
        <VolumeSlider label="Room output" value={mixedRoomVolume} onChange={setMixedRoomVolume} />
        <RoomAudioControls
          roomCode={roomCode}
          currentUser={currentUser}
          microphoneStream={microphoneStream}
          isActive={isInCall}
          isMicEnabled={isMicOn}
          micVolume={micVolume}
          mediaVolume={mediaVolume}
          mixedVolume={mixedRoomVolume}
          onWarning={setAudioSupportWarning}
        />
      </div>
      )}

      {!isTilesOnly && (
      <div className="video-call-actions">
        <button
          className="button button-secondary"
          onClick={toggleMic}
          style={{ flex: 1, padding: '9px', fontSize: '0.85rem', background: isMicOn ? undefined : 'rgba(239,68,68,0.1)' }}
        >
          <MicIcon muted={!isMicOn} />
          {isMicOn ? 'Mute' : 'Unmute'}
        </button>
        <button
          className="button button-secondary"
          onClick={toggleCam}
          style={{ flex: 1, padding: '9px', fontSize: '0.85rem', background: isCamOn ? undefined : 'rgba(239,68,68,0.1)' }}
        >
          <CameraIcon off={!isCamOn} />
          {isCamOn ? 'Hide camera' : 'Show camera'}
        </button>
        <button
          className="button button-secondary"
          onClick={unlockAudio}
          style={{ flex: 1, padding: '9px', fontSize: '0.85rem' }}
        >
          <SpeakerIcon />
          Start video playback
        </button>
      </div>
      )}
    </div>
  );
}

function MicIcon({ muted = false }: { muted?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v3" />
      <path d="M8 22h8" />
      {muted && <path d="M4 4l16 16" />}
    </svg>
  );
}

function CameraIcon({ off = false }: { off?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 10l4.5-2.5A1 1 0 0 1 21 8.4v7.2a1 1 0 0 1-1.5.9L15 14" />
      <rect x="3" y="6" width="12" height="12" rx="2" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5L6 9H3v6h3l5 4V5Z" />
      <path d="M16 9a5 5 0 0 1 0 6" />
      <path d="M19 6a9 9 0 0 1 0 12" />
    </svg>
  );
}

function StatusBadges({ badges }: { badges: string[] }) {
  if (!badges.length) return null;
  return (
    <div className="video-call-status-badges" style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 6, flexWrap: 'wrap', zIndex: 2 }}>
      {badges.map((badge) => (
        <span key={badge} style={{ background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '3px 7px', borderRadius: 7, fontSize: '0.72rem', fontWeight: 700 }}>
          {badge}
        </span>
      ))}
    </div>
  );
}

function VolumeSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="volume-slider-row" style={{ display: 'grid', gridTemplateColumns: '120px 1fr 42px', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
      <span>{label}</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span style={{ textAlign: 'right' }}>{Math.round(value * 100)}%</span>
    </label>
  );
}

function PeerVideo({ peer }: { peer: PeerState }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const showConnectionStatus = peer.status !== 'Connected';

  useEffect(() => {
    if (!peer.stream) return;

    if (videoRef.current) {
      videoRef.current.srcObject = peer.stream;
      videoRef.current.play().catch(() => null);
    }
  }, [peer.stream]);

  return (
    <div className="video-call-tile" style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', background: '#000', aspectRatio: '4/3' }}>
      <StatusBadges badges={peer.badges} />
      {peer.stream ? (
        <>
          <video ref={videoRef} data-call-media autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          {showConnectionStatus && (
            <div style={{ position: 'absolute', top: '6px', right: '6px', background: 'rgba(0,0,0,0.72)', color: 'white', padding: '3px 7px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700 }}>
              {peer.status}
            </div>
          )}
        </>
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: '#0d1117', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'white' }}>
            {peer.name.charAt(0).toUpperCase()}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{peer.status}</div>
        </div>
      )}
      <div className="video-call-name-badge" style={{ position: 'absolute', bottom: '6px', left: '6px', background: 'rgba(0,0,0,0.65)', color: 'white', padding: '2px 7px', borderRadius: '6px', fontSize: '0.72rem' }}>
        {peer.name}
      </div>
    </div>
  );
}
