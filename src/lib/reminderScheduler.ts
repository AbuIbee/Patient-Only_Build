// F16 remediation.
//
// PatientReminders.tsx advertised "You'll see notifications at the
// scheduled times" with no implementation behind it anywhere in the repo —
// @capacitor/local-notifications is a declared package.json dependency but
// was never imported or called. This module is the real scheduler.
//
// Capacitor's LocalNotifications plugin only delivers real OS-level
// background notifications on native platforms (Android/iOS) — in a plain
// browser tab, Capacitor.isNativePlatform() is false and this module is a
// deliberate no-op. That is the honest behavior the work order requires
// ("do not claim reliable background delivery based on a foreground
// timer") rather than a setTimeout-based stand-in that would stop firing
// the moment the tab/app is backgrounded or killed.
//
// NOT RUNTIME-VERIFIED: no isolated device/emulator was available in this
// pass (see 04_OUTSTANDING_BLOCKERS.md). The exact request/response shape
// of @capacitor/local-notifications below is written against its stable,
// long-documented v1+ repeating-schedule API (`schedule.on.{weekday,hour,minute}`),
// but could not be typechecked against the installed 8.0.2 types in this
// checkout because node_modules here is a stub (see 00_BASELINE_AND_SCOPE.md)
// and `npm install` was not run pending separate approval. Verify with
// `tsc`/`npm run build` before relying on this in a device build.
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Reminder } from '@/types';

let permissionPromptedThisSession = false;

export async function ensureReminderPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  try {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return true;
    if (permissionPromptedThisSession) return false; // don't nag every re-sync in one session
    permissionPromptedThisSession = true;
    const result = await LocalNotifications.requestPermissions();
    return result.display === 'granted';
  } catch (err) {
    console.error('Reminder notification permission check/request failed:', err);
    return false;
  }
}

// Capacitor notification ids must be 32-bit integers, but reminder ids are
// UUIDs, and one reminder can expand into up to 7 scheduled notifications
// (one per day-of-week) — each needs its own stable id so a later re-sync
// can cancel exactly the right ones. Derived deterministically from the
// reminder id + day so the same reminder always maps to the same id set
// without needing a separate id-mapping table.
// Exported for unit testing (determinism/uniqueness/range) — not intended
// to be called directly outside this module otherwise.
export function notificationId(reminderId: string, dayOfWeek: number): number {
  let hash = 0;
  for (let i = 0; i < reminderId.length; i++) {
    hash = (hash * 31 + reminderId.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 0x0fffffff) * 8 + dayOfWeek; // low 3 bits reserved for the day
}

// This app's days_of_week / daysOfWeek use JS Date.getDay() convention
// (0=Sunday..6=Saturday — see PatientMedications.tsx, PatientReminders.tsx).
// Capacitor's LocalNotifications `weekday` field uses 1=Sunday..7=Saturday.
// Converted explicitly rather than assumed to line up.
export function toCapacitorWeekday(jsDay: number): number {
  return jsDay + 1;
}

/**
 * Re-syncs the device's scheduled local notifications to exactly match the
 * given reminder list. Cancels everything previously scheduled by this app
 * and reschedules from scratch — simple and correct for edit/delete/
 * duplicate-schedule cases, at the cost of a full cancel+reschedule on
 * every call rather than a diff. Call this whenever `state.reminders`
 * changes (see PatientLayout.tsx).
 */
export async function syncReminderNotifications(reminders: Reminder[]): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const granted = await ensureReminderPermission();
  if (!granted) return;

  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({
        notifications: pending.notifications.map(n => ({ id: n.id })),
      });
    }
  } catch (err) {
    console.error('Failed to clear previously scheduled reminders before re-sync:', err);
    return; // don't schedule on top of an unknown existing set
  }

  const toSchedule = reminders
    .filter(r => r.isActive)
    .flatMap(reminder => {
      const [hourStr, minuteStr] = (reminder.time || '00:00').split(':');
      const hour = Number(hourStr) || 0;
      const minute = Number(minuteStr) || 0;
      const days = reminder.daysOfWeek && reminder.daysOfWeek.length > 0
        ? reminder.daysOfWeek
        : [0, 1, 2, 3, 4, 5, 6];

      return days.map(day => ({
        id: notificationId(reminder.id, day),
        title: reminder.title,
        body: reminder.message,
        schedule: {
          on: { weekday: toCapacitorWeekday(day), hour, minute },
          allowWhileIdle: true,
        },
        sound: reminder.sound || undefined,
      }));
    });

  if (toSchedule.length === 0) return;

  try {
    await LocalNotifications.schedule({ notifications: toSchedule });
  } catch (err) {
    console.error('Failed to schedule reminder notifications:', err);
  }
}

export async function cancelAllReminderNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({
        notifications: pending.notifications.map(n => ({ id: n.id })),
      });
    }
  } catch (err) {
    console.error('Failed to cancel reminder notifications:', err);
  }
}
