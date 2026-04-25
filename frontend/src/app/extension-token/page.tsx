'use client';

import { useEffect, useState } from 'react';
import { useGuest } from '@/components/GuestProvider';

type TokenResponse = {
  token?: string;
  expiresAt?: string;
  message?: string;
};

export default function ExtensionTokenPage() {
  const { guest } = useGuest();
  const [token, setToken] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const refreshToken = async () => {
    setLoading(true);
    setError('');
    setCopied(false);

    try {
      const response = await fetch('/api/extension/token', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      const data = (await response.json().catch(() => ({}))) as TokenResponse;

      if (!response.ok || !data.token) {
        throw new Error(data.message || 'Could not generate an extension token.');
      }

      setToken(data.token);
      setExpiresAt(data.expiresAt || '');
    } catch (err) {
      setToken('');
      setExpiresAt('');
      setError(err instanceof Error ? err.message : 'Could not generate an extension token.');
    } finally {
      setLoading(false);
    }
  };

  const copyToken = async () => {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  useEffect(() => {
    refreshToken();
  }, []);

  return (
    <div className="narrow-page">
      <header style={{ textAlign: 'center', marginBottom: 24 }}>
        <h1>Extension token</h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
          Paste this short-lived token into the WatchParty extension.
        </p>
      </header>

      <div className="card glass form-stack">
        <div>
          <div className="label-tag" style={{ marginBottom: 8 }}>Signed in as</div>
          <div style={{ color: 'var(--text-secondary)' }}>{guest?.displayName || 'Guest'}</div>
        </div>

        <label style={{ display: 'grid', gap: 8 }}>
          <span className="label-tag">Token</span>
          <textarea
            className="input"
            readOnly
            value={token}
            placeholder={loading ? 'Generating token...' : 'Token will appear here'}
            style={{ minHeight: 150, resize: 'vertical', fontFamily: 'monospace' }}
          />
        </label>

        {expiresAt && (
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Expires: {new Date(expiresAt).toLocaleString()}
          </p>
        )}

        {error && (
          <p style={{ margin: 0, color: '#ef4444' }}>
            {error}
          </p>
        )}

        <div className="player-toolbar">
          <button className="button" onClick={copyToken} disabled={!token}>
            {copied ? 'Copied' : 'Copy token'}
          </button>
          <button className="button button-secondary" onClick={refreshToken} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>
    </div>
  );
}
