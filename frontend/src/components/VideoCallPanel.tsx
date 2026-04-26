'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

interface CallMember {
  socketId: string;
  userId: string;
  name: string;
}

interface CallPeer {
  pc: RTCPeerConnection;
  remoteStream: MediaStream;
  pendingCandidates: RTCIceCandidateInit[];
  makingOffer: boolean;
  ignoreOffer: boolean;
  isSettingRemoteAnswerPending: boolean;
  polite: boolean;
  shouldOffer: boolean;
  restartTimer?: number;
}

type CallSignal =
  | { type: 'description'; description: RTCSessionDescriptionInit }
  | { type: 'candidate'; candidate: RTCIceCandidateInit };

type MediaPermissionState = PermissionState | 'unsupported' | 'missing';

type MediaPermissionIssue = {
  title: string;
  message: string;
  camera: MediaPermissionState;
  microphone: MediaPermissionState;
  browserSettingsUrl?: string;
  steps: string[];
};

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
  publishMediaAudio = false,
}: {
  roomCode: string;
  currentUser: { id: string; name: string };
  publishMediaAudio?: boolean;
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
  const [permissionIssue, setPermissionIssue] = useState<MediaPermissionIssue | null>(null);
  const [callReconnectKey, setCallReconnectKey] = useState(0);

  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const callPeersRef = useRef<Map<string, CallPeer>>(new Map());
  const peersStateRef = useRef<PeerState[]>([]);
  const hasJoinedCallRef = useRef(false);
  const isJoiningCallRef = useRef(false);
  const isLeavingCallRef = useRef(false);
  const localSocketIdRef = useRef('');

  useEffect(() => {
    peersStateRef.current = peers;
  }, [peers]);

  useEffect(() => {
    let cancelled = false;
    const cleanupHandlers: Array<() => void> = [];

    const refreshPermissions = async () => {
      const issue = await detectMediaPermissionIssue();
      if (!cancelled) setPermissionIssue(issue);
    };

    refreshPermissions();

    watchPermission('camera', refreshPermissions).then((cleanup) => {
      if (cleanup) cleanupHandlers.push(cleanup);
    });
    watchPermission('microphone', refreshPermissions).then((cleanup) => {
      if (cleanup) cleanupHandlers.push(cleanup);
    });

    return () => {
      cancelled = true;
      cleanupHandlers.forEach((cleanup) => cleanup());
    };
  }, []);

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

  const sendSignal = useCallback((remoteSocketId: string, signal: CallSignal) => {
    socket.emit('call:signal', {
      to: remoteSocketId,
      from: currentUser.id,
      signal,
    });
  }, [currentUser.id]);

  const addLocalTracksToPeerConnection = (pc: RTCPeerConnection) => {
    const localStream = localStreamRef.current;
    const videoTrack = localStream?.getVideoTracks()[0];

    if (localStream && videoTrack) {
      pc.addTrack(videoTrack, localStream);
      return;
    }

    pc.addTransceiver('video', { direction: 'recvonly' });
  };

  const flushPendingIce = async (peer: CallPeer) => {
    const pending = [...peer.pendingCandidates];
    peer.pendingCandidates = [];
    for (const candidate of pending) {
      await peer.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => null);
    }
  };

  const removePeerConnection = useCallback((socketId: string) => {
    const peer = callPeersRef.current.get(socketId);
    if (!peer) return;
    if (peer.restartTimer) window.clearTimeout(peer.restartTimer);
    peer.pc.ontrack = null;
    peer.pc.onicecandidate = null;
    peer.pc.onnegotiationneeded = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.oniceconnectionstatechange = null;
    peer.pc.close();
    callPeersRef.current.delete(socketId);
    setPeers((current) => current.filter((item) => item.socketId !== socketId));
  }, []);

  const createPeerConnection = useCallback((member: CallMember, shouldOffer = false) => {
    const existing = callPeersRef.current.get(member.socketId);
    if (existing) {
      ensurePeer(member.socketId, member.userId, member.name);
      existing.shouldOffer = existing.shouldOffer || shouldOffer;
      return existing;
    }

    ensurePeer(member.socketId, member.userId, member.name);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const remoteStream = new MediaStream();
    const localSocketId = localSocketIdRef.current || socket.id || '';
    const peer: CallPeer = {
      pc,
      remoteStream,
      pendingCandidates: [],
      makingOffer: false,
      ignoreOffer: false,
      isSettingRemoteAnswerPending: false,
      polite: !!localSocketId && localSocketId > member.socketId,
      shouldOffer,
    };
    callPeersRef.current.set(member.socketId, peer);

    addLocalTracksToPeerConnection(pc);

    pc.ontrack = (event) => {
      const incomingTracks = event.streams[0]?.getTracks().length
        ? event.streams[0].getTracks()
        : [event.track];

      incomingTracks.forEach((track) => {
        if (!peer.remoteStream.getTracks().some((existingTrack) => existingTrack.id === track.id)) {
          peer.remoteStream.addTrack(track);
        }
        track.onunmute = () => updatePeer(member.socketId, { stream: peer.remoteStream, status: 'Connected' });
        track.onmute = () => updatePeer(member.socketId, { stream: peer.remoteStream, status: 'Waiting for video' });
        track.onended = () => updatePeer(member.socketId, { status: 'Video ended' });
      });
      updatePeer(member.socketId, { stream: peer.remoteStream, status: 'Connected' });
    };

    pc.onnegotiationneeded = async () => {
      if (!peer.shouldOffer) return;
      if (peer.makingOffer) return;
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        if (pc.localDescription) {
          sendSignal(member.socketId, { type: 'description', description: pc.localDescription });
        }
      } catch {
        updatePeer(member.socketId, { status: 'Could not negotiate' });
      } finally {
        peer.makingOffer = false;
      }
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      sendSignal(member.socketId, { type: 'candidate', candidate: event.candidate.toJSON() });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        updatePeer(member.socketId, { status: 'Connected' });
        if (peer.restartTimer) window.clearTimeout(peer.restartTimer);
      }
      if (pc.connectionState === 'connecting') updatePeer(member.socketId, { status: 'Connecting' });
      if (pc.connectionState === 'disconnected') updatePeer(member.socketId, { status: 'Reconnecting' });
      if (pc.connectionState === 'failed') {
        updatePeer(member.socketId, { status: 'Retrying connection' });
        peer.restartTimer = window.setTimeout(() => {
          if (pc.connectionState !== 'closed') pc.restartIce?.();
        }, 500);
      }
      if (pc.connectionState === 'closed') updatePeer(member.socketId, { status: 'Left' });
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        updatePeer(member.socketId, { status: 'Connected' });
      }
      if (pc.iceConnectionState === 'checking') updatePeer(member.socketId, { status: 'Connecting' });
      if (pc.iceConnectionState === 'disconnected') updatePeer(member.socketId, { status: 'Reconnecting' });
      if (pc.iceConnectionState === 'failed') updatePeer(member.socketId, { status: 'Retrying relay' });
    };

    return peer;
  }, [removePeerConnection, sendSignal]);

  const startPeerOffer = useCallback(async (member: CallMember) => {
    const peer = createPeerConnection(member, true);
    try {
      peer.makingOffer = true;
      await peer.pc.setLocalDescription();
      if (peer.pc.localDescription) {
        sendSignal(member.socketId, { type: 'description', description: peer.pc.localDescription });
      }
    } catch {
      updatePeer(member.socketId, { status: 'Could not start video' });
    } finally {
      peer.makingOffer = false;
    }
  }, [createPeerConnection, sendSignal]);

  const unlockAudio = async () => {
    const mediaElements = Array.from(document.querySelectorAll<HTMLMediaElement>('[data-call-media]'));
    await Promise.allSettled(mediaElements.map((element) => element.play()));
  };

  const joinCall = async () => {
    try {
      setCallError('');
      setAudioSupportWarning('');
      const preflightIssue = await detectMediaPermissionIssue();
      setPermissionIssue(preflightIssue);
      if (preflightIssue?.camera === 'denied' || preflightIssue?.microphone === 'denied' || preflightIssue?.camera === 'missing' || preflightIssue?.microphone === 'missing') {
        setCallError(preflightIssue.message);
        return;
      }

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
      setPermissionIssue(null);
    } catch (error) {
      const issue = buildPermissionIssueFromError(error);
      setPermissionIssue(issue);
      setCallError(issue.message);
    }
  };

  useEffect(() => {
    if (!isInCall || !localVideoRef.current || !localStreamRef.current) return;
    localVideoRef.current.srcObject = localStreamRef.current;
    localVideoRef.current.play().catch(() => null);
  }, [isInCall]);

  const leaveCall = () => {
    isLeavingCallRef.current = true;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    microphoneStream?.getTracks().forEach((track) => track.stop());
    callPeersRef.current.forEach((peer) => {
      if (peer.restartTimer) window.clearTimeout(peer.restartTimer);
      peer.pc.close();
    });
    callPeersRef.current.clear();
    localStreamRef.current = null;
    hasJoinedCallRef.current = false;
    isJoiningCallRef.current = false;
    localSocketIdRef.current = '';
    setMicrophoneStream(null);
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setPeers([]);
    setIsInCall(false);
    socket.emit('call:leave', { roomCode, userId: currentUser.id });
    window.setTimeout(() => {
      isLeavingCallRef.current = false;
    }, 0);
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

  const reconnectVideo = () => {
    callPeersRef.current.forEach((peer) => {
      if (peer.restartTimer) window.clearTimeout(peer.restartTimer);
      peer.pc.close();
    });
    callPeersRef.current.clear();
    setPeers([]);
    hasJoinedCallRef.current = false;
    isJoiningCallRef.current = false;
    localSocketIdRef.current = socket.id || '';
    socket.emit('call:leave', { roomCode, userId: currentUser.id });
    window.setTimeout(() => setCallReconnectKey((value) => value + 1), 100);
  };

  useEffect(() => {
    if (!isInCall) return;

    const handleMembers = ({ members, selfSocketId }: { members?: CallMember[]; selfSocketId?: string }) => {
      if (selfSocketId) localSocketIdRef.current = selfSocketId;
      for (const member of members || []) {
        if (member.userId !== currentUser.id && member.socketId !== localSocketIdRef.current) {
          createPeerConnection(member, false);
        }
      }
    };

    const joinCallRoom = () => {
      if (isLeavingCallRef.current || hasJoinedCallRef.current || isJoiningCallRef.current) return;
      if (!socket.connected) socket.connect();
      isJoiningCallRef.current = true;

      socket.timeout(8000).emit(
        'call:join',
        { roomCode, userId: currentUser.id, name: currentUser.name },
        (error: Error | null, response?: { ok?: boolean; message?: string; members?: CallMember[]; selfSocketId?: string; limit?: number }) => {
          if (error) {
            setCallError('Could not join video call. Check your connection and try again.');
            isJoiningCallRef.current = false;
            hasJoinedCallRef.current = false;
            return;
          }
          if (!response?.ok) {
            setCallError(response?.message || 'Could not join video call.');
            isJoiningCallRef.current = false;
            hasJoinedCallRef.current = false;
            if (response?.limit) setCallError(`Video call is full. Limit is ${response.limit} users.`);
            return;
          }
          localSocketIdRef.current = response.selfSocketId || socket.id || '';
          hasJoinedCallRef.current = true;
          isJoiningCallRef.current = false;
          handleMembers({ members: response.members || [], selfSocketId: response.selfSocketId });
        }
      );
    };

    const rebuildCallAfterReconnect = () => {
      if (!isInCall || isLeavingCallRef.current) return;
      if (isJoiningCallRef.current) return;
      if (!hasJoinedCallRef.current && callPeersRef.current.size === 0) return;
      callPeersRef.current.forEach((peer) => {
        if (peer.restartTimer) window.clearTimeout(peer.restartTimer);
        peer.pc.close();
      });
      callPeersRef.current.clear();
      setPeers([]);
      hasJoinedCallRef.current = false;
      isJoiningCallRef.current = false;
      localSocketIdRef.current = socket.id || '';
      joinCallRoom();
    };

    const handleUserJoined = ({ socketId, userId, name }: CallMember) => {
      if (userId === currentUser.id || socketId === localSocketIdRef.current) return;
      startPeerOffer({ socketId, userId, name });
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
      signal: CallSignal | { type: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
    }) => {
      const description = signal.type === 'description' && 'description' in signal
        ? signal.description
        : signal.type === 'offer' || signal.type === 'answer'
          ? signal.sdp
          : null;
      const candidate = signal.type === 'candidate' || signal.type === 'ice-candidate'
        ? signal.candidate
        : null;
      const peer = createPeerConnection({
        socketId: fromSocketId,
        userId: fromUserId || fromSocketId,
        name: fromName || fromUserId || fromSocketId,
      }, false);
      const pc = peer.pc;

      try {
        if (description) {
          const readyForOffer =
            !peer.makingOffer &&
            (pc.signalingState === 'stable' || peer.isSettingRemoteAnswerPending);
          const offerCollision = description.type === 'offer' && !readyForOffer;

          peer.ignoreOffer = !peer.polite && offerCollision;
          if (peer.ignoreOffer) return;

          peer.isSettingRemoteAnswerPending = description.type === 'answer';
          await pc.setRemoteDescription(new RTCSessionDescription(description));
          peer.isSettingRemoteAnswerPending = false;
          await flushPendingIce(peer);

          if (description.type === 'offer') {
            await pc.setLocalDescription();
            if (pc.localDescription) {
              sendSignal(fromSocketId, { type: 'description', description: pc.localDescription });
            }
          }
          return;
        }

        if (candidate) {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } else {
            peer.pendingCandidates.push(candidate);
          }
        }
      } catch {
        peer.isSettingRemoteAnswerPending = false;
        if (peer.ignoreOffer) return;
        updatePeer(fromSocketId, { status: 'Signal failed' });
      }
    };

    const handleUserLeft = ({ userId, socketId }: { userId?: string; socketId?: string }) => {
      if (socketId) {
        removePeerConnection(socketId);
        return;
      }
      if (!userId) return;
      const matchingPeers = peersStateRef.current.filter((item) => item.userId === userId);
      matchingPeers.forEach((peer) => removePeerConnection(peer.socketId));
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
    socket.on('connect', rebuildCallAfterReconnect);

    const joinTimer = window.setTimeout(() => {
      joinCallRoom();
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
      socket.off('connect', rebuildCallAfterReconnect);
    };
  }, [isInCall, currentUser.id, currentUser.name, roomCode, createPeerConnection, removePeerConnection, sendSignal, startPeerOffer, callReconnectKey]);

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
        {permissionIssue && (
          <PermissionHelp
            issue={permissionIssue}
            onRetry={joinCall}
          />
        )}
        {callError && <p style={{ color: 'var(--red)', margin: '10px 0 0' }}>{callError}</p>}
      </div>
    );
  }

  const totalVideos = peers.length + 1;
  const cols = totalVideos <= 1 ? 1 : totalVideos <= 4 ? 2 : 3;

  return (
    <div className="card glass video-call-card" style={{ padding: '16px' }}>
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

      {audioSupportWarning && (
        <div className="call-audio-warning" style={{ marginBottom: 12, color: '#f59e0b', fontSize: '0.82rem', lineHeight: 1.4 }}>
          {audioSupportWarning}
        </div>
      )}

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
          publishMediaAudio={publishMediaAudio}
          onWarning={setAudioSupportWarning}
        />
      </div>

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
        <button
          className="button button-secondary"
          onClick={reconnectVideo}
          style={{ flex: 1, padding: '9px', fontSize: '0.85rem' }}
        >
          Reconnect video
        </button>
      </div>
    </div>
  );
}

