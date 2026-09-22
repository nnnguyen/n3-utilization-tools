export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api').replace(/\/$/, '');
export const API_BASE_URL = API_URL.replace(/\/api$/, '');

export async function apiFetch(path: string, init?: RequestInit & { silent?: boolean }): Promise<any> {
  const url = path.startsWith('http') ? path : `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`;
  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  const isJson = response.headers.get('Content-Type')?.includes('application/json');
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    const errorData = data?.message || data?.error || data || 'Internal Server Error';
    const errorMessage = Array.isArray(errorData) ? errorData[0] : (typeof errorData === 'object' ? JSON.stringify(errorData) : errorData);
    
    if (!init?.silent) {
      console.error(`API request failed: ${response.status} ${response.statusText}`, errorMessage);
    }
    
    throw new Error(errorMessage);
  }

  return data || response;
}
