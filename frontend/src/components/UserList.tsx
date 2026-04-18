'use client';

import { useEffect, useState } from 'react';
import { socket } from '@/lib/socket';

interface Participant {
  userId: string;
  name: string;
}

export default function UserList({ initialParticipants = [] }: { initialParticipants?: Participant[] }) {
  const [participants, setParticipants] = useState<Participant[]>(initialParticipants);

  useEffect(() => {
    setParticipants(initialParticipants);
  }, [initialParticipants]);

  useEffect(() => {
    const handleRoomState = (payload: any) => {
      if (payload.room && payload.room.participants) {
        setParticipants(payload.room.participants);
      }
    };

    socket.on('room:state', handleRoomState);
    return () => {
      socket.off('room:state', handleRoomState);
    };
  }, []);

  return (
    <div className="card glass" style={{ marginTop: '24px' }}>
      <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>👥 Participants</span>
        <span style={{ fontSize: '0.8rem', background: 'var(--primary)', color: 'white', padding: '2px 8px', borderRadius: '10px' }}>
          {participants.length}
        </span>
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {participants.map((user, idx) => (
          <div key={user.userId || idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyCenter: 'center', fontSize: '0.8rem', fontWeight: 700 }}>
              {user.name.charAt(0).toUpperCase()}
            </div>
            <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{user.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
