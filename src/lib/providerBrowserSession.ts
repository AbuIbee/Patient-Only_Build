import type { Session } from '@supabase/supabase-js';
import { safeSessionStorage } from './safeSessionStorage';

const ENDPOINT = '/api/hcn-provider-session';
const REFRESH_PREFIX = 'hcn-provider-cookie:';

export function isProviderInboxPath(path: string) {
  return /^\/Professional\/Provider(?:\/|$)/i.test(path);
}

function requestSession(body: object) {
  const request = () => fetch(ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  // Refresh rotation changes the cookie. Serialize operations between tabs.
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks) return request();
  let started = false;
  return locks.request('hcn-provider-session', () => {
    started = true;
    return request();
  }).catch((error) => {
    if (!started && error instanceof DOMException && error.name === 'SecurityError') return request();
    throw error;
  });
}

export async function resumeProviderSession(): Promise<Session | null> {
  const response = await requestSession({ action: 'resume' });
  return response.ok ? response.json() : null;
}

export async function rememberProviderSession(session: Session): Promise<Session | null> {
  if (session.refresh_token.startsWith(REFRESH_PREFIX)) return null;
  const response = await requestSession({
    action: 'enroll',
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  });
  return response.ok ? response.json() : null;
}

export async function providerAwareFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (!url.pathname.endsWith('/auth/v1/token') || url.searchParams.get('grant_type') !== 'refresh_token' ||
      typeof init?.body !== 'string') return fetch(input, init);

  const token = JSON.parse(init.body).refresh_token;
  if (typeof token !== 'string' || !token.startsWith(REFRESH_PREFIX)) return fetch(input, init);
  const response = await requestSession({ action: 'resume', sessionId: token.slice(REFRESH_PREFIX.length) });
  if (response.ok) return response;
  return Response.json({ message: 'The remembered provider session is unavailable.' }, { status: response.status });
}

export const providerAwareSessionStorage = {
  ...safeSessionStorage,
  async removeItem(key: string) {
    const previous = safeSessionStorage.getItem(key);
    safeSessionStorage.removeItem(key);
    if (!previous?.includes(REFRESH_PREFIX)) return;
    try {
      const token = JSON.parse(previous).refresh_token;
      if (typeof token === 'string' && token.startsWith(REFRESH_PREFIX)) {
        await requestSession({ action: 'clear', sessionId: token.slice(REFRESH_PREFIX.length) });
      }
    } catch {
      // The browser session was removed even if the network is unavailable.
    }
  },
};
