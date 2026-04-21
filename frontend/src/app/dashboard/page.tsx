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
          <h2>Loading...</h2>
        </div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <div className="card glass" style={{ textAlign: 'center', maxWidth: '400px' }}>
          <div className="label-tag" style={{ marginBottom: '12px' }}>Sign in</div>
          <h2>Authentication required</h2>
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

  const steps = [
    { number: '1', title: 'Create a room', desc: 'Choose YouTube, local file, or OTT sync mode.' },
    { number: '2', title: 'Share the code', desc: 'Send the room code or invite link to your friends.' },
    { number: '3', title: 'Watch together', desc: 'Video stays synced within about one second.' },
    { number: '4', title: 'Chat and call', desc: 'Live chat and WebRTC video call in the same room.' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header>
        <h1 style={{ marginBottom: '6px' }}>Dashboard</h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Welcome back, {session.user.name}</p>
      </header>

      <div className="row">
        <div className="card glass">
          <h3 style={{ marginBottom: '16px' }}>Your profile</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {session.user.image ? (
              <img src={session.user.image} alt="Avatar" referrerPolicy="no-referrer" style={{ width: '64px', height: '64px', borderRadius: '50%', border: 'var(--outline-thin) solid var(--outline)' }} />
            ) : (
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 700 }}>
                {session.user.name?.charAt(0)}
              </div>
            )}
            <div>
              <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>{session.user.name}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{session.user.email}</div>
              <div className="label-tag" style={{ marginTop: '4px' }}>Google account</div>
            </div>
          </div>
        </div>

        <div className="card glass" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '14px' }}>
          <div style={{ textAlign: 'center', marginBottom: '4px' }}>
            <div className="label-tag" style={{ marginBottom: '10px' }}>Start</div>
            <h3 style={{ margin: '0 0 6px' }}>Start a watch party</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
              Create a room and invite your friends.
            </p>
          </div>
          <Link href="/create-room" className="button" style={{ width: '100%', textAlign: 'center' }}>
            Create new room
          </Link>
        </div>
      </div>

      <div className="card glass">
        <h3 style={{ marginBottom: '16px' }}>Join a room</h3>
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
          <button className="button" onClick={handleJoin} disabled={joining} style={{ flexShrink: 0 }}>
            {joining ? 'Joining...' : 'Join room'}
          </button>
        </div>
        {joinError && (
          <p style={{ color: 'var(--red)', fontSize: '0.875rem', margin: '10px 0 0' }}>{joinError}</p>
        )}
      </div>

      <div className="card glass">
        <h3 style={{ marginBottom: '16px' }}>How it works</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          {steps.map(step => (
            <div key={step.title} className="row-item" style={{ alignItems: 'center' }}>
              <span className="chip chip-yellow">{step.number}</span>
              <div>
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>{step.title}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{step.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
