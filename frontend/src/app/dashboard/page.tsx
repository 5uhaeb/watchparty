'use client';

import { useSession, signIn } from 'next-auth/react';
import Link from 'next/link';

export default function DashboardPage() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
        <div className="card glass" style={{ padding: '40px' }}>
          <h2>Loading...</h2>
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
            Please log in with your Google account to access your dashboard and create rooms.
          </p>
          <button className="button" onClick={() => signIn('google')}>
            Login with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header>
        <h1 style={{ marginBottom: '8px' }}>User Dashboard</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Welcome back, {session.user.name}</p>
      </header>

      <div className="row">
        <div className="card glass">
          <h3 style={{ marginBottom: '16px' }}>Your Profile</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
            {session.user.image ? (
              <img src={session.user.image} alt="Avatar" style={{ width: '64px', height: '64px', borderRadius: '50%' }} />
            ) : (
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {session.user.name?.charAt(0)}
              </div>
            )}
            <div>
              <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>{session.user.name}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{session.user.email}</div>
            </div>
          </div>
          <button className="button button-secondary" style={{ width: '100%' }}>Update Profile</button>
        </div>

        <div className="card glass" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>🚀</div>
          <h3>Ready for a Watch Party?</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
            Create a new room and invite your friends to watch together.
          </p>
          <Link href="/create-room" className="button" style={{ width: '100%' }}>
            Create New Room
          </Link>
        </div>
      </div>

      <div className="card glass">
        <h3>Recent Rooms</h3>
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <p>No recent activity. Create your first room to get started!</p>
        </div>
      </div>
    </div>
  );
}
