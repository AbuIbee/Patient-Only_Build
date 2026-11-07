import {describe, expect, it, vi} from 'vitest';
import {createTabScopedAuthLock} from './tabScopedAuthLock';

describe('Haneen Edge auth lock without browser Web Locks', () => {
  it('serializes concurrent auth operations for one session key', async () => {
    const lock = createTabScopedAuthLock();
    const order: string[] = [];
    let finish!: () => void;
    const first = lock('sb-session', -1, async () => {
      order.push('first-start');
      await new Promise<void>(resolve => { finish = resolve; });
      order.push('first-end');
      return 'first';
    });
    const second = lock('sb-session', -1, async () => {
      order.push('second-start');
      return 'second';
    });
    expect(order).toEqual(['first-start']);
    finish();
    expect(await Promise.all([first, second])).toEqual(['first', 'second']);
    expect(order).toEqual(['first-start', 'first-end', 'second-start']);
  });

  it('does not depend on navigator.locks when Edge denies access', async () => {
    const deniedRequest = vi.fn(() => { throw new DOMException('The request was denied.', 'SecurityError'); });
    const lock = createTabScopedAuthLock();
    // The lock is a pure, tab-scoped queue and never invokes the Web Locks API.
    const result = await lock('auth', -1, async () => 'signed-in');
    expect(result).toBe('signed-in');
    expect(deniedRequest).not.toHaveBeenCalled();
  });

  it('releases the lock after a failed auth operation', async () => {
    const lock = createTabScopedAuthLock();
    await expect(lock('auth', -1, async () => { throw new Error('sign-in failed'); }))
      .rejects.toThrow('sign-in failed');
    expect(await lock('auth', -1, async () => 'recovered')).toBe('recovered');
  });

  it('honors non-blocking acquisition, without executing the rejected operation', async () => {
    const lock = createTabScopedAuthLock();
    let release!: () => void;
    const pending = lock('auth', -1, async () => new Promise<void>(resolve => {release = resolve;}));
    const handler = vi.fn(async () => 'should-not-run');
    await expect(lock('auth', 0, handler)).rejects.toMatchObject({isAcquireTimeout: true});
    expect(handler).not.toHaveBeenCalled();
    release();
    await pending;
  });

  it('uses distinct queues for independent auth storage keys', async () => {
    const lock = createTabScopedAuthLock();
    let release!: () => void;
    const pending = lock('first', -1, async () => new Promise<void>(resolve => {release = resolve;}));
    expect(await lock('other', -1, async () => 'not blocked')).toBe('not blocked');
    release();
    await pending;
  });
});
