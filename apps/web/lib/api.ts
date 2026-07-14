'use client';

import { apiRequest } from './api-client';

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token =
    typeof window !== 'undefined' ? window.localStorage.getItem('kodpauza_token') : null;
  return apiRequest<T>(path, options, { token: token ?? undefined });
}

export function saveToken(token: string) {
  window.localStorage.setItem('kodpauza_token', token);
  window.dispatchEvent(new Event('kodpauza-auth-changed'));
}

export function clearToken() {
  window.localStorage.removeItem('kodpauza_token');
  window.dispatchEvent(new Event('kodpauza-auth-changed'));
}
