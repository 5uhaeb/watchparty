'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGuest } from '@/components/GuestProvider';
import { createRoom } from '@/lib/api';
import { guestAuthHeaders } from '@/lib/guestToken';

export default function DashboardPage() {
  const { guest, updateName } = useGuest();
  const router = useRouter();
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [nameDraft, setNameDraft] = useState(guest?.displayName || '');
  const [joining, setJoining] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleJoin = async () => {
    const code = extractRoomCode(joinCode);
    if (!/^[A-Z2-9]{6}$/.test(code)) {
      setJoinError('Please enter a valid room code.');
      return;
    }
    setJoining(true);
    setJoinError('');
    try {
      const nextName = nameDraft.trim();
      if (nextName && nextName !== guest?.displayName) {
        await updateName(nextName);
      }
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/rooms/${code}`, {
        credentials: 'include',
        headers: guestAuthHeaders(),
      });
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

  const handleCreateRoom = async () => {
    setCreating(true);
    try {
      const nextName = nameDraft.trim();
      if (nextName && nextName !== guest?.displayName) {
        await updateName(nextName);
      }
      const room = await createRoom();
      router.push(`/room/${room.code}`);
    } catch {
      setJoinError('Could not create a room. Try again.');
    } finally {
      setCreating(false);
    }
  };

  const steps = [
    { number: '1', title: 'Create a room', desc: 'Open an empty room instantly, then choose what to play inside.' },
    { number: '2', title: 'Share the code', desc: 'Send the room code or invite link to anyone.' },
    { number: '3', title: 'Watch together', desc: 'Playback stays synced, or viewers watch the host stream live.' },
    { number: '4', title: 'Chat and call', desc: 'Live chat and WebRTC video call stay inside the room.' },
  ];

  useEffect(() => {
    if (guest?.displayName) setNameDraft(guest.displayName);
  }, [guest?.displayName]);

  return (
    <div className="dashboard-stack">
      <header>
        <h1 style={{ marginBottom: '6px' }}>Dashboard</h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Welcome back, {guest?.displayName}</p>
      </header>

      <div className="row">
        <div className="card glass">
          <h3 style={{ marginBottom: '16px' }}>Your guest identity</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: `hsl(${guest?.avatarHue || 0} 78% 48%)`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 700 }}>
              {guest?.displayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>{guest?.displayName}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Anonymous guest</div>
              <div className="label-tag" style={{ marginTop: '4px' }}>No account required</div>
            </div>
          </div>
        </div>

        <div className="card glass" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '14px' }}>
          <div style={{ textAlign: 'center', marginBottom: '4px' }}>
            <div className="label-tag" style={{ marginBottom: '10px' }}>Start</div>
            <h3 style={{ margin: '0 0 6px' }}>Start a watch party</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
              Create a room and share the code.
            </p>
          </div>
          <button className="button" onClick={handleCreateRoom} disabled={creating} style={{ width: '100%', textAlign: 'center' }}>
            {creating ? 'Creating...' : 'Create new room'}
          </button>
        </div>
      </div>

      <div className="card glass">
        <h3 style={{ marginBottom: '16px' }}>Join a room</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0 0 16px' }}>
          Got an invite link or room code? Enter it below.
        </p>
        <div className="form-row">
          <label className="field-group">
            <span>Your display name</span>
            <input className="input" value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} placeholder="Display name" maxLength={24} autoComplete="nickname" />
          </label>
          <label className="field-group">
            <span>Room code or invite link</span>
            <input className="input room-code-input" value={joinCode} onChange={(event) => { setJoinCode(event.target.value); setJoinError(''); }} onKeyDown={(event) => event.key === 'Enter' && handleJoin()} placeholder="ABC123 or paste an invite link" autoCapitalize="characters" autoComplete="off" aria-invalid={!!joinError} aria-describedby={joinError ? 'join-error' : undefined} />
          </label>
          <button className="button" onClick={handleJoin} disabled={joining} style={{ flexShrink: 0 }}>
            {joining ? 'Joining...' : 'Join room'}
          </button>
        </div>
        {joinError && (
          <p id="join-error" role="alert" style={{ color: 'var(--red)', fontSize: '0.875rem', margin: '10px 0 0' }}>{joinError}</p>
        )}
      </div>

      <div className="card glass">
        <h3 style={{ marginBottom: '16px' }}>How it works</h3>
        <div className="responsive-grid">
          {steps.map((step) => (
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

function extractRoomCode(value: string) {
  const normalized = value.trim().toUpperCase();
  const urlMatch = normalized.match(/\/ROOM\/([A-Z2-9]{6})(?:[/?#]|$)/);
  return (urlMatch?.[1] || normalized).replace(/\s+/g, '');
}
