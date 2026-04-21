'use client';

import { useEffect, useState } from 'react';
import { socket } from '@/lib/socket';
import { getRole, canDo, RoomState, Role } from '@/lib/permissions';

interface Participant {
  userId: string;
  name: string;
}

interface UserListProps {
  initialParticipants?: Participant[];
  roomState?: RoomState | null;
  userId?: string;
}

export default function UserList({ initialParticipants = [], roomState, userId }: UserListProps) {
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

  const getUserRole = (uid: string): Role => {
    if (!roomState) return 'member';
    return getRole(roomState, uid);
  };

  const getRoleBadge = (role: Role) => {
    switch (role) {
      case 'owner': return { text: 'Owner', color: '#ff6b6b' };
      case 'admin': return { text: 'Admin', color: '#4ecdc4' };
      case 'member': return { text: 'Member', color: '#95a5a6' };
    }
  };

  const handleAction = (action: string, targetUserId: string) => {
    socket.emit(`room:${action}`, { userId: targetUserId });
  };

  return (
    <div className="card glass" style={{ marginTop: '24px' }}>
      <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>👥 Participants</span>
        <span style={{ fontSize: '0.8rem', background: 'var(--primary)', color: 'white', padding: '2px 8px', borderRadius: '10px' }}>
          {participants.length}
        </span>
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {participants.map((user, idx) => {
          const role = getUserRole(user.userId);
          const badge = getRoleBadge(role);
          const isMe = user.userId === userId;
          const canManageAdmins = roomState && userId && canDo(roomState, userId, 'manageAdmins');
          const canKickMute = roomState && userId && canDo(roomState, userId, 'kickMute');
          const isOwner = role === 'owner';

          return (
            <div key={user.userId || idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700 }}>
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{user.name}</span>
                <div style={{ fontSize: '0.7rem', color: badge.color, fontWeight: 600, marginTop: '2px' }}>{badge.text}</div>
              </div>
              {!isMe && (
                <div style={{ display: 'flex', gap: '4px' }}>
                  {canManageAdmins && role === 'admin' && !isOwner && (
                    <button className="button button-secondary" style={{ fontSize: '0.7rem', padding: '4px 8px' }} onClick={() => handleAction('demoteAdmin', user.userId)}>
                      Demote
                    </button>
                  )}
                  {canManageAdmins && role === 'member' && (
                    <button className="button button-secondary" style={{ fontSize: '0.7rem', padding: '4px 8px' }} onClick={() => handleAction('promoteAdmin', user.userId)}>
                      Promote
                    </button>
                  )}
                  {canKickMute && !isOwner && (
                    <>
                      <button className="button button-secondary" style={{ fontSize: '0.7rem', padding: '4px 8px' }} onClick={() => handleAction('mute', user.userId)}>
                        Mute
                      </button>
                      <button className="button button-secondary" style={{ fontSize: '0.7rem', padding: '4px 8px' }} onClick={() => handleAction('kick', user.userId)}>
                        Kick
                      </button>
                      <button className="button button-secondary" style={{ fontSize: '0.7rem', padding: '4px 8px' }} onClick={() => handleAction('ban', user.userId)}>
                        Ban
                      </button>
                    </>
                  )}
                  {role === 'owner' && userId === roomState?.ownerUserId && (
                    <button className="button button-secondary" style={{ fontSize: '0.7rem', padding: '4px 8px' }} onClick={() => handleAction('transferOwner', user.userId)}>
                      Transfer
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
