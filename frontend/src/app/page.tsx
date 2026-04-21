import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="page-stack">
      <section className="hero-section">
        <h1 className="hero-title">
          Watch movies together, anywhere in the world.
        </h1>
        <p className="hero-copy">
          Experience seamless synchronized playback with friends. YouTube, local files, and more.
          The ultimate watch party platform with low-latency sync and real-time chat.
        </p>
        <div className="cta-row">
          <Link href="/create-room" className="button">
            Get started
          </Link>
          <Link href="/dashboard" className="button button-secondary">
            Join a room
          </Link>
        </div>
      </section>

      <section className="row">
        <div className="card glass">
          <div className="label-tag" style={{ marginBottom: '12px' }}>Sync</div>
          <h3>Ultra-sync playback</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            Our sync engine keeps everyone on the same moment, handling latency and buffering automatically.
          </p>
        </div>
        <div className="card glass">
          <div className="label-tag" style={{ marginBottom: '12px' }}>Chat</div>
          <h3>Real-time interaction</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            Engage with your friends via high-speed chat. See who is online and watching in real time.
          </p>
        </div>
        <div className="card glass">
          <div className="label-tag" style={{ marginBottom: '12px' }}>Sources</div>
          <h3>Multiple sources</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            Support for YouTube, direct MP4 links, and local file metadata synchronization.
          </p>
        </div>
      </section>

      <footer style={{ textAlign: 'center', padding: '40px 0', borderTop: 'var(--outline-thin) solid var(--outline)', color: 'var(--text-secondary)' }}>
        <p>© 2026 WatchParty. Built for the modern web.</p>
      </footer>
    </div>
  );
}