async function detectMediaPermissionIssue(): Promise<MediaPermissionIssue | null> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return {
      title: 'Camera and microphone are not available',
      message: 'This browser cannot access camera and microphone on this page.',
      camera: 'unsupported',
      microphone: 'unsupported',
      steps: [
        'Open this room in Chrome, Edge, Firefox, or Safari.',
        'Use the HTTPS site URL, not an embedded preview or private browser wrapper.',
      ],
    };
  }

  const [camera, microphone] = await Promise.all([
    queryMediaPermission('camera'),
    queryMediaPermission('microphone'),
  ]);

  if (camera === 'denied' || microphone === 'denied') {
    return buildBrowserPermissionIssue({
      title: 'Camera or microphone is blocked',
      message: 'Camera or microphone access is blocked at the browser or site level.',
      camera,
      microphone,
    });
  }

  if (camera === 'prompt' || microphone === 'prompt') {
    return {
      title: 'Camera and microphone permission needed',
      message: 'The browser has not allowed camera and microphone for this room yet.',
      camera,
      microphone,
      browserSettingsUrl: getBrowserPermissionSettingsUrl(detectBrowser()),
      steps: [
        'Click Join Call and choose Allow when the browser asks.',
        'If no prompt appears, open browser site permissions and set Camera and Microphone to Allow.',
        'Also check system privacy settings so this browser can use camera and microphone.',
      ],
    };
  }

  const devices = await navigator.mediaDevices.enumerateDevices?.().catch(() => []);
  const hasCamera = devices?.some((device) => device.kind === 'videoinput') ?? true;
  const hasMicrophone = devices?.some((device) => device.kind === 'audioinput') ?? true;

  if (!hasCamera || !hasMicrophone) {
    return {
      title: 'Camera or microphone not found',
      message: !hasCamera && !hasMicrophone
        ? 'No camera or microphone was detected.'
        : !hasCamera
          ? 'No camera was detected.'
          : 'No microphone was detected.',
      camera: hasCamera ? camera : 'missing',
      microphone: hasMicrophone ? microphone : 'missing',
      steps: [
        'Connect or enable your camera and microphone.',
        'Check that the browser has permission to use devices in your system privacy settings.',
        'Close other apps that may be controlling the camera or microphone, then retry.',
      ],
    };
  }

  return null;
}

