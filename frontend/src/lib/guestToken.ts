const TOKEN_KEY = 'wp_guest_token';

export function getGuestToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setGuestToken(token?: string | null) {
  if (typeof window === 'undefined' || !token) return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearGuestToken() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
}

export function guestAuthHeaders(headers: HeadersInit = {}) {
  const token = getGuestToken();
  return {
    ...headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
