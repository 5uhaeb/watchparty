'use client';

import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { clearGuestToken, guestAuthHeaders, setGuestToken } from '@/lib/guestToken';
import { socket } from '@/lib/socket';

export type Guest = {
  guestId: string;
  displayName: string;
  avatarHue: number;
};

type GuestContextValue = {
  guest: Guest | null;
  loading: boolean;
  bootstrap: () => Promise<Guest>;
  updateName: (displayName: string) => Promise<Guest>;
  resetIdentity: () => Promise<Guest>;
};

const GuestContext = createContext<GuestContextValue | null>(null);

const API = process.env.NEXT_PUBLIC_API_URL;

type GuestResponse = Guest & { token?: string };

async function guestFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    credentials: 'include',
    headers: guestAuthHeaders({
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || 'Guest request failed');
  }

  const data = await res.json();
  if (data.token) setGuestToken(data.token);
  return data;
}

export function GuestProvider({ children }: { children: ReactNode }) {
  const [guest, setGuest] = useState<Guest | null>(null);
  const [loading, setLoading] = useState(true);

  const bootstrap = async () => {
    const nextGuest = await guestFetch('/guest/bootstrap', { method: 'POST' }) as GuestResponse;
    setGuest(nextGuest);
    return nextGuest;
  };

  const updateName = async (displayName: string) => {
    const nextGuest = await guestFetch('/guest/me', {
      method: 'PATCH',
      body: JSON.stringify({ displayName }),
    }) as GuestResponse;
    setGuest(nextGuest);
    socket.emit('guest:nameChanged', { displayName: nextGuest.displayName });
    return nextGuest;
  };

  const resetIdentity = async () => {
    await guestFetch('/guest/logout', { method: 'POST' });
    clearGuestToken();
    return bootstrap();
  };

  useEffect(() => {
    bootstrap().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      bootstrap().catch(() => null);
    }, 20 * 60 * 60 * 1000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        bootstrap().catch(() => null);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const value = useMemo(
    () => ({ guest, loading, bootstrap, updateName, resetIdentity }),
    [guest, loading]
  );

  if (loading) {
    return (
      <div className="center-screen">
        <div className="card glass" style={{ textAlign: 'center' }}>
          <div className="label-tag" style={{ marginBottom: 12 }}>Joining</div>
          <h2>Setting up your guest identity...</h2>
        </div>
      </div>
    );
  }

  return <GuestContext.Provider value={value}>{children}</GuestContext.Provider>;
}

export function useGuest() {
  const context = useContext(GuestContext);
  if (!context) throw new Error('useGuest must be used inside GuestProvider');
  return context;
}
