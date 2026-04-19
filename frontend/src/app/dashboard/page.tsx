'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import Link from 'next/link';

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);

  if (status === 'loading') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
        <div className="card glass" style={{ padding: '40px', textAlign: 'center' }}>
          <h2>Loading…</h2>
        </div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <div className="card glass" style={{ textAlign: 'center', maxWidth: '400px' }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔒</div>
          <h2>Authentication Required</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
            Sign in with Google to access your dashboard.
          </p>
          <button className="button" onClick={() => signIn('google')} style={{ width: '100%' }}>
            Login with Google
          </button>
        </div>
      </div>
    );
  }

  const handleJoin = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code || code.length < 4) {
      setJoinError('Please enter a valid room code.');
      return;
    }
    setJoining(true);
    setJoinError('');
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/rooms/${code}`);
      if (!res.ok) {
        setJoinError('Room not found. Check the code and try again.');
        return;
      }
      router.push(`/room/${code}`);
    } catch {
      setJoinError('Could not connect to the server.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header>
        <h1 style={{ marginBottom: '6px' }}>Dashboard</h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Welcome back, {session.user.name}</p>
      </header>

      {/* ── Top row ─────────────────────────────────────────────────────────── */}
      <div className="row">
        {/* Profile card */}
        <div className="card glass">
          <h3 style={{ marginBottom: '16px' }}>Your Profile</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {session.user.image ? (
              <img src={session.user.image} alt="Avatar" referrerPolicy="no-referrer" style={{ width: '64px', height: '64px', borderRadius: '50%', border: '2px solid var(--primary)' }} />
            ) : (
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 700 }}>
                {session.user.name?.charAt(0)}
              </div>
            )}
            <div>
              <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>{session.user.name}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{session.user.email}</div>
              <div style={{ marginTop: '4px', fontSize: '0.75rem', color: 'var(--primary)' }}>Google Account</div>
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="card glass" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '14px' }}>
          <div style={{ textAlign: 'center', marginBottom: '4px' }}>
            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🚀</div>
            <h3 style={{ margin: '0 0 6px' }}>Start a Watch Party</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
              Create a room and invite your friends.
            </p>
          </div>
          <Link href="/create-room" className="button" style={{ width: '100%', textAlign: 'center' }}>
            Create New Room
          </Link>
        </div>
      </div>

      {/* ── Join by code ─────────────────────────────────────────────────────── */}
      <div className="card glass">
        <h3 style={{ marginBottom: '16px' }}>Join a Room</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0 0 16px' }}>
          Got an invite link or room code? Enter it below.
        </p>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <input
            className="input"
            value={joinCode}
            onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            placeholder="Room code (e.g. ABC123)"
            maxLength={8}
            style={{ flex: 1, minWidth: '180px', margin: 0, fontFamily: 'monospace', letterSpacing: '0.1em', fontWeight: 600, fontSize: '1rem' }}
          />
          <button
            className="button"
            onClick={handleJoin}
            disabled={joining}
            style={{ flexShrink: 0 }}
          >
            {joining ? 'Joining…' : 'Join Room'}
          </button>
        </div>
        {joinError && (
          <p style={{ color: '#ef4444', fontSize: '0.875rem', margin: '10px 0 0' }}>{joinError}</p>
        )}
      </div>

      {/* ── How it works ─────────────────────────────────────────────────────── */}
      <div className="card glass">
        <h3 style={{ marginBottom: '16px' }}>How It Works</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          {[
            { icon: '1️⃣', title: 'Create a Room', desc: 'Choose YouTube, local file, or OTT sync mode.' },
            { icon: '2️⃣', title: 'Share the Code', desc: 'Send the room code or invite link to your friends.' },
            { icon: '3️⃣', title: 'Watch Together', desc: 'Video stays perfectly synced — within ~1 second.' },
            { icon: '4️⃣', title: 'Chat & Call', desc: 'Live chat and WebRTC video call in the same room.' }
          ].map(step => (
            <div key={step.title} style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>{step.icon}</div>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>{step.title}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{step.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