async function queryMediaPermission(name: 'camera' | 'microphone'): Promise<MediaPermissionState> {
  if (!navigator.permissions?.query) return 'unsupported';

  try {
    const status = await navigator.permissions.query({ name: name as unknown as PermissionName });
    return status.state;
  } catch {
    return 'unsupported';
  }
}

async function watchPermission(name: 'camera' | 'microphone', onChange: () => void) {
  if (!navigator.permissions?.query) return null;

  try {
    const status = await navigator.permissions.query({ name: name as unknown as PermissionName });
    status.addEventListener('change', onChange);
    return () => status.removeEventListener('change', onChange);
  } catch {
    return null;
  }
}

function buildPermissionIssueFromError(error: unknown): MediaPermissionIssue {
  const errorName = error instanceof DOMException ? error.name : '';

  if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError' || errorName === 'SecurityError') {
    return buildBrowserPermissionIssue({
      title: 'Camera or microphone permission was denied',
      message: 'The browser blocked camera or microphone access for this room.',
      camera: 'denied',
      microphone: 'denied',
    });
  }

  if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
    return {
      title: 'Camera or microphone not found',
      message: 'No usable camera or microphone was found.',
      camera: 'missing',
      microphone: 'missing',
      steps: [
        'Connect or enable your camera and microphone.',
        'Allow this browser to use camera and microphone in your system privacy settings.',
        'Restart the browser after changing system privacy settings.',
      ],
    };
  }

  if (errorName === 'NotReadableError' || errorName === 'TrackStartError') {
    return {
      title: 'Camera or microphone is already in use',
      message: 'The browser can see your device, but another app or tab may be using it.',
      camera: 'prompt',
      microphone: 'prompt',
      steps: [
        'Close other video meeting apps and tabs.',
        'Unplug and reconnect the camera or microphone if needed.',
        'Retry joining the call.',
      ],
    };
  }

  return buildBrowserPermissionIssue({
    title: 'Could not access camera or microphone',
    message: 'Camera or microphone access failed. Check browser and system permissions.',
    camera: 'unsupported',
    microphone: 'unsupported',
  });
}

