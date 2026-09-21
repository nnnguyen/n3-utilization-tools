export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api').replace(/\/$/, '');
export const API_BASE_URL = API_URL.replace(/\/api$/, '');

export async function apiFetch(path: string, init?: RequestInit): Promise<any> {
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
    const errorMessage = data?.message || (Array.isArray(data?.message) ? data.message[0] : null) || 'Đã có lỗi xảy ra';
    throw new Error(Array.isArray(errorMessage) ? errorMessage[0] : errorMessage);
  }

  return data || response;
}
