import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: '100px', padding: '80px 24px' }}>
      {/* Hero Section */}
      <section style={{ textAlign: 'center', maxWidth: '900px', margin: '0 auto', position: 'relative' }}>
        <div style={{ 
          position: 'absolute', 
          top: '-100px', 
          left: '50%', 
          transform: 'translateX(-50%)', 
          width: '300px', 
          height: '300px', 
          background: 'var(--primary)', 
          filter: 'blur(150px)', 
          opacity: '0.15', 
          zIndex: -1 
        }} />
        
        <h1 style={{ 
          fontSize: 'clamp(2.5rem, 8vw, 5rem)', 
          lineHeight: '1.05', 
          marginBottom: '32px', 
          background: 'linear-gradient(135deg, #f8fafc 0%, #94a3b8 100%)', 
          WebkitBackgroundClip: 'text', 
          WebkitTextFillColor: 'transparent',
          letterSpacing: '-0.04em'
        }}>
          Watch stories unfold, <br/> 
          <span style={{ background: 'linear-gradient(to right, var(--primary), var(--accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>together.</span>
        </h1>
        
        <p style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', marginBottom: '56px', maxWidth: '700px', margin: '0 auto 56px' }}>
          The world's most synchronized streaming platform. Join friends across the globe for low-latency playback of YouTube, local files, and more.
        </p>
        
        <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/create-room" className="button" style={{ padding: '18px 40px', fontSize: '1.1rem' }}>
            Start a Watch Party
          </Link>
          <Link href="/dashboard" className="button button-secondary" style={{ padding: '18px 40px', fontSize: '1.1rem' }}>
            Join Existing Room
          </Link>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="row" style={{ gap: '32px' }}>
        <div className="card glass" style={{ padding: '32px' }}>
          <div style={{ 
            width: '48px', 
            height: '48px', 
            borderRadius: '12px', 
            background: 'rgba(59, 130, 246, 0.1)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            fontSize: '1.5rem',
            marginBottom: '24px'
          }}>⚡</div>
          <h3>Atomic Sync</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            Proprietary sub-millisecond synchronization. Everyone sees the same frame, at the same time, regardless of distance.
          </p>
        </div>

        <div className="card glass" style={{ padding: '32px' }}>
          <div style={{ 
            width: '48px', 
            height: '48px', 
            borderRadius: '12px', 
            background: 'rgba(139, 92, 246, 0.1)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            fontSize: '1.5rem',
            marginBottom: '24px'
          }}>💬</div>
          <h3>Dynamic Chat</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            Real-time interactions with high-speed delivery. React to the action instantly with your global audience.
          </p>
        </div>

        <div className="card glass" style={{ padding: '32px' }}>
          <div style={{ 
            width: '48px', 
            height: '48px', 
            borderRadius: '12px', 
            background: 'rgba(236, 72, 153, 0.1)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            fontSize: '1.5rem',
            marginBottom: '24px'
          }}>🌐</div>
          <h3>Source Freedom</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            Seamlessly toggle between YouTube, MP4 links, and local media metadata without breaking the session.
          </p>
        </div>
      </section>

      <footer style={{ textAlign: 'center', padding: '60px 0', borderTop: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
        <div className="nav-brand" style={{ marginBottom: '16px', fontSize: '1.2rem' }}>WatchParty</div>
        <p>© 2026 WatchParty. Premium synchronized streaming.</p>
      </footer>
    </div>
  );
}
