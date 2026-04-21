'use client';

import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';

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

async function guestFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || 'Guest request failed');
  }

  return res.json();
}

export function GuestProvider({ children }: { children: ReactNode }) {
  const [guest, setGuest] = useState<Guest | null>(null);
  const [loading, setLoading] = useState(true);

  const bootstrap = async () => {
    const nextGuest = await guestFetch('/guest/bootstrap', { method: 'POST' });
    setGuest(nextGuest);
    return nextGuest;
  };

  const updateName = async (displayName: string) => {
    const nextGuest = await guestFetch('/guest/me', {
      method: 'PATCH',
      body: JSON.stringify({ displayName }),
    });
    setGuest(nextGuest);
    return nextGuest;
  };

  const resetIdentity = async () => {
    await guestFetch('/guest/logout', { method: 'POST' });
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
