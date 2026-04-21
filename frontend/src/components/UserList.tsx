'use client';

import { useEffect, useState } from 'react';
import { socket } from '@/lib/socket';

interface Participant {
  userId: string;
  name: string;
}

export default function UserList({
  initialParticipants = [],
  hostUserId,
  currentUserEmail,
  roomCode,
  isStreaming = false
}: {
  initialParticipants?: Participant[];
  hostUserId?: string;
  currentUserEmail?: string;
  roomCode?: string;
  isStreaming?: boolean;
}) {
  const [participants, setParticipants] = useState<Participant[]>(initialParticipants);
  const isHost = !!hostUserId && hostUserId === currentUserEmail;

  useEffect(() => {
    setParticipants(initialParticipants);
  }, [initialParticipants]);

  useEffect(() => {
    const handleRoomState = (payload: any) => {
      if (payload.room?.participants) {
        setParticipants(payload.room.participants);
      }
    };
    socket.on('room:state', handleRoomState);
    return () => { socket.off('room:state', handleRoomState); };
  }, []);

  const kickUser = (name: string) => {
    if (!isHost || !roomCode) return;
    if (!confirm(`Remove "${name}" from the room?`)) return;
    socket.emit('room:kick', { roomCode, targetName: name, hostUserId: currentUserEmail });
  };

  return (
    <div className="card glass">
      <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>Participants</span>
        <span style={{ fontSize: '0.8rem', background: 'var(--primary)', color: 'white', padding: '2px 8px', borderRadius: '10px' }}>
          {participants.length}
        </span>
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {participants.map((user, idx) => {
          const isThisHost = user.userId === hostUserId || user.name === hostUserId;
          const isMe = user.userId === currentUserEmail;

          return (
            <div
              key={user.userId || idx}
              className="participant-row"
              style={{ borderColor: isMe ? 'var(--blue)' : undefined }}
            >
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: isThisHost ? 'var(--accent)' : 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 700, flexShrink: 0 }}>
                {user.name.charAt(0).toUpperCase()}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.name}
                  </span>
                  {isMe && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--primary)', background: 'rgba(59,130,246,0.1)', padding: '1px 5px', borderRadius: '4px', flexShrink: 0 }}>
                      You
                    </span>
                  )}
                  {isThisHost && (
                    <span style={{ fontSize: '0.7rem', color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '1px 5px', borderRadius: '4px', flexShrink: 0 }}>
                      Host
                    </span>
                  )}
                  {isThisHost && isStreaming && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--green-ink)', background: 'var(--green)', padding: '1px 5px', borderRadius: '4px', flexShrink: 0 }}>
                      Streaming
                    </span>
                  )}
                </div>
              </div>

              {/* Kick button visible to host only, not for self */}
              {isHost && !isMe && (
                <button
                  onClick={() => kickUser(user.name)}
                  title="Remove from room"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: '6px', padding: '3px 8px', fontSize: '0.75rem', cursor: 'pointer', flexShrink: 0 }}
                >
                  Kick
                </button>
              )}
            </div>
          );
        })}

        {participants.length === 0 && (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', padding: '16px 0' }}>
            No participants yet
          </div>
        )}
      </div>
    </div>
  );
}
