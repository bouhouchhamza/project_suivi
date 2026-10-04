import type { User } from './types';

const env = (import.meta as any).env ?? {};
const API = env.VITE_API_URL ?? 'http://localhost:4000/api';

const storage =
  typeof globalThis.localStorage !== 'undefined'
    ? globalThis.localStorage
    : null;

let token = storage?.getItem('suivi_token') ?? null;

export const setToken = (value: string | null) => {
  token = value;

  if (!storage) return;

  if (value) {
    storage.setItem('suivi_token', value);
  } else {
    storage.removeItem('suivi_token');
  }
};

export const getToken = () => token;

export async function api<T>(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw Object.assign(
      new Error(data.message ?? 'Erreur API'),
      {
        status: res.status,
        data,
      },
    );
  }

  return data as T;
}

export async function login(email: string, password: string) {
  return api<{ token: string; user: User }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function apiGetBinary(path: string): Promise<{ buffer: ArrayBuffer; filename: string } | null> {
  const res = await fetch(`${API}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 404) return null;
  if (!res.ok) throw Object.assign(new Error('Erreur API'), { status: res.status });
  const header = res.headers.get('X-Template-Filename');
  const filename = header ? decodeURIComponent(header) : 'template.xlsx';
  return { buffer: await res.arrayBuffer(), filename };
}

export async function apiPutBinary(path: string, buffer: ArrayBuffer, filename: string) {
  const res = await fetch(`${API}${path}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Template-Filename': encodeURIComponent(filename),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: buffer,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw Object.assign(new Error(data.message ?? 'Erreur API'), { status: res.status, data });
  }
}
