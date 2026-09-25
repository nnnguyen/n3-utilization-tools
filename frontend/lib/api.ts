import { authHeaders } from './auth-token';
import { apiErrorText, currentLanguage } from './i18n/translate';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api').replace(/\/$/, '');
export const API_BASE_URL = API_URL.replace(/\/api$/, '');

export async function apiFetch(path: string, init?: RequestInit & { silent?: boolean }): Promise<any> {
  const url = path.startsWith('http') ? path : `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`;
  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...init?.headers,
    },
  });

  const isJson = response.headers.get('Content-Type')?.includes('application/json');
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    const errorData = data?.message || data?.error || data || 'Internal Server Error';
    // Coded errors are shown in the chosen language; others keep the backend text
    const errorMessage =
      apiErrorText(currentLanguage(), data) ??
      (Array.isArray(errorData) ? errorData[0] : (typeof errorData === 'object' ? JSON.stringify(errorData) : errorData));
    
    if (!init?.silent) {
      console.error(`API request failed: ${response.status} ${response.statusText}`, errorMessage);
    }
    
    // status lets callers tell "not logged in" (401) apart from network/server errors
    throw Object.assign(new Error(errorMessage), { status: response.status, code: data?.code });
  }

  return data || response;
}
