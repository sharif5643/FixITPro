import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = 'https://fixitpro.in.th/api/v1';

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('token');
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  get:  <T>(path: string)              => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
};

export async function login(email: string, password: string) {
  const data = await api.post<{ access_token: string }>('/auth/login', { email, password });
  if (!data.access_token) throw new Error('ไม่ได้รับ token จากเซิร์ฟเวอร์');
  return data;
}

export async function logout() {
  await AsyncStorage.removeItem('token');
}