function buildBrowserPermissionIssue({
  title,
  message,
  camera,
  microphone,
}: {
  title: string;
  message: string;
  camera: MediaPermissionState;
  microphone: MediaPermissionState;
}): MediaPermissionIssue {
  const browser = detectBrowser();
  const browserSettingsUrl = getBrowserPermissionSettingsUrl(browser);

  return {
    title,
    message,
    camera,
    microphone,
    browserSettingsUrl,
    steps: getBrowserPermissionSteps(browser),
  };
}

function detectBrowser() {
  if (typeof navigator === 'undefined') return 'browser';
  const ua = navigator.userAgent;
  if (ua.includes('Edg/')) return 'edge';
  if (ua.includes('Chrome/') && !ua.includes('Edg/')) return 'chrome';
  if (ua.includes('Firefox/')) return 'firefox';
  if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'safari';
  return 'browser';
}

function getBrowserPermissionSettingsUrl(browser: string) {
  const encodedOrigin = typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : '';
  if (browser === 'chrome') return `chrome://settings/content/siteDetails?site=${encodedOrigin}`;
  if (browser === 'edge') return `edge://settings/content/siteDetails?site=${encodedOrigin}`;
  if (browser === 'firefox') return 'about:preferences#privacy';
  return undefined;
}

function getBrowserPermissionSteps(browser: string) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'this site';
  if (browser === 'chrome') {
    return [
      `Open Chrome site settings for ${origin}.`,
      'Set Camera and Microphone to Allow.',
      'Also check Windows/macOS privacy settings so Chrome can use camera and microphone.',
      'Return here and click Retry.',
    ];
  }
  if (browser === 'edge') {
    return [
      `Open Edge site permissions for ${origin}.`,
      'Set Camera and Microphone to Allow.',
      'Also check Windows/macOS privacy settings so Edge can use camera and microphone.',
      'Return here and click Retry.',
    ];
  }
  if (browser === 'firefox') {
    return [
      `Open Firefox permissions or click the lock icon for ${origin}.`,
      'Remove blocked Camera and Microphone permissions, then allow them when asked again.',
      'Also check Windows/macOS privacy settings so Firefox can use camera and microphone.',
      'Return here and click Retry.',
    ];
  }
  if (browser === 'safari') {
    return [
      'Open Safari Settings, then Websites.',
      'Set Camera and Microphone to Allow for this site.',
      'On macOS/iOS, also allow Safari in system Camera and Microphone privacy settings.',
      'Return here and click Retry.',
    ];
  }
  return [
    `Open browser site permissions for ${origin}.`,
    'Set Camera and Microphone to Allow.',
    'Also check system privacy settings so this browser can use camera and microphone.',
    'Return here and click Retry.',
  ];
}

