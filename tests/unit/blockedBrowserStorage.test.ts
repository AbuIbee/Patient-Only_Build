import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createTabSessionStorage } from '@/lib/tabSessionStorage';

const originalSessionStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
afterEach(() => {
  vi.unstubAllGlobals();
  if (originalSessionStorage) Object.defineProperty(globalThis, 'sessionStorage', originalSessionStorage);
  else Reflect.deleteProperty(globalThis, 'sessionStorage');
});

function denyBrowserStorage() {
  const denied = () => { throw new DOMException('Access is denied for this document.', 'SecurityError'); };
  vi.stubGlobal('window', Object.defineProperties({}, {
    sessionStorage: { get: denied }, localStorage: { get: denied },
  }));
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get: denied });
}

describe('browser storage denied by privacy policy', () => {
  it('constructs the real Supabase client and resolves an anonymous session', async () => {
    denyBrowserStorage();
    const client = createClient('https://example.supabase.co', 'test-public-key', {
      auth: { storage: createTabSessionStorage(), autoRefreshToken: false, detectSessionInUrl: false },
    });
    expect((await client.auth.getSession()).data.session).toBeNull();
    await client.removeAllChannels();
  });
  it('supports sign-in storage and removal in isolated memory when the getter throws', () => {
    denyBrowserStorage();
    const storage = createTabSessionStorage();
    expect(storage.getItem('session')).toBeNull();
    storage.setItem('session', 'synthetic-session');
    expect(storage.getItem('session')).toBe('synthetic-session');
    expect(createTabSessionStorage().getItem('session')).toBeNull();
    storage.removeItem('session');
    expect(storage.getItem('session')).toBeNull();
  });
  it('uses tab storage normally, and survives a later quota/write failure', () => {
    const backing = new Map<string, string>();
    const setItem = vi.fn((key: string, value: string) => { backing.set(key, value); });
    vi.stubGlobal('window', { sessionStorage: {
      getItem: (key: string) => backing.get(key) ?? null,
      setItem, removeItem: (key: string) => backing.delete(key),
    } });
    const storage = createTabSessionStorage();
    storage.setItem('session', 'first');
    expect(backing.get('session')).toBe('first');
    setItem.mockImplementation(() => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); });
    storage.setItem('session', 'second');
    expect(storage.getItem('session')).toBe('second');
    storage.removeItem('session');
    expect(storage.getItem('session')).toBeNull();
  });
});
