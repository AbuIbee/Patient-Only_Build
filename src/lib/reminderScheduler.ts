// F16 / C02-004 / C02-005 / C02-007 / C02-008.
//
// This is a corrective rewrite. The prior version (a) returned only a
// permission status, meaning a getPending/cancel/schedule failure after a
// granted permission was reported as success with no visible failure
// state; (b) had no serialization — a slow, superseded sync could complete
// after a newer one and leave stale reminders scheduled; (c) derived
// notification ids from a stateless hash, which independent verification
// proved collides for real, distinct, valid reminder UUIDs (see
// 04_REGRESSION_TEST_EVIDENCE.md — 81135175-714b-4450-82ee-fb6fe896f202 and
// d9bad919-f0dc-4fa4-8626-76b3d7294c76 both hashed to 1177044809).
//
// Capacitor's LocalNotifications plugin only delivers real OS-level
// background notifications on native platforms — in a browser tab,
// Capacitor.isNativePlatform() is false and every operation here reports
// UNSUPPORTED rather than silently doing nothing or faking success.
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Reminder } from '@/types';

// ── Typed result contract (C02-004) ────────────────────────────────────────
export type SchedulingStatus =
  | 'UNSUPPORTED'
  | 'PERMISSION_DENIED'
  | 'SCHEDULED'
  | 'FAILED'
  | 'RETRY_REQUIRED';

export interface SchedulingResult {
  status: SchedulingStatus;
  /** Safe, non-sensitive description — never raw plugin/device error text. */
  reason?: string;
  /** Which step failed, when applicable. */
  operation?: 'permission' | 'getPending' | 'cancel' | 'schedule' | 'reconcile' | 'confirmClearance';
}

const UNSUPPORTED: SchedulingResult = { status: 'UNSUPPORTED' };

// ── Permission ──────────────────────────────────────────────────────────────
let permissionPromptedThisSession = false;

export async function ensureReminderPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (!Capacitor.isNativePlatform()) return 'unsupported';
  try {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return 'granted';
    if (permissionPromptedThisSession) return 'denied'; // don't nag every re-sync in one session
    permissionPromptedThisSession = true;
    const result = await LocalNotifications.requestPermissions();
    return result.display === 'granted' ? 'granted' : 'denied';
  } catch {
    // A transient plugin error is not the same as a confirmed denial, but
    // without permission confirmed we cannot proceed either way.
    return 'denied';
  }
}

/** Resets the "don't nag" flag — call after returning from device settings. */
function resetPermissionPromptGuard() {
  permissionPromptedThisSession = false;
}

// ── Collision-free, persisted notification-id allocation (C02-008) ────────
// A reminder occurrence's *logical identity* is (account, reminder, day).
// The native 32-bit id assigned to it is persisted in localStorage so the
// same occurrence always reuses the same id (stable across reloads), and a
// fresh id is only allocated — by probing for an unused value, not by
// trusting an unverified hash — the first time that logical identity is
// seen. This directly fixes the proven collision: two different reminder
// ids no longer can be assigned the same native id, because allocation
// checks the full set of already-assigned ids before accepting a
// candidate.
const ID_MAP_STORAGE_KEY = 'reminderNotificationIdMap_v1';
const MAX_NOTIFICATION_ID = 0x7fffffff; // Capacitor/Android notification ids are 32-bit signed ints
const MAX_PROBE_ATTEMPTS = 10000;

interface IdMap { [logicalKey: string]: number }

function logicalKey(accountId: string, reminderId: string, dayOfWeek: number): string {
  return `${accountId}::${reminderId}::${dayOfWeek}`;
}

