'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { socket } from '@/lib/socket';
import { getRoom } from '@/lib/api';
import ChatBox from '@/components/ChatBox';
import RoomPlayer from '@/components/RoomPlayer';
import UserList from '@/components/UserList';

export default function RoomPage() {
  const params = useParams();
  const { data: session } = useSession();
  const code = params.code as string;
  const [room, setRoom] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);

  useEffect(() => {
    if (!code) return;

    socket.connect();

    const handleRoomState = (payload: any) => {
      if (payload.room) setRoom(payload.room);
      if (payload.messages) setMessages(payload.messages);
    };

    socket.on('room:state', handleRoomState);
    socket.emit('room:join', {
      roomCode: code,
      user: {
        id: session?.user?.email, // Using email as a temporary stable ID
        name: session?.user?.name || 'Guest'
      }
    });

    getRoom(code).then(setRoom).catch(console.error);

    return () => {
      socket.off('room:state', handleRoomState);
      socket.disconnect();
    };
  }, [code, session?.user?.name, session?.user?.email]);

  if (!room) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <div className="card glass" style={{ padding: '40px' }}>
          <h2>Locating Room...</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Preparing your watch party experience.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="card glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>{room.name}</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Room Code: <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{room.code}</span>
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>SOURCE</div>
          <div className="button button-secondary" style={{ padding: '4px 12px', fontSize: '0.8rem', pointerEvents: 'none' }}>
            {room.sourceType.toUpperCase()}
          </div>
        </div>
      </div>

      <div className="row">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <RoomPlayer roomCode={code} videoUrl={room.sourceData?.url} sourceType={room.sourceType} />
          
          <div className="card glass">
            <h3>Room Details</h3>
            <p style={{ color: 'var(--text-secondary)' }}>
              Watching: <span style={{ color: 'var(--text-primary)' }}>{room.sourceData?.url || 'No URL set'}</span>
            </p>
            {room.sourceType === 'ott-sync' && room.sourceData?.ottPlatform ? (
              <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '10px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                <span style={{ fontWeight: 600 }}>OTT Sync Mode:</span> {room.sourceData.ottPlatform} synchronization enabled.
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <ChatBox roomCode={code} currentUserName={session?.user?.name || 'Guest'} initialMessages={messages} />
          <UserList initialParticipants={room.participants} />
        </div>
      </div>
    </div>
  );
}
