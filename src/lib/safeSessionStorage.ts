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
