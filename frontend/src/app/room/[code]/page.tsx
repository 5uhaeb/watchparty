'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { socket } from '@/lib/socket';
import { getRoom } from '@/lib/api';
import ChatBox from '@/components/ChatBox';
import RoomPlayer from '@/components/RoomPlayer';
import UserList from '@/components/UserList';
import VideoCallPanel from '@/components/VideoCallPanel';

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const code = (params.code as string).toUpperCase();

  const [room, setRoom] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const [showCall, setShowCall] = useState(false);

  const userEmail = session?.user?.email ?? '';
  const userName = session?.user?.name ?? 'Guest';
  const isHost = !!room && room.hostUserId === userEmail;
  const roomSourceType = room?.source?.type || room?.sourceType;
  const roomSourceUrl = room?.source?.url || room?.sourceData?.url;

  useEffect(() => {
    if (!code) return;

    socket.connect();

    const handleRoomState = (payload: any) => {
      if (payload.room) setRoom(payload.room);
      if (payload.messages) setMessages(payload.messages);
    };

    const handleKicked = ({ reason }: { reason: string }) => {
      alert(reason);
      router.push('/dashboard');
    };

    socket.on('room:state', handleRoomState);
    socket.on('room:kicked', handleKicked);

    socket.emit('room:join', {
      roomCode: code,
      user: { id: userEmail, name: userName }
    });

    getRoom(code).then(setRoom).catch(() => {});

    return () => {
      socket.off('room:state', handleRoomState);
      socket.off('room:kicked', handleKicked);
      socket.disconnect();
    };
  }, [code, userEmail, userName]);

  const copyInviteLink = () => {
    const url = `${window.location.origin}/room/${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!room) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <div className="card glass" style={{ padding: '40px', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⏳</div>
          <h2>Joining Room…</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Preparing your watch party experience.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ── Room Header ──────────────────────────────────────────────────────── */}
      <div className="card glass" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
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

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="button button-secondary" onClick={copyInviteLink} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
            {copied ? '✓ Copied!' : '🔗 Invite Link'}
          </button>
          <button
            className="button button-secondary"
            onClick={() => setShowCall(p => !p)}
            style={{ padding: '8px 16px', fontSize: '0.85rem', background: showCall ? 'rgba(59,130,246,0.15)' : undefined }}
          >
            📹 {showCall ? 'Hide Call' : 'Video Call'}
          </button>
          <div className="button button-secondary" style={{ padding: '8px 16px', fontSize: '0.85rem', pointerEvents: 'none' }}>
            {roomSourceType.toUpperCase()}
          </div>
        </div>
      </div>

      {/* ── Main Layout ───────────────────────────────────────────────────────── */}
      <div className="row">
        {/* Left column: player */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <RoomPlayer
            roomCode={code}
            videoUrl={roomSourceUrl}
            sourceType={roomSourceType}
            isHost={isHost}
            currentUserId={userEmail}
          />

          {/* OTT note / room details */}
          {roomSourceType !== 'ott-sync' && (
            <div className="card glass">
              <h3 style={{ margin: '0 0 8px' }}>Now Watching</h3>
              <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem', wordBreak: 'break-all' }}>
                {roomSourceUrl || room.sourceData?.fileName || 'Local / OTT Sync'}
              </p>
              {!isHost && (
                <p style={{ margin: '10px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  The host controls playback. Heartbeats keep this player in sync.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Right column: chat + participants + optional call */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {showCall && (
            <VideoCallPanel
              roomCode={code}
              currentUser={{ id: userEmail || userName, name: userName }}
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
            currentUserEmail={userEmail}
            roomCode={code}
          />
        </div>
      </div>
    </div>
  );
}
