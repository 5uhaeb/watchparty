'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useGuest } from './GuestProvider';
import ThemeToggle from './ThemeToggle';

export default function Navbar() {
  const { guest, updateName, resetIdentity } = useGuest();
  const [open, setOpen] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [nameDraft, setNameDraft] = useState(guest?.displayName || '');
  const [error, setError] = useState('');

  const saveName = async () => {
    setError('');
    try {
      await updateName(nameDraft);
      setShowNameModal(false);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update name');
    }
  };

  return (
    <nav className="nav">
      <div className="nav-brand">
        <Link href="/">WatchParty</Link>
      </div>
      
      <div className="nav-links">
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/create-room">Create Room</Link>
        <ThemeToggle />

        {guest && (
          <div style={{ position: 'relative' }}>
            <button className="button button-secondary" onClick={() => setOpen((value) => !value)}>
              <span
                aria-hidden
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: `hsl(${guest.avatarHue} 78% 48%)`,
                  color: '#fff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {guest.displayName.charAt(0).toUpperCase()}
              </span>
              {guest.displayName}
            </button>
            {open && (
              <div className="card glass notification-menu">
                <button
                  className="button button-secondary"
                  style={{ width: '100%', marginBottom: 8 }}
                  onClick={() => {
                    setNameDraft(guest.displayName);
                    setShowNameModal(true);
                  }}
                >
                  Change name
                </button>
                <button className="button" style={{ width: '100%' }} onClick={resetIdentity}>
                  Reset identity
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {showNameModal && (
        <div className="modal-backdrop">
          <div className="card glass modal-card">
            <div className="modal-header" style={{ marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Change name</h3>
              <button className="button button-secondary" onClick={() => setShowNameModal(false)} style={{ width: 'auto' }}>
                Close
              </button>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <input
                className="input"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                maxLength={24}
                autoFocus
              />
              <button className="button" onClick={saveName}>
                Save name
              </button>
              {error && <p style={{ margin: 0, color: 'var(--red)' }}>{error}</p>}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
