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
// CORRECTIVE PASS (MYMEMORIA-CLAUDE-CORRECTIVE-001): verified against the
// actually-installed @capacitor/local-notifications@8.0.2 package (tsc/vite
// build both pass against this file — see 04_TEST_RESULTS.md). The plugin's
// own AAR manifest (node_modules/@capacitor/local-notifications/android/
// src/main/AndroidManifest.xml) already declares POST_NOTIFICATIONS,
// RECEIVE_BOOT_COMPLETED, and WAKE_LOCK, and registers its own boot-restore
// receiver — Android's standard manifest merger pulls all of that into the
// final app manifest automatically, and the module is correctly wired into
// the native Gradle build (android/capacitor.settings.gradle,
// android/app/capacitor.build.gradle both include capacitor-local-
// notifications). Reboot survival and timezone re-evaluation are therefore
// handled by the plugin natively, not by this file. What this file is
// responsible for: requesting permission, converting this app's day
// convention, generating stable per-dose notification ids, performing a
// full cancel+reschedule (duplicate prevention), and reporting back the
// resulting permission state so the UI can show a truthful denied-state
// message instead of silently doing nothing (see PatientLayout.tsx /
// PatientReminders.tsx).
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Reminder } from '@/types';

export type ReminderPermissionStatus = 'granted' | 'denied' | 'unsupported';

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
export async function syncReminderNotifications(reminders: Reminder[]): Promise<ReminderPermissionStatus> {
  if (!Capacitor.isNativePlatform()) return 'unsupported';

  const granted = await ensureReminderPermission();
  if (!granted) return 'denied';

  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({
        notifications: pending.notifications.map(n => ({ id: n.id })),
      });
    }
  } catch (err) {
    console.error('Failed to clear previously scheduled reminders before re-sync:', err);
    return 'granted'; // permission is fine; just don't schedule on top of an unknown existing set
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

  if (toSchedule.length === 0) return 'granted';

  try {
    await LocalNotifications.schedule({ notifications: toSchedule });
  } catch (err) {
    console.error('Failed to schedule reminder notifications:', err);
  }
  return 'granted';
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
