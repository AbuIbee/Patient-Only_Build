import { describe, expect, it, vi } from 'vitest';
import { createSafeSessionStorage, type SessionStorageLike } from './safeSessionStorage';

function memoryStorage(): SessionStorageLike {
  const memory = new Map<string, string>();
  return {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => { memory.set(key, value); },
    removeItem: (key) => { memory.delete(key); },
  };
}

describe('Supabase session storage adapter — restricted Edge/InPrivate', () => {
  it('uses normal sessionStorage without resorting to persistent storage', () => {
    const nativeSession = memoryStorage();
    const adapter = createSafeSessionStorage(() => nativeSession);
    expect(adapter.getItem('auth-key')).toBeNull();
    adapter.setItem('auth-key', 'short-lived-token');
    expect(nativeSession.getItem('auth-key')).toBe('short-lived-token');
    expect(adapter.getItem('auth-key')).toBe('short-lived-token');
    adapter.removeItem('auth-key');
    expect(adapter.getItem('auth-key')).toBeNull();
    expect(nativeSession.getItem('auth-key')).toBeNull();
  });

  it('cannot crash when the window.sessionStorage property getter itself denies access', () => {
    const deniedGetter = vi.fn((): SessionStorageLike => {
      throw new DOMException('Access is denied for this document.', 'SecurityError');
    });
    const adapter = createSafeSessionStorage(deniedGetter);
    expect(adapter.getItem('auth-key')).toBeNull();
    expect(() => adapter.setItem('auth-key', 'temporary-token')).not.toThrow();
    expect(adapter.getItem('auth-key')).toBe('temporary-token');
    expect(() => adapter.removeItem('auth-key')).not.toThrow();
    expect(adapter.getItem('auth-key')).toBeNull();
    expect(deniedGetter).toHaveBeenCalled();
  });

  it('falls back when individual sessionStorage methods throw SecurityError', () => {
    const restricted: SessionStorageLike = {
      getItem: () => { throw new DOMException('Blocked read', 'SecurityError'); },
      setItem: () => { throw new DOMException('Blocked write', 'SecurityError'); },
      removeItem: () => { throw new DOMException('Blocked delete', 'SecurityError'); },
    };
    const adapter = createSafeSessionStorage(() => restricted);
    adapter.setItem('auth-key', 'temporary-token');
    expect(adapter.getItem('auth-key')).toBe('temporary-token');
    adapter.removeItem('auth-key');
    expect(adapter.getItem('auth-key')).toBeNull();
  });

  it('uses temporary memory when sessionStorage cannot be resolved', () => {
    const adapter = createSafeSessionStorage(() => null);
    adapter.setItem('auth-key', 'temporary-token');
    expect(adapter.getItem('auth-key')).toBe('temporary-token');
  });

  it('never persists volatile fallback across fresh app starts', () => {
    const denied = () => { throw new DOMException('Denied', 'SecurityError'); };
    const firstTab = createSafeSessionStorage(denied);
    firstTab.setItem('auth-key', 'temporary-token');
    expect(firstTab.getItem('auth-key')).toBe('temporary-token');
    const freshTab = createSafeSessionStorage(denied);
    expect(freshTab.getItem('auth-key')).toBeNull();
  });

  it('can return to native sessionStorage when it becomes available', () => {
    let canAccessStorage = false;
    const nativeSession = memoryStorage();
    const adapter = createSafeSessionStorage(() => {
      if (!canAccessStorage) throw new DOMException('Denied', 'SecurityError');
      return nativeSession;
    });
    adapter.setItem('auth-key', 'temporary-token');
    expect(adapter.getItem('auth-key')).toBe('temporary-token');
    canAccessStorage = true;
    // Missing native session value is authoritative once normal access resumes:
    // do not silently restore a fallback token into browser persistent storage.
    expect(adapter.getItem('auth-key')).toBeNull();
    adapter.setItem('auth-key', 'new-token');
    expect(nativeSession.getItem('auth-key')).toBe('new-token');
  });
});
