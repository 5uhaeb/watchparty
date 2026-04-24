'use client';

import { useEffect, useState } from 'react';
import { socket } from '@/lib/socket';

interface Participant {
  guestId?: string;
  userId?: string;
  displayName?: string;
  name?: string;
  avatarHue?: number;
  state?: 'online' | 'reconnecting';
  reconnectExpiresAt?: string | null;
}

function normalizeParticipant(user: Participant): Required<Pick<Participant, 'guestId' | 'displayName' | 'state'>> & Participant {
  return {
    ...user,
    guestId: user.guestId || user.userId || user.name || '',
    displayName: user.displayName || user.name || 'Guest',
    state: user.state || 'online',
  };
}

function secondsRemaining(expiresAt?: string | null) {
  if (!expiresAt) return 60;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
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
  const [participants, setParticipants] = useState<Participant[]>(initialParticipants.map(normalizeParticipant));
  const [, forceTick] = useState(0);
  const isHost = !!hostUserId && hostUserId === currentUserEmail;

  useEffect(() => {
    setParticipants(initialParticipants.map(normalizeParticipant));
  }, [initialParticipants]);

  useEffect(() => {
    const intervalId = window.setInterval(() => forceTick((value) => value + 1), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const handleRoomState = (payload: any) => {
      if (payload.room?.participants) {
        setParticipants(payload.room.participants.map(normalizeParticipant));
      }
    };
    const handlePresence = (payload: { members?: Participant[] }) => {
      setParticipants((payload.members || []).map(normalizeParticipant));
    };
    const handleBack = ({ guestId }: { guestId: string }) => {
      setParticipants((current) =>
        current.map((user) =>
          normalizeParticipant(user).guestId === guestId
            ? { ...user, state: 'online', reconnectExpiresAt: null }
            : user
        )
      );
    };
    const handleReconnecting = ({ guestId }: { guestId: string }) => {
      setParticipants((current) =>
        current.map((user) =>
          normalizeParticipant(user).guestId === guestId
            ? {
                ...user,
                state: 'reconnecting',
                reconnectExpiresAt: new Date(Date.now() + 60 * 1000).toISOString(),
              }
            : user
        )
      );
    };
    const handleLeft = ({ guestId }: { guestId: string }) => {
      setParticipants((current) => current.filter((user) => normalizeParticipant(user).guestId !== guestId));
    };
    const handleUpdated = ({ guestId, displayName, presence }: { guestId: string; displayName?: string; presence?: Participant }) => {
      setParticipants((current) =>
        current.map((user) =>
          normalizeParticipant(user).guestId === guestId
            ? normalizeParticipant({ ...user, ...(presence || {}), displayName: displayName || presence?.displayName || user.displayName })
            : user
        )
      );
    };

    socket.on('room:state', handleRoomState);
    socket.on('room:presence', handlePresence);
    socket.on('participant:back', handleBack);
    socket.on('participant:reconnecting', handleReconnecting);
    socket.on('participant:left', handleLeft);
    socket.on('participant:updated', handleUpdated);
    return () => {
      socket.off('room:state', handleRoomState);
      socket.off('room:presence', handlePresence);
      socket.off('participant:back', handleBack);
      socket.off('participant:reconnecting', handleReconnecting);
      socket.off('participant:left', handleLeft);
      socket.off('participant:updated', handleUpdated);
    };
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
        {participants.map((rawUser, idx) => {
          const user = normalizeParticipant(rawUser);
          const isThisHost = user.guestId === hostUserId;
          const isMe = user.guestId === currentUserEmail;
          const isReconnecting = user.state === 'reconnecting';
          const remaining = secondsRemaining(user.reconnectExpiresAt);

          return (
            <div
              key={user.guestId || idx}
              className="participant-row"
              title={isReconnecting ? `Reconnecting... will be removed in ${remaining}s if they don't return` : undefined}
              style={{
                borderColor: isMe ? 'var(--blue)' : undefined,
                opacity: isReconnecting ? 0.58 : 1,
                filter: isReconnecting ? 'grayscale(0.35)' : undefined,
              }}
            >
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: `hsl(${user.avatarHue ?? (isThisHost ? 38 : 215)} 78% 48%)`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 700, flexShrink: 0 }}>
                {user.displayName.charAt(0).toUpperCase()}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.displayName}
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
                  {isReconnecting && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', background: 'var(--surface-3)', padding: '1px 5px', borderRadius: '4px', flexShrink: 0 }}>
                      Reconnecting {remaining}s
                    </span>
                  )}
                </div>
              </div>

              {isHost && !isMe && !isReconnecting && (
                <button
                  onClick={() => kickUser(user.displayName)}
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
