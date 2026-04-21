'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { socket } from '@/lib/socket';

type Notice = {
  id: string;
  type: 'invite' | 'friend';
  title: string;
  body: string;
  payload: any;
};

export default function NotificationBell() {
  const { data: session } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const userId = session?.user?.email;

  useEffect(() => {
    if (!userId) return;

    socket.connect();
    socket.emit('user:join', { userId });

    const onInvite = (invite: any) => {
      setNotices((prev) => [
        {
          id: `invite:${invite.id}`,
          type: 'invite',
          title: 'Room invite',
          body: `${invite.fromUserId} invited you to ${invite.roomName || invite.roomCode}`,
          payload: invite,
        },
        ...prev,
      ]);
    };

    const onFriendRequest = (friendship: any) => {
      setNotices((prev) => [
        {
          id: `friend:${friendship.id}`,
          type: 'friend',
          title: 'Friend request',
          body: `${friendship.requester?.name || friendship.requesterId} sent you a request`,
          payload: friendship,
        },
        ...prev,
      ]);
    };

    socket.on('invite:new', onInvite);
    socket.on('friend:request', onFriendRequest);

    return () => {
      socket.off('invite:new', onInvite);
      socket.off('friend:request', onFriendRequest);
    };
  }, [userId]);

  if (!userId) return null;

  const acceptInvite = async (notice: Notice) => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/invites/${notice.payload.id}/respond`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({ action: 'accept' }),
    });

    if (!res.ok) return;
    const data = await res.json();
    setNotices((prev) => prev.filter((item) => item.id !== notice.id));
    setOpen(false);
    router.push(`/room/${data.room?.code || notice.payload.roomCode}`);
  };

  return (
    <div style={{ position: 'relative' }}>
      <button className="button button-secondary" onClick={() => setOpen((value) => !value)} style={{ padding: '8px 12px' }}>
        Bell {notices.length ? `(${notices.length})` : ''}
      </button>
      {open && (
        <div
          className="card glass notification-menu"
        >
          {notices.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>No new notifications.</p>
          ) : (
            notices.map((notice) => (
              <div key={notice.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 700 }}>{notice.title}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '4px 0 8px' }}>{notice.body}</div>
                {notice.type === 'invite' ? (
                  <button className="button" onClick={() => acceptInvite(notice)} style={{ padding: '6px 10px', fontSize: '0.8rem' }}>
                    Accept
                  </button>
                ) : (
                  <button className="button button-secondary" onClick={() => router.push('/friends')} style={{ padding: '6px 10px', fontSize: '0.8rem' }}>
                    Review
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
