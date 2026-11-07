/**
 * Enterprise-only, tab-scoped Supabase auth lock.
 * Edge may deny navigator.locks.request() with SecurityError even on HTTPS.
 * Supabase v2 accepts a custom lock; serialize auth operations within this
 * document instead of relying on the blocked browser Web Locks API.
 *
 * No credentials are stored here. Auth tokens remain in guarded sessionStorage
 * (or its volatile fallback), never localStorage or cookies.
 */
export function createTabScopedAuthLock() {
  const pending = new Map<string, Promise<void>>();
  return async function lock<R>(name: string, acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
    const previous = pending.get(name);
    if (previous && acquireTimeout === 0) {
      throw Object.assign(new Error('Auth lock unavailable'), { isAcquireTimeout: true });
    }
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    pending.set(name, gate);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let acquired = !previous;
    try {
      if (previous) {
        if (acquireTimeout > 0) {
          await Promise.race([
            previous.then(() => { acquired = true; }),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(Object.assign(
                new Error('Auth lock acquisition timed out'),
                { isAcquireTimeout: true },
              )), acquireTimeout);
            }),
          ]);
        } else {
          await previous;
          acquired = true;
        }
      }
      return await fn();
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (acquired) {
        release();
      } else if (previous) {
        // A timed-out waiter must not let later callers overtake the holder.
        void previous.then(release, release);
      }
      if (pending.get(name) === gate) pending.delete(name);
    }
  };
}

export const enterpriseAuthLock = createTabScopedAuthLock();
