import { getActiveOwnerEmail } from '@workspace/api-client-react';

export function getSessionToken(): string | null {
  try {
    return localStorage.getItem('atlas_session_token');
  } catch {
    return null;
  }
}

export function setSessionToken(token: string): void {
  try {
    localStorage.setItem('atlas_session_token', token);
  } catch (_) {}
}

export function removeSessionToken(): void {
  try {
    localStorage.removeItem('atlas_session_token');
  } catch (_) {}
}

/**
 * Universal apiFetch that always guarantees X-Owner-Email and Authorization headers
 */
export async function apiFetch<T = any>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const activeEmail = getActiveOwnerEmail();

  if (!headers.has('X-Owner-Email') && !headers.has('x-owner-email')) {
    headers.set('X-Owner-Email', activeEmail);
  }

  const token = getSessionToken();
  if (token && !headers.has('Authorization') && !headers.has('authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(input, { ...init, headers });
  if (!res.ok) {
    const errorText = await res.text();
    let errJson: any;
    try {
      errJson = JSON.parse(errorText);
    } catch {
      errJson = { error: errorText || `HTTP ${res.status}` };
    }
    throw new Error(errJson.error || `HTTP ${res.status}`);
  }

  return res.json();
}
