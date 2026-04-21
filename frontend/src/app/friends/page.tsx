'use client';

import { useEffect, useState } from 'react';
import { signIn, useSession } from 'next-auth/react';

type User = {
  id: string;
  name: string;
  email: string;
  image?: string;
};

type Friendship = {
  id: string;
  requesterId: string;
  addresseeId: string;
  requester?: User;
  addressee?: User;
};

type FriendsResponse = {
  friends: Friendship[];
  incoming: Friendship[];
  outgoing: Friendship[];
};

const API = process.env.NEXT_PUBLIC_API_URL;

export default function FriendsPage() {
  const { data: session, status } = useSession();
  const userId = session?.user?.email || '';
  const [activeTab, setActiveTab] = useState<'friends' | 'incoming' | 'outgoing'>('friends');
  const [data, setData] = useState<FriendsResponse>({ friends: [], incoming: [], outgoing: [] });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [message, setMessage] = useState('');

  const loadFriends = async () => {
    if (!userId) return;
    const res = await fetch(`${API}/friends?userId=${encodeURIComponent(userId)}`, { cache: 'no-store' });
    if (res.ok) setData(await res.json());
  };

  useEffect(() => {
    loadFriends();
  }, [userId]);

  useEffect(() => {
    if (!userId || query.trim().length < 2) {
      setResults([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      const res = await fetch(`${API}/friends/search?userId=${encodeURIComponent(userId)}&q=${encodeURIComponent(query)}`);
      if (res.ok) setResults(await res.json());
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query, userId]);

  if (status === 'loading') return <div className="card glass">Loading...</div>;

  if (!session?.user) {
    return (
      <div className="card glass" style={{ maxWidth: 420, margin: '80px auto', textAlign: 'center' }}>
        <h2>Sign in to manage friends</h2>
        <button className="button" onClick={() => signIn('google')}>Login with Google</button>
      </div>
    );
  }

  const sendRequest = async (toUserId: string) => {
    const res = await fetch(`${API}/friends/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
      body: JSON.stringify({ toUserId }),
    });
    setMessage(res.ok ? 'Friend request sent.' : (await res.json()).message || 'Request failed.');
    setQuery('');
    setResults([]);
    loadFriends();
  };

  const respond = async (friendshipId: string, action: 'accept' | 'decline' | 'block') => {
    const res = await fetch(`${API}/friends/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
      body: JSON.stringify({ friendshipId, action }),
    });
    setMessage(res.ok ? 'Updated.' : (await res.json()).message || 'Update failed.');
    loadFriends();
  };

  const otherUser = (friendship: Friendship) => {
    return friendship.requesterId === userId ? friendship.addressee : friendship.requester;
  };

  const list = data[activeTab];

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <header>
        <h1 style={{ marginBottom: 6 }}>Friends</h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Add people, accept requests, and invite friends into rooms.</p>
      </header>

      <div className="card glass">
        <h3 style={{ marginBottom: 12 }}>Find People</h3>
        <input
          className="input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by email or name"
        />
        {results.length > 0 && (
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            {results.map((user) => (
              <div key={user.email} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{user.name}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{user.email}</div>
                </div>
                <button className="button" onClick={() => sendRequest(user.email)} style={{ width: 'auto' }}>
                  Add
                </button>
              </div>
            ))}
          </div>
        )}
        {message && <p style={{ color: 'var(--primary)', margin: '12px 0 0' }}>{message}</p>}
      </div>

      <div className="card glass">
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {(['friends', 'incoming', 'outgoing'] as const).map((tab) => (
            <button
              key={tab}
              className={`button ${activeTab === tab ? '' : 'button-secondary'}`}
              onClick={() => setActiveTab(tab)}
              style={{ width: 'auto', textTransform: 'capitalize' }}
            >
              {tab} ({data[tab].length})
            </button>
          ))}
        </div>

        {list.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>Nothing here yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {list.map((friendship) => {
              const user = otherUser(friendship);
              return (
                <div key={friendship.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{user?.name || 'Unknown user'}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{user?.email}</div>
                  </div>
                  {activeTab === 'incoming' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="button" onClick={() => respond(friendship.id, 'accept')} style={{ width: 'auto' }}>Accept</button>
                      <button className="button button-secondary" onClick={() => respond(friendship.id, 'decline')} style={{ width: 'auto' }}>Decline</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
