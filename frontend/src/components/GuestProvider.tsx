'use client';

import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { clearGuestToken, guestAuthHeaders, setGuestToken } from '@/lib/guestToken';
import { API_URL } from '@/lib/env';
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

type GuestResponse = Guest & { token?: string };

async function guestFetch(path: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 12_000);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      credentials: 'include',
      headers: guestAuthHeaders({
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The server took too long to respond.');
    }
    throw new Error('Could not reach WatchParty. Check your connection and try again.');
  } finally {
    window.clearTimeout(timeoutId);
  }

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
  const [bootstrapError, setBootstrapError] = useState('');

  const bootstrap = async () => {
    try {
      setBootstrapError('');
      const nextGuest = await guestFetch('/guest/bootstrap', { method: 'POST' }) as GuestResponse;
      setGuest(nextGuest);
      return nextGuest;
    } catch (error) {
      setBootstrapError(error instanceof Error ? error.message : 'Could not set up your guest identity.');
      throw error;
    }
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
    bootstrap().catch(() => null).finally(() => setLoading(false));
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

  if (loading || (!guest && bootstrapError)) {
    return (
      <div className="center-screen">
        <div className="card glass identity-status-card" role={bootstrapError ? 'alert' : 'status'} aria-live="polite">
          <div className="label-tag" style={{ marginBottom: 12 }}>{bootstrapError ? 'Connection issue' : 'Joining'}</div>
          <h2>{bootstrapError ? 'We could not get you ready' : 'Setting up your guest identity...'}</h2>
          <p className="text-mute">{bootstrapError || 'No account is needed. This usually takes only a moment.'}</p>
          {bootstrapError && (
            <div className="actions-row" style={{ justifyContent: 'center' }}>
              <button className="button" onClick={() => { setLoading(true); bootstrap().catch(() => null).finally(() => setLoading(false)); }}>Try again</button>
              <button className="button button-secondary" onClick={() => { setLoading(true); resetIdentity().catch(() => null).finally(() => setLoading(false)); }}>Start fresh</button>
            </div>
          )}
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
