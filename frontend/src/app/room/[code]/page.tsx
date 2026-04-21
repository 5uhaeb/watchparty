'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { socket } from '@/lib/socket';
import { getRoom } from '@/lib/api';
import ChatBox from '@/components/ChatBox';
import RoomPlayer from '@/components/RoomPlayer';
import UserList from '@/components/UserList';
import { RoomState, canDo } from '@/lib/permissions';

export default function RoomPage() {
  const params = useParams();
  const { data: session } = useSession();
  const code = params.code as string;
  const [room, setRoom] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (!code) return;

    socket.connect();

    const handleRoomState = (payload: any) => {
      if (payload.room) setRoom(payload.room);
      if (payload.messages) setMessages(payload.messages);
      if (payload.ownerUserId) {
        setRoomState({
          ownerUserId: payload.ownerUserId,
          adminUserIds: payload.adminUserIds || [],
          permissions: payload.permissions || {
            playPause: 'admins',
            seek: 'admins',
            changeSource: 'admins',
            chat: 'everyone',
            invite: 'admins',
            kickMute: 'admins',
            managePerms: 'owner',
            manageAdmins: 'owner'
          },
          mutedUserIds: payload.mutedUserIds || [],
          bannedUserIds: payload.bannedUserIds || []
        });
      }
    };

    const handlePermsChanged = (payload: any) => {
      if (roomState) {
        setRoomState({ ...roomState, permissions: payload.permissions });
      }
    };

    const handleRolesChanged = (payload: any) => {
      if (roomState) {
        setRoomState({
          ...roomState,
          ownerUserId: payload.ownerUserId,
          adminUserIds: payload.adminUserIds
        });
      }
    };

    const handleRolesChanged = (payload: any) => {
      if (roomState) {
        setRoomState({
          ...roomState,
          ownerUserId: payload.ownerUserId,
          adminUserIds: payload.adminUserIds
        });
      }
    };

    const handleRoomKicked = (payload: any) => {
      if (payload.userId === session?.user?.email) {
        // Redirect to dashboard
        window.location.href = '/dashboard';
      }
    };

    socket.on('room:state', handleRoomState);
    socket.on('room:permsChanged', handlePermsChanged);
    socket.on('room:rolesChanged', handleRolesChanged);
    socket.on('room:kicked', handleRoomKicked);

    socket.emit('room:join', {
      roomCode: code,
      user: {
        id: session?.user?.email,
        name: session?.user?.name || 'Guest'
      }
    });

    getRoom(code).then((roomData) => {
      setRoom(roomData);
      if (roomData.ownerUserId) {
        setRoomState({
          ownerUserId: roomData.ownerUserId,
          adminUserIds: roomData.adminUserIds || [],
          permissions: roomData.permissions || {
            playPause: 'admins',
            seek: 'admins',
            changeSource: 'admins',
            chat: 'everyone',
            invite: 'admins',
            kickMute: 'admins',
            managePerms: 'owner',
            manageAdmins: 'owner'
          },
          mutedUserIds: roomData.mutedUserIds || [],
          bannedUserIds: roomData.bannedUserIds || []
        });
      }
    }).catch(console.error);

    return () => {
      socket.off('room:state', handleRoomState);
      socket.off('room:permsChanged', handlePermsChanged);
      socket.off('room:rolesChanged', handleRolesChanged);
      socket.off('room:kicked', handleRoomKicked);
      socket.disconnect();
    };
  }, [code, session?.user?.name, session?.user?.email]);

  if (!room) {
    return (
      <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div className="card glass" style={{ padding: '60px', textAlign: 'center', maxWidth: '500px' }}>
          <div className="nav-brand" style={{ fontSize: '3rem', marginBottom: '24px', animation: 'pulse 2s infinite' }}>W</div>
          <h2 style={{ fontSize: '2rem', marginBottom: '12px' }}>Connecting to Session</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Synchronizing playback environment and establishing secure connection...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: '32px', padding: '40px 24px' }}>
      {/* Header Info */}
      <div className="card glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ 
            width: '12px', 
            height: '12px', 
            borderRadius: '50%', 
            background: '#10b981', 
            boxShadow: '0 0 10px #10b981' 
          }} />
          <div>
            <h1 style={{ margin: 0, fontSize: '1.75rem', letterSpacing: '-0.02em' }}>{room.name}</h1>
            <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                ACCESS CODE: <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{room.code}</span>
              </span>
              <span style={{ color: 'var(--border)' }}>|</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                STATUS: <span style={{ color: '#10b981', fontWeight: 600 }}>LIVE</span>
              </span>
            </div>
          </div>
        </div>
        
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.1em', marginBottom: '6px' }}>SOURCE ENGINE</div>
          <div className="button button-secondary" style={{ padding: '6px 16px', fontSize: '0.85rem', pointerEvents: 'none', borderRadius: '8px', border: '1px solid var(--primary)' }}>
            {room.sourceType.toUpperCase()}
          </div>
        </div>
      </div>

      <div className="row" style={{ gridTemplateColumns: 'minmax(0, 2.5fr) 1fr', gap: '32px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {/* Player Container */}
          <div style={{ position: 'relative' }}>
            <RoomPlayer roomCode={code} videoUrl={room.sourceData?.url} sourceType={room.sourceType} roomState={roomState} userId={session?.user?.email} />
          </div>
          
          {/* Details Card */}
          <div className="card glass" style={{ borderLeft: '4px solid var(--primary)' }}>

  if (!room) {
    return (
      <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div className="card glass" style={{ padding: '60px', textAlign: 'center', maxWidth: '500px' }}>
          <div className="nav-brand" style={{ fontSize: '3rem', marginBottom: '24px', animation: 'pulse 2s infinite' }}>W</div>
          <h2 style={{ fontSize: '2rem', marginBottom: '12px' }}>Connecting to Session</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Synchronizing playback environment and establishing secure connection...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: '32px', padding: '40px 24px' }}>
      {/* Header Info */}
      <div className="card glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ 
            width: '12px', 
            height: '12px', 
            borderRadius: '50%', 
            background: '#10b981', 
            boxShadow: '0 0 10px #10b981' 
          }} />
          <div>
            <h1 style={{ margin: 0, fontSize: '1.75rem', letterSpacing: '-0.02em' }}>{room.name}</h1>
            <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                ACCESS CODE: <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{room.code}</span>
              </span>
              <span style={{ color: 'var(--border)' }}>|</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                STATUS: <span style={{ color: '#10b981', fontWeight: 600 }}>LIVE</span>
              </span>
            </div>
          </div>
        </div>
        
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.1em', marginBottom: '6px' }}>SOURCE ENGINE</div>
          <div className="button button-secondary" style={{ padding: '6px 16px', fontSize: '0.85rem', pointerEvents: 'none', borderRadius: '8px', border: '1px solid var(--primary)' }}>
            {room.sourceType.toUpperCase()}
          </div>
        </div>
      </div>

      <div className="row" style={{ gridTemplateColumns: 'minmax(0, 2.5fr) 1fr', gap: '32px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {/* Player Container */}
          <div style={{ position: 'relative' }}>
            <RoomPlayer roomCode={code} videoUrl={room.sourceData?.url} sourceType={room.sourceType} />
          </div>
          
          {/* Details Card */}
          <div className="card glass" style={{ borderLeft: '4px solid var(--primary)' }}>
            <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span>ℹ️</span> Session Intelligence
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>ACTIVE MEDIA</div>
                <div style={{ color: 'var(--text-primary)', wordBreak: 'break-all', fontSize: '0.95rem' }}>{room.sourceData?.url || 'No URL configured'}</div>
              </div>
              {room.sourceType === 'ott-sync' && (
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>PLATFORM PROTOCOL</div>
                  <div style={{ color: 'var(--primary)', fontWeight: 600 }}>{room.sourceData.ottPlatform || 'Unknown'} SYNC</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          <ChatBox roomCode={code} currentUserName={session?.user?.name || 'Guest'} initialMessages={messages} roomState={roomState} userId={session?.user?.email} />
          <UserList initialParticipants={room.participants} roomState={roomState} userId={session?.user?.email} />
        </div>
      </div>

      {showSettings && roomState && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card glass" style={{ width: '500px', maxHeight: '80vh', overflow: 'auto' }}>
            <h3 style={{ marginBottom: '16px' }}>Room Settings</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {Object.entries(roomState.permissions).map(([key, value]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 500 }}>{key}</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {(['owner', 'admins', 'everyone'] as const).map(level => (
                      <button
                        key={level}
                        className={`button ${value === level ? '' : 'button-secondary'}`}
                        onClick={() => {
                          const newPerms = { ...roomState.permissions, [key]: level };
                          socket.emit('room:updatePerms', { patch: { [key]: level } });
                          setRoomState({ ...roomState, permissions: newPerms });
                        }}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button className="button button-secondary" style={{ marginTop: '16px', width: '100%' }} onClick={() => setShowSettings(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