function loadIdMap(): IdMap {
  try {
    const raw = localStorage.getItem(ID_MAP_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function saveIdMap(map: IdMap): void {
  try {
    localStorage.setItem(ID_MAP_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Best-effort persistence only; a failure here means ids won't be
    // stable across reloads but does not affect correctness within a
    // single session (the in-memory map used during this sync is still
    // collision-free for this run).
  }
}

function seedHash(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % MAX_NOTIFICATION_ID;
}

/**
 * Returns the stable native id for this logical occurrence, allocating and
 * persisting a fresh collision-checked one on first use. Exported for unit
 * testing.
 */
export function allocateNotificationId(map: IdMap, accountId: string, reminderId: string, dayOfWeek: number): number {
  const key = logicalKey(accountId, reminderId, dayOfWeek);
  const existing = map[key];
  if (existing !== undefined) return existing; // reuse — unchanged occurrence

  const assignedIds = new Set(Object.values(map));
  let candidate = seedHash(key);
  let attempts = 0;
  while (assignedIds.has(candidate)) {
    attempts++;
    if (attempts > MAX_PROBE_ATTEMPTS) {
      throw new Error('Could not allocate a unique notification id');
    }
    candidate = (candidate + 1) % MAX_NOTIFICATION_ID;
  }

  map[key] = candidate;
  return candidate;
}

/** Removes map entries for this account's logical keys no longer present
 * in `activeLogicalKeys`, bounding growth. Never touches another
 * account's entries. */
function pruneStaleEntries(map: IdMap, accountId: string, activeLogicalKeys: Set<string>): void {
  const prefix = `${accountId}::`;
  for (const key of Object.keys(map)) {
    if (key.startsWith(prefix) && !activeLogicalKeys.has(key)) {
      delete map[key];
    }
  }
}

// ── Generation-tracked serialization coordinator (C02-005) ────────────────
// Every public operation below is funneled through this single module-level
// queue, so native plugin calls for this app never overlap — a slow,
// superseded sync physically cannot resolve its native work after a newer
// one has already started, because the newer one's work does not begin
// until the older one's promise has settled. Generation numbers let an
// operation that is still QUEUED (not yet started) when superseded skip its
// now-pointless native work entirely, rather than merely running it safely
// out of order.
let currentGeneration = 0;
let queueTail: Promise<unknown> = Promise.resolve();

function nextGeneration(): number {
  currentGeneration += 1;
  return currentGeneration;
}

function isLatest(generation: number): boolean {
  return generation === currentGeneration;
}

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const result = queueTail.then(work, work);
  // Swallow so a failed operation doesn't poison the queue for the next one.
  queueTail = result.then(() => undefined, () => undefined);
  return result;
}

// ── Day-of-week conversion ───────────────────────────────────────────────
// This app's days_of_week/daysOfWeek use JS Date.getDay() (0=Sunday..6=
// Saturday). Capacitor's LocalNotifications `weekday` uses 1=Sunday..7=
// Saturday.
export function toCapacitorWeekday(jsDay: number): number {
  return jsDay + 1;
}

function activeOccurrences(reminders: Reminder[]): Array<{ reminder: Reminder; day: number }> {
  const out: Array<{ reminder: Reminder; day: number }> = [];
  for (const reminder of reminders) {
    if (!reminder.isActive) continue;
    const days = reminder.daysOfWeek && reminder.daysOfWeek.length > 0
      ? reminder.daysOfWeek
      : [0, 1, 2, 3, 4, 5, 6];
    for (const day of days) out.push({ reminder, day });
  }
  return out;
}

/**
 * Re-syncs the device's scheduled local notifications to exactly match the
 * given reminder list for the given account. Serialized against every other
 * call to this module (schedule/cancel/account-switch/sign-out) so results
 * are never applied out of order.
 */
export function syncReminderNotifications(accountId: string, reminders: Reminder[]): Promise<SchedulingResult> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve(UNSUPPORTED);

  const myGeneration = nextGeneration();

  return enqueue(async (): Promise<SchedulingResult> => {
    if (!isLatest(myGeneration)) {
      return { status: 'RETRY_REQUIRED', reason: 'Superseded by a newer reminder change before this one ran.' };
    }

    const permission = await ensureReminderPermission();
    if (permission === 'unsupported') return UNSUPPORTED;
    if (permission === 'denied') return { status: 'PERMISSION_DENIED', operation: 'permission' };

    if (!isLatest(myGeneration)) {
      return { status: 'RETRY_REQUIRED', reason: 'Superseded while requesting notification permission.' };
    }

    const occurrences = activeOccurrences(reminders);
    const idMap = loadIdMap();
    const accountPrefix = `${accountId}::`;

    // Collect every id ever allocated to this account BEFORE pruning —
    // this is the full prior set to cancel, including occurrences that no
    // longer exist (deleted reminders). Pruning first and deriving the
    // cancel set from the already-pruned map would lose track of exactly
    // the ids that most need cancelling (a deleted reminder's id is, by
    // definition, not in the new active set).
    const previouslyOwnedIds = Object.entries(idMap)
      .filter(([key]) => key.startsWith(accountPrefix))
      .map(([, id]) => id);

    if (previouslyOwnedIds.length > 0) {
      try {
        await LocalNotifications.cancel({ notifications: previouslyOwnedIds.map(id => ({ id })) });
      } catch {
        return { status: 'FAILED', operation: 'cancel', reason: 'Could not clear previously scheduled reminders.' };
      }
    }

    if (!isLatest(myGeneration)) {
      return { status: 'RETRY_REQUIRED', reason: 'Superseded after clearing previously scheduled reminders.' };
    }

    const activeKeys = new Set(occurrences.map(o => logicalKey(accountId, o.reminder.id, o.day)));
    pruneStaleEntries(idMap, accountId, activeKeys);

    let assignedIds: number[];
    try {
      assignedIds = occurrences.map(o => allocateNotificationId(idMap, accountId, o.reminder.id, o.day));
    } catch {
      return { status: 'FAILED', operation: 'schedule', reason: 'Could not assign a notification slot.' };
    }
    saveIdMap(idMap);

    if (!isLatest(myGeneration)) {
      return { status: 'RETRY_REQUIRED', reason: 'Superseded after allocating notification slots.' };
    }

    if (occurrences.length === 0) return { status: 'SCHEDULED' };

    const toSchedule = occurrences.map((o, i) => {
      const [hourStr, minuteStr] = (o.reminder.time || '00:00').split(':');
      return {
        id: assignedIds[i],
        title: o.reminder.title,
        body: o.reminder.message,
        schedule: {
          on: { weekday: toCapacitorWeekday(o.day), hour: Number(hourStr) || 0, minute: Number(minuteStr) || 0 },
          allowWhileIdle: true,
        },
        sound: o.reminder.sound || undefined,
      };
    });

    try {
      await LocalNotifications.schedule({ notifications: toSchedule });
    } catch {
      return { status: 'FAILED', operation: 'schedule', reason: 'Could not schedule your reminders.' };
    }

    if (!isLatest(myGeneration)) {
      return { status: 'RETRY_REQUIRED', reason: 'Superseded immediately after scheduling.' };
    }

    // ── Reconcile: verify what we just scheduled is actually pending ──────
    let afterIds: Set<number>;
    try {
      const after = await LocalNotifications.getPending();
      afterIds = new Set(after.notifications.map(n => n.id));
    } catch {
      return { status: 'FAILED', operation: 'getPending', reason: 'Could not confirm reminders were scheduled.' };
    }

    const missing = assignedIds.filter(id => !afterIds.has(id));
    if (missing.length > 0) {
      return { status: 'RETRY_REQUIRED', operation: 'reconcile', reason: `${missing.length} reminder(s) could not be confirmed.` };
    }

    return { status: 'SCHEDULED' };
  });
}

/**
 * Cancels every notification this module has ever scheduled for the given
 * account on this device, invalidating any in-flight/queued sync for that
 * account first. Confirms clearance by re-checking pending notifications
 * afterward — returns FAILED (not a silent assumption of success) if any
 * of this account's notifications are still present.
 */
export function cancelAllReminderNotifications(accountId: string): Promise<SchedulingResult> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve(UNSUPPORTED);

  // Invalidate prior generations BEFORE native cancellation (C02-005): any
  // sync for this account still queued will see it is no longer latest and
  // skip its own scheduling work once its turn comes up.
  nextGeneration();

  return enqueue(async (): Promise<SchedulingResult> => {
    const idMap = loadIdMap();
    const prefix = `${accountId}::`;
    const ownedIds = new Set(
      Object.entries(idMap).filter(([key]) => key.startsWith(prefix)).map(([, id]) => id)
    );

    if (ownedIds.size === 0) return { status: 'SCHEDULED' }; // nothing to clear

    try {
      await LocalNotifications.cancel({ notifications: Array.from(ownedIds).map(id => ({ id })) });
    } catch {
      return { status: 'FAILED', operation: 'cancel', reason: 'Could not clear this account\'s reminders.' };
    }

    try {
      const pending = await LocalNotifications.getPending();
      const stillPresent = pending.notifications.some(n => ownedIds.has(n.id));
      if (stillPresent) {
        return { status: 'FAILED', operation: 'confirmClearance', reason: 'Could not confirm reminders were cleared.' };
      }
    } catch {
      return { status: 'FAILED', operation: 'confirmClearance', reason: 'Could not confirm reminders were cleared.' };
    }

    // Clear this account's entries from the persisted map so a future
    // login reallocates fresh ids rather than reusing now-cancelled ones
    // (harmless either way, but keeps the map from growing across logouts).
    for (const key of Object.keys(idMap)) {
      if (key.startsWith(prefix)) delete idMap[key];
    }
    saveIdMap(idMap);

    return { status: 'SCHEDULED' };
  });
}

// ── App-resume listener (C02-007) ──────────────────────────────────────────
// Device-settings permission changes (enabling/revoking notifications while
// the app is backgrounded) are only visible on resume — there is no push
// event for a permission change. Uses the standard `visibilitychange` DOM
// event (the app's existing lifecycle integration — a Capacitor app is a
// WebView, and backgrounding/foregrounding it changes document visibility
// on both Android and iOS) rather than adding a new Capacitor plugin
// dependency (`@capacitor/app` is not currently installed). Registers once;
// the caller is responsible for calling the returned cleanup function on
// unmount/account change.
export function addReminderResumeListener(
  onPermissionChange: (accountId: string, reminders: Reminder[]) => void,
  getAccountAndReminders: () => { accountId: string; reminders: Reminder[] } | null,
): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};

  let lastKnownPermission: 'granted' | 'denied' | 'unsupported' | null = null;
  let removed = false;

  const handleVisibilityChange = async () => {
    if (removed || document.visibilityState !== 'visible') return;
    const current = await ensureReminderPermission();
    if (current === lastKnownPermission) return; // no change — avoid a redundant re-prompt/re-sync
    const changed = lastKnownPermission !== null; // first visible-check after mount just establishes baseline
    lastKnownPermission = current;
    if (!changed) return;

    if (current === 'granted') resetPermissionPromptGuard();

    const context = getAccountAndReminders();
    if (context) onPermissionChange(context.accountId, context.reminders);
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Establish the baseline without treating it as a "change".
  ensureReminderPermission().then(p => { lastKnownPermission = p; });

  return () => {
    removed = true;
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}
