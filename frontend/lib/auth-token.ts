// Access token kept by the frontend and sent as "Authorization: Bearer".
// Needed because the frontend (vercel.app) and backend (railway.app) are
// different sites: Safari and Firefox block the backend's cookie on our
// cross-site requests, so the cookie alone only works in Chrome.
//
// Stored in localStorage so the session survives reloads and new tabs (the
// JWT itself expires after JWT_EXPIRES_IN). Every access is wrapped because
// storage can be unavailable (private mode, blocked site data).

const STORAGE_KEY = 'n3_access_token';

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null | undefined) {
  try {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: the cookie (where the browser allows it) still works
  }
}

export function clearAuthToken() {
  setAuthToken(null);
}

// Header object for requests that don't go through apiFetch (XHR, fetch with FormData, antd Upload)
export function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