function PermissionHelp({
  issue,
  onRetry,
}: {
  issue: MediaPermissionIssue;
  onRetry: () => void;
}) {
  const openSettings = () => {
    if (!issue.browserSettingsUrl) return;
    window.open(issue.browserSettingsUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div style={{ marginTop: 14, padding: 12, border: '1px solid rgba(239,68,68,0.35)', borderRadius: 8, background: 'rgba(239,68,68,0.08)', textAlign: 'left' }}>
      <div style={{ fontWeight: 700, color: 'var(--red)', marginBottom: 6 }}>{issue.title}</div>
      <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.45, marginBottom: 8 }}>
        {issue.message}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <PermissionPill label="Camera" state={issue.camera} />
        <PermissionPill label="Microphone" state={issue.microphone} />
      </div>
      <ol style={{ margin: '0 0 10px 18px', padding: 0, color: 'var(--text-secondary)', fontSize: '0.78rem', lineHeight: 1.45 }}>
        {issue.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {issue.browserSettingsUrl && (
          <button className="button button-secondary" onClick={openSettings} style={{ padding: '7px 10px', minHeight: 34, fontSize: '0.78rem' }}>
            Open browser permission settings
          </button>
        )}
        <button className="button" onClick={onRetry} style={{ padding: '7px 10px', minHeight: 34, fontSize: '0.78rem' }}>
          Retry
        </button>
      </div>
    </div>
  );
}

function PermissionPill({ label, state }: { label: string; state: MediaPermissionState }) {
  const blocked = state === 'denied' || state === 'missing';
  const text = state === 'granted'
    ? 'Allowed'
    : state === 'prompt'
      ? 'Ask'
      : state === 'missing'
        ? 'Not found'
        : state === 'unsupported'
          ? 'Unknown'
          : 'Blocked';

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 7px', borderRadius: 7, fontSize: '0.72rem', fontWeight: 700, background: blocked ? 'rgba(239,68,68,0.14)' : 'rgba(47,107,255,0.12)', color: blocked ? 'var(--red)' : 'var(--primary)' }}>
      {label}: {text}
    </span>
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
