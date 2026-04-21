'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { socket } from '@/lib/socket';
import { getRoom } from '@/lib/api';
import ChatBox from '@/components/ChatBox';
import RoomPlayer from '@/components/RoomPlayer';
import UserList from '@/components/UserList';
import VideoCallPanel from '@/components/VideoCallPanel';
import { useGuest } from '@/components/GuestProvider';

type SourceType = 'youtube' | 'local' | 'localStream' | 'ott-sync';

function prettySize(bytes?: number) {
  if (!bytes) return 'unknown size';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function prettyDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return 'unknown duration';
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const { guest } = useGuest();
  const code = (params.code as string).toUpperCase();

  const [room, setRoom] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const [showCall, setShowCall] = useState(false);
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [sourceTypeDraft, setSourceTypeDraft] = useState<SourceType>('youtube');
  const [sourceUrlDraft, setSourceUrlDraft] = useState('');
  const [ottPlatformDraft, setOttPlatformDraft] = useState('netflix');
  const [sourceMessage, setSourceMessage] = useState('');
  const [localFileDraft, setLocalFileDraft] = useState<{ name: string; size: number } | null>(null);
  const [localStreamFileDraft, setLocalStreamFileDraft] = useState<File | null>(null);
  const [localStreamFile, setLocalStreamFile] = useState<File | null>(null);
  const [streamNotice, setStreamNotice] = useState('');

  const guestId = guest?.guestId ?? '';
  const userName = guest?.displayName ?? 'Guest';
  const isHost = !!room && room.hostUserId === guestId;
  const roomSourceType = room?.source?.type || room?.sourceType;
  const roomSourceData = room?.source?.data || room?.sourceData;
  const roomSourceUrl = room?.source?.url || roomSourceData?.url;

  useEffect(() => {
    if (!code) return;

    socket.connect();

    const joinCurrentRoom = () => {
      socket.emit('room:join', {
        roomCode: code,
        user: { id: guestId, name: userName }
      });
      socket.emit('player:state', { roomCode: code });
      socket.emit('chat:history', { roomCode: code });
    };

    const handleRoomState = (payload: any) => {
      if (payload.room) setRoom(payload.room);
      if (payload.messages) setMessages(payload.messages);
    };

    const handleKicked = ({ reason }: { reason: string }) => {
      alert(reason);
      router.push('/dashboard');
    };
    const handleEnded = () => {
      alert('This room has ended.');
      router.push('/dashboard');
    };
    const handleSourceChanged = (payload: any) => {
      if (payload.source === null) {
        setStreamNotice('Host ended the stream.');
        setLocalStreamFile(null);
      } else {
        setStreamNotice('');
      }
      if (payload.room) setRoom(payload.room);
      socket.emit('player:state', { roomCode: code });
    };

    socket.on('room:state', handleRoomState);
    socket.on('room:kicked', handleKicked);
    socket.on('room:ended', handleEnded);
    socket.on('source:changed', handleSourceChanged);
    socket.io.on('reconnect', joinCurrentRoom);

    joinCurrentRoom();

    getRoom(code).then(setRoom).catch(() => {});

    return () => {
      socket.off('room:state', handleRoomState);
      socket.off('room:kicked', handleKicked);
      socket.off('room:ended', handleEnded);
      socket.off('source:changed', handleSourceChanged);
      socket.io.off('reconnect', joinCurrentRoom);
      socket.emit('room:leave');
    };
  }, [code, guestId, userName]);

  useEffect(() => {
    if (!room) return;
    setSourceTypeDraft((roomSourceType || 'youtube') as SourceType);
    setSourceUrlDraft(roomSourceUrl || '');
    setOttPlatformDraft(room.sourceData?.ottPlatform || 'netflix');
    if (roomSourceType !== 'localStream') {
      setLocalStreamFile(null);
    }
  }, [room, roomSourceType, roomSourceUrl]);

  const copyInviteLink = () => {
    const url = `${window.location.origin}/room/${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const leaveRoom = () => {
    socket.emit('room:leave');
    router.push('/dashboard');
  };

  const endRoom = async () => {
    if (!isHost) return;
    const confirmed = window.confirm('End this room for everyone?');
    if (!confirmed) return;

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/rooms/${code}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    if (res.ok) {
      router.push('/dashboard');
      return;
    }

    alert((await res.json()).message || 'Could not end room.');
  };

  const saveSource = async () => {
    setSourceMessage('');

    if (sourceTypeDraft === 'localStream') {
      if (!localStreamFileDraft) {
        setSourceMessage('Choose a local video file to stream.');
        return;
      }
      setLocalStreamFile(localStreamFileDraft);
      setStreamNotice('');
      setShowSourceModal(false);
      return;
    }

    const sourceData: any =
      sourceTypeDraft === 'ott-sync'
        ? { ottPlatform: ottPlatformDraft }
        : sourceTypeDraft === 'local'
        ? { url: sourceUrlDraft.trim(), fileName: localFileDraft?.name, fileSize: localFileDraft?.size }
        : { url: sourceUrlDraft.trim() };

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/rooms/${code}/source`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        sourceType: sourceTypeDraft,
        sourceData,
      }),
    });

    if (!res.ok) {
      setSourceMessage((await res.json()).message || 'Could not update source.');
      return;
    }

    const updatedRoom = await res.json();
    setRoom(updatedRoom);
    setLocalStreamFile(null);
    setShowSourceModal(false);
  };

  if (!room) {
    return (
      <div className="center-screen">
        <div className="card glass" style={{ padding: '40px', textAlign: 'center' }}>
          <div className="label-tag" style={{ marginBottom: '12px' }}>Loading</div>
          <h2>Joining Room...</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Preparing your watch party experience.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="room-page">
      {/* Room Header */}
      <div className="card glass room-header">
        <div className="room-title-block">
          <h1 style={{ margin: '0 0 4px', fontSize: '1.4rem' }}>{room.name}</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Code:&nbsp;
            <span style={{ color: 'var(--primary)', fontWeight: 700, letterSpacing: '0.08em' }}>{room.code}</span>
            {isHost && (
              <span style={{ marginLeft: '10px', color: '#f59e0b', fontSize: '0.78rem', background: 'rgba(245,158,11,0.1)', padding: '2px 7px', borderRadius: '5px' }}>
                HOST
              </span>
            )}
          </p>
        </div>

        <div className="room-actions">
          <button className="button button-secondary" onClick={copyInviteLink}>
            {copied ? 'Copied' : 'Invite link'}
          </button>
          {isHost && (
            <button className="button button-secondary" onClick={() => setShowSourceModal(true)}>
              Change Source
            </button>
          )}
          <button
            className="button button-secondary"
            onClick={() => setShowCall(p => !p)}
            style={{ background: showCall ? 'var(--surface-3)' : undefined }}
          >
            {showCall ? 'Hide call' : 'Video call'}
          </button>
          <div className="button button-secondary source-pill">
            {roomSourceType.toUpperCase()}
          </div>
          <button className="button button-secondary" onClick={leaveRoom}>
            Leave
          </button>
          {isHost && (
            <button className="button" onClick={endRoom} style={{ background: '#ef4444' }}>
              End Room
            </button>
          )}
        </div>
      </div>

      {/* Main Layout */}
      <div className="row">
        {/* Left column: player */}
        <div className="content-column">
          <RoomPlayer
            roomCode={code}
            videoUrl={roomSourceUrl}
            sourceType={roomSourceType}
            sourceData={roomSourceData}
            localStreamFile={localStreamFile}
            isHost={isHost}
            currentUserId={guestId}
            onLocalStreamStopped={() => {
              setLocalStreamFile(null);
              setStreamNotice('Host ended the stream.');
            }}
          />

          {/* OTT note / room details */}
          {roomSourceType !== 'ott-sync' && (
            <div className="card glass">
              <h3 style={{ margin: '0 0 8px' }}>Now Watching</h3>
              <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem', wordBreak: 'break-all' }}>
                {roomSourceType === 'localStream'
                  ? `${roomSourceData?.fileName || 'Local stream'} (${prettySize(roomSourceData?.sizeBytes || roomSourceData?.fileSize)}, ${prettyDuration(roomSourceData?.durationSec)})`
                  : roomSourceUrl || roomSourceData?.fileName || streamNotice || 'Local / OTT Sync'}
              </p>
              {streamNotice && (
                <p style={{ margin: '10px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  {streamNotice}
                </p>
              )}
              {!isHost && (
                <p style={{ margin: '10px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  {roomSourceType === 'localStream'
                    ? 'The stream is controlled by the host.'
                    : 'The host controls playback. Heartbeats keep this player in sync.'}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Right column: chat + participants + optional call */}
        <div className="content-column">
          {showCall && (
            <VideoCallPanel
              roomCode={code}
              currentUser={{ id: guestId || userName, name: userName }}
            />
          )}

          <ChatBox
            roomCode={code}
            currentUserName={userName}
            initialMessages={messages}
          />

          <UserList
            initialParticipants={room.participants}
            hostUserId={room.hostUserId}
            currentUserEmail={guestId}
            roomCode={code}
            isStreaming={roomSourceType === 'localStream'}
          />
        </div>
      </div>

      {showSourceModal && (
        <div className="modal-backdrop">
          <div className="card glass modal-card">
            <div className="modal-header" style={{ marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Change Source</h3>
              <button className="button button-secondary" onClick={() => setShowSourceModal(false)} style={{ width: 'auto', padding: '6px 10px' }}>
                Close
              </button>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Source type</span>
                <select className="select" value={sourceTypeDraft} onChange={(event) => setSourceTypeDraft(event.target.value as SourceType)}>
                  <option value="youtube">YouTube Video</option>
                  <option value="localStream">Stream local file</option>
                  <option value="local">MP4 / Local Link</option>
                  <option value="ott-sync">OTT Sync</option>
                </select>
              </label>

              {sourceTypeDraft === 'ott-sync' ? (
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Platform</span>
                  <select className="select" value={ottPlatformDraft} onChange={(event) => setOttPlatformDraft(event.target.value)}>
                    <option value="netflix">Netflix</option>
                    <option value="prime">Prime Video</option>
                    <option value="hotstar">Hotstar</option>
                  </select>
                </label>
              ) : sourceTypeDraft === 'localStream' ? (
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Stream local file</span>
                  <input
                    type="file"
                    accept="video/*,.mkv,.avi,.mov,.m4v,.webm,.ogv"
                    className="input"
                    style={{ padding: '8px' }}
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      setLocalStreamFileDraft(file);
                      setSourceMessage('');
                    }}
                  />
                  {localStreamFileDraft && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--primary)', overflowWrap: 'anywhere' }}>
                      Selected: {localStreamFileDraft.name} ({prettySize(localStreamFileDraft.size)})
                    </div>
                  )}
                </label>
              ) : sourceTypeDraft === 'local' ? (
                <div style={{ display: 'grid', gap: 14 }}>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Local File</span>
                    <input
                      type="file"
                      accept="video/*"
                      className="input"
                      style={{ padding: '8px' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setLocalFileDraft({ name: file.name, size: file.size });
                      }}
                    />
                    {localFileDraft && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--primary)' }}>
                        Selected: {localFileDraft.name} ({(localFileDraft.size / 1024 / 1024).toFixed(1)} MB)
                      </div>
                    )}
                  </label>
                  <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>OR</div>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Video URL (MP4/HLS)</span>
                    <input
                      className="input"
                      value={sourceUrlDraft}
                      onChange={(event) => setSourceUrlDraft(event.target.value)}
                      placeholder="https://example.com/video.mp4"
                    />
                  </label>
                </div>
              ) : (
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>YouTube URL</span>
                  <input
                    className="input"
                    value={sourceUrlDraft}
                    onChange={(event) => setSourceUrlDraft(event.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                </label>
              )}

              <button className="button" onClick={saveSource}>
                {sourceTypeDraft === 'localStream' ? 'Start streaming' : 'Save Source'}
              </button>
              {sourceMessage && <p style={{ margin: 0, color: '#ef4444' }}>{sourceMessage}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
