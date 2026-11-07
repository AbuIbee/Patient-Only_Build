/**
 * Tab-scoped Supabase Auth storage with a non-persistent fallback.
 *
 * In Edge's restricted documents (including some InPrivate/security setups),
 * even *reading* window.sessionStorage can throw SecurityError. Supplying an
 * unguarded adapter to Supabase prevents the app from mounting.
 *
 * Never fall back to localStorage or cookies: patient sessions must not persist
 * across new browser sessions. The Map is module/tab scoped and discarded on
 * reload; when storage is denied, the user may need to sign in again.
 */
export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createSafeSessionStorage(
  resolveStorage: () => SessionStorageLike | null = () =>
    typeof window !== 'undefined' ? window.sessionStorage : null,
): SessionStorageLike {
  const memory = new Map<string, string>();

  return {
    getItem(key: string): string | null {
      try {
        const storage = resolveStorage();
        if (storage) {
          const value = storage.getItem(key);
          if (value === null) memory.delete(key);
          else memory.set(key, value);
          return value;
        }
      } catch {
        // Access denied: use only memory scoped to this tab.
      }
      return memory.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      memory.set(key, value);
      try {
        resolveStorage()?.setItem(key, value);
      } catch {
        // Keep token in volatile memory only; never move to localStorage.
      }
    },
    removeItem(key: string): void {
      memory.delete(key);
      try {
        resolveStorage()?.removeItem(key);
      } catch {
        // The volatile fallback has already been cleared.
      }
    },
  };
}

export const safeSessionStorage = createSafeSessionStorage();

/**
 * Work around @supabase/phoenix's eager access to global.sessionStorage.
 * Phoenix reads window.sessionStorage in its socket constructor even when
 * Supabase Auth is configured with a custom safe storage adapter.
 *
 * When the browser denies access, install a VOLATILE, tab-scoped Storage
 * implementation before constructing the shared Supabase client. Never use
 * localStorage or cookies; no token survives a page reload in this mode.
 *
 * Returns false if the browser refuses replacement as well. The calling
 * bootstrap can then provide diagnostics rather than assuming access works.
 */
export function installVolatileSessionStorageIfDenied(
  target: object | undefined = typeof window === 'undefined' ? undefined : window,
): 'native' | 'volatile' | 'unavailable' {
  if (!target) return 'unavailable';
  try {
    const existing = (target as { sessionStorage?: SessionStorageLike }).sessionStorage;
    // Test a read, not just property resolution; some browsers expose a
    // Storage object but deny the actual operation.
    existing?.getItem('__hcn_session_storage_capability__');
    if (existing) return 'native';
  } catch {
    // Explicitly denied by browser policy; temporary memory is allowed.
  }

  const entries = new Map<string, string>();
  const volatileStorage: Storage = {
    get length() { return entries.size; },
    clear() { entries.clear(); },
    key(index: number) { return [...entries.keys()][index] ?? null; },
    getItem(key: string) { return entries.get(key) ?? null; },
    setItem(key: string, value: string) { entries.set(key, value); },
    removeItem(key: string) { entries.delete(key); },
  };
  try {
    Object.defineProperty(target, 'sessionStorage', {
      configurable: true,
      enumerable: true,
      value: volatileStorage,
    });
    return 'volatile';
  } catch {
    return 'unavailable';
  }
}
