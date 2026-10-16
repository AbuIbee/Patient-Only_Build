// B2/B3 (RELEASE-BLOCKER-CLOSURE) regression tests for the reconciliation
// primitives shared by PatientMedications.tsx and PatientReminders.tsx's
// three legacy-localStorage-to-Supabase migrations. Pure logic, real
// localStorage (jsdom-free — Node's global localStorage polyfill is not
// used here; this uses a tiny in-memory stub instead, since the project
// deliberately does not add a DOM environment as a test dependency).
//
// This test verifies the RECONCILIATION LOGIC itself — which records are
// considered pending vs. already migrated, and when it is safe to clear
// the local source. It does not execute any Supabase call, open any
// database connection, or verify RLS/authorization — those remain BLOCKED
// pending an isolated staging environment, exactly as every other claim
// in this engagement is scoped.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadMigratedIdSet, saveMigratedIdSet, filterPending, isFullyMigrated } from '@/lib/legacyMigration';

// Minimal in-memory localStorage stub — Vitest's `environment: 'node'`
// config has no `window`/`localStorage` global by default.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null; }
  setItem(key: string, value: string) { this.store.set(key, value); }
  removeItem(key: string) { this.store.delete(key); }
  clear() { this.store.clear(); }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();
});

describe('loadMigratedIdSet / saveMigratedIdSet', () => {
  it('starts empty when nothing has been saved yet', () => {
    expect(loadMigratedIdSet('k').size).toBe(0);
  });

  it('round-trips a saved set exactly', () => {
    saveMigratedIdSet('k', new Set(['a', 'b', 'c']));
    const loaded = loadMigratedIdSet('k');
    expect(Array.from(loaded).sort()).toEqual(['a', 'b', 'c']);
  });

  it('tolerates corrupted JSON by returning an empty set, never throwing', () => {
    localStorage.setItem('k', 'not valid json{{{');
    expect(() => loadMigratedIdSet('k')).not.toThrow();
    expect(loadMigratedIdSet('k').size).toBe(0);
  });
});

describe('filterPending', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('returns everything when nothing is migrated yet', () => {
    expect(filterPending(items, new Set())).toEqual(items);
  });

  it('excludes only the ids already in the migrated set — the no-duplicate-reinsert guarantee', () => {
    const pending = filterPending(items, new Set(['b']));
    expect(pending.map(i => i.id)).toEqual(['a', 'c']);
  });

  it('returns an empty array once every id is migrated', () => {
    expect(filterPending(items, new Set(['a', 'b', 'c']))).toEqual([]);
  });
});

describe('isFullyMigrated', () => {
  const items = [{ id: 'a' }, { id: 'b' }];

  it('is false when the set is empty', () => {
    expect(isFullyMigrated(items, new Set())).toBe(false);
  });

  it('is false when only some items are migrated — the "never clear on partial success" guarantee', () => {
    expect(isFullyMigrated(items, new Set(['a']))).toBe(false);
  });

  it('is true only once every item is migrated', () => {
    expect(isFullyMigrated(items, new Set(['a', 'b']))).toBe(true);
  });

  it('is vacuously true for an empty item list', () => {
    expect(isFullyMigrated([], new Set())).toBe(true);
  });
});

describe('end-to-end reconciliation scenario (partial failure, then retry)', () => {
  it('never re-attempts an already-succeeded record, and only signals "safe to clear" once everything has gone through', () => {
    const records = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const key = 'scenario';

    // Round 1: records 1 and 2 succeed, record 3 fails (simulated below).
    let migrated = loadMigratedIdSet(key);
    let pending = filterPending(records, migrated);
    expect(pending.length).toBe(3); // nothing migrated yet

    const round1Results = [{ ok: true }, { ok: true }, { ok: false }]; // id '3' fails
    pending.forEach((r, i) => { if (round1Results[i].ok) migrated.add(r.id); });
    saveMigratedIdSet(key, migrated);
    expect(isFullyMigrated(records, migrated)).toBe(false); // must NOT clear local source yet

    // Round 2 (retry, e.g. after a page reload): only the failed one is pending.
    migrated = loadMigratedIdSet(key); // simulates a fresh load reading persisted progress
    pending = filterPending(records, migrated);
    expect(pending.map(r => r.id)).toEqual(['3']); // 1 and 2 are NOT re-attempted

    // Round 2 succeeds for the remainder.
    pending.forEach(r => migrated.add(r.id));
    saveMigratedIdSet(key, migrated);
    expect(isFullyMigrated(records, migrated)).toBe(true); // now safe to clear
  });
});
