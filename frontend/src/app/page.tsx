import Link from 'next/link';

export default function HomePage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '80px', padding: '40px 0' }}>
      <section style={{ textAlign: 'center', maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '4rem', lineHeight: '1.1', marginBottom: '24px' }}>
          Watch movies together, anywhere in the world.
        </h1>
        <p style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', marginBottom: '40px' }}>
          Experience seamless synchronized playback with friends. YouTube, local files, and more.
          The ultimate watch party platform with low-latency sync and real-time chat.
        </p>
        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/create-room" className="button" style={{ padding: '16px 32px', fontSize: '1.1rem' }}>
            Get started
          </Link>
          <Link href="/dashboard" className="button button-secondary" style={{ padding: '16px 32px', fontSize: '1.1rem' }}>
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
