'use client';

import { useSession, signIn } from 'next-auth/react';
import Link from 'next/link';

export default function DashboardPage() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <div className="card glass" style={{ padding: '48px', textAlign: 'center' }}>
          <div className="nav-brand" style={{ fontSize: '2rem', marginBottom: '16px', animation: 'pulse 2s infinite' }}>W</div>
          <h2 style={{ letterSpacing: '-0.02em' }}>Initializing Experience...</h2>
        </div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '500px', padding: '24px' }}>
        <div className="card glass" style={{ textAlign: 'center', maxWidth: '450px', padding: '48px' }}>
          <div style={{ 
            width: '80px', 
            height: '80px', 
            borderRadius: '24px', 
            background: 'rgba(59, 130, 246, 0.1)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            fontSize: '2.5rem',
            margin: '0 auto 24px'
          }}>🔒</div>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '16px' }}>Identity Required</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '32px', fontSize: '1.05rem' }}>
            To protect your sessions and rooms, please authenticate with your Google account.
          </p>
          <button className="button" style={{ width: '100%', padding: '16px' }} onClick={() => signIn('google')}>
            Authenticate with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: '40px', padding: '40px 0' }}>
      <header style={{ borderLeft: '4px solid var(--primary)', paddingLeft: '24px' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '4px' }}>Control Center</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Welcome back, <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{session.user.name}</span></p>
      </header>

      <div className="row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px' }}>
        {/* User Card */}
        <div className="card glass" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ position: 'relative' }}>
              {session.user.image ? (
                <img src={session.user.image} alt="Avatar" style={{ width: '72px', height: '72px', borderRadius: '20px', border: '2px solid var(--border)' }} />
              ) : (
                <div style={{ width: '72px', height: '72px', borderRadius: '20px', background: 'linear-gradient(135deg, var(--primary), var(--accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', color: 'white' }}>
                  {session.user.name?.charAt(0)}
                </div>
              )}
              <div style={{ position: 'absolute', bottom: '-4px', right: '-4px', width: '20px', height: '20px', background: '#10b981', border: '3px solid var(--surface)', borderRadius: '50%' }} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.25rem' }}>{session.user.name}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Premium Account</div>
            </div>
          </div>
          
          <div style={{ padding: '16px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Security Email</div>
            <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{session.user.email}</div>
          </div>

          <button className="button button-secondary" style={{ width: '100%' }}>Security Settings</button>
        </div>

        {/* Action Card */}
        <div className="card glass" style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          justifyContent: 'center', 
          alignItems: 'center', 
          textAlign: 'center', 
          padding: '40px',
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(139, 92, 246, 0.05) 100%)'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '20px', filter: 'drop-shadow(0 0 20px var(--primary-glow))' }}>🚀</div>
          <h3 style={{ fontSize: '1.5rem', marginBottom: '12px' }}>Host a Party</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '32px', maxWidth: '300px' }}>
            Deploy a new synchronization environment and invite your crew.
          </p>
          <Link href="/create-room" className="button" style={{ width: '100%', padding: '16px' }}>
            Deploy New Room
          </Link>
        </div>
      </div>

      {/* History Table/List */}
      <div className="card glass">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h3 style={{ margin: 0 }}>Recent Activity</h3>
          <div style={{ fontSize: '0.85rem', color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}>View All Logging</div>
        </div>
        
        <div style={{ 
          padding: '60px 40px', 
          textAlign: 'center', 
          background: 'rgba(255, 255, 255, 0.02)', 
          borderRadius: '16px', 
          border: '1px dashed var(--border)' 
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '16px', opacity: 0.5 }}>📂</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>No recent synchronization logs detected.</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '8px' }}>Create or join a room to start streaming.</p>
        </div>
      </div>
    </div>
  );
}
