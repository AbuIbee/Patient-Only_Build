// B2/B3 (RELEASE-BLOCKER-CLOSURE): shared reconciliation primitives for the
// one-time legacy-localStorage-to-Supabase migrations (medications, dose
// history, calendar notes, tasks). Each migration tracks which local
// records have already been confirmed persisted, keyed by the record's
// own stable local `id` — so a retry (next page load, after a network
// failure, after a browser refresh) only re-attempts what's still
// pending, never re-inserts an already-succeeded record (no duplicates),
// and never clears the local source until every record is accounted for
// (no stranded/lost data on partial failure).

/** Load the set of local ids already confirmed migrated, for one localStorage key. */
export function loadMigratedIdSet(storageKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/** Persist the set of local ids confirmed migrated so far. */
export function saveMigratedIdSet(storageKey: string, ids: Set<string>): void {
  localStorage.setItem(storageKey, JSON.stringify(Array.from(ids)));
}

/** Records not yet in the migrated set — the ones this attempt should try. */
export function filterPending<T extends { id: string }>(items: T[], migratedIds: Set<string>): T[] {
  return items.filter(item => !migratedIds.has(item.id));
}

/** True only once every item's id is present in the migrated set. */
export function isFullyMigrated<T extends { id: string }>(items: T[], migratedIds: Set<string>): boolean {
  return items.every(item => migratedIds.has(item.id));
}
