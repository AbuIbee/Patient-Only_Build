# 03 — Reminder Scheduler Corrections (C02-004/005/006/007/008)

## Summary of the rewrite
`src/lib/reminderScheduler.ts` was rewritten in full. The prior version (from the previous corrective pass) returned only a permission status and had no serialization or collision-aware id allocation — independent verification's three mocked probes (`scheduler_fault_probe.json`, `scheduler_race_probe.json`) and this session's own direct recomputation all confirmed the same three defect classes. This report documents what changed and why, and the device acceptance plan for what remains unverified.

## C02-004 — Typed scheduling result contract
**Before:** `syncReminderNotifications` returned `Promise<'granted'|'denied'|'unsupported'>` — a permission status only. Every native call (`getPending`, `cancel`, `schedule`) was wrapped in its own `try/catch`, but every catch branch returned `'granted'` regardless of what failed. Independent verification's probe confirmed this concretely: pending-failure, cancel-failure, and schedule-failure modes all reported `status: 'granted'`.

**After:** `SchedulingResult = { status: SchedulingStatus; reason?: string; operation?: ... }`, where `SchedulingStatus` is exactly `'UNSUPPORTED' | 'PERMISSION_DENIED' | 'SCHEDULED' | 'FAILED' | 'RETRY_REQUIRED'` (per the correction order's required contract; `'SCHEDULING'` is a local, transient UI-only state set by the caller before awaiting, not something the scheduler itself returns — matching that a function can't meaningfully resolve to an in-progress state). Each of `getPending`/`cancel`/`schedule` is checked independently with its own `operation` label on failure. A new post-schedule reconciliation step calls `getPending()` again and compares the returned ids against what was just requested — a `schedule()` call that resolves without throwing is **not** treated as proof of success; only a reconciled match is.

## C02-005 — Serialized, generation-tracked coordinator
**Before:** no serialization at all. Independent verification's race probe: a delayed OLD sync's native call resolved *after* a NEW one had already completed, leaving both OLD's and NEW's notifications pending (`actual: ["NEW","OLD"]`). `PatientLayout.tsx`'s effect cleanup flag only suppressed the React state update for a stale result — it did not stop the underlying native call from completing and taking effect.

**After:** one module-level FIFO queue (`enqueue()`) that every exported function (`syncReminderNotifications`, `cancelAllReminderNotifications`) funnels through — native calls for this module physically cannot overlap, because a queued function's body does not begin executing until the previous one's promise has settled. A monotonically increasing `currentGeneration` counter is assigned synchronously at call time (before entering the queue) and checked via `isLatest()` at every await boundary inside the queued work; a stale check returns `RETRY_REQUIRED` instead of continuing as if still current. Two concrete scenarios are now covered by tests (not just asserted in prose):
1. A request whose own native call is genuinely slow and resolves after a newer request has already been issued — it detects staleness at its own post-call checkpoint and reports `RETRY_REQUIRED`, never a stale `SCHEDULED`.
2. A burst of three requests submitted synchronously, where the two earlier ones are superseded before their queued turn even starts — they report `RETRY_REQUIRED` immediately, without ever touching the native plugin, and only the latest actually runs.

Sign-out (`cancelAllReminderNotifications`) explicitly bumps the generation *before* issuing its own cancellation — any sync for that account still queued or in flight will see it is no longer latest once its turn comes up. Clearance is confirmed via a post-cancel `getPending()` check; if any of the account's notifications are still present afterward, the function returns `FAILED` rather than assuming the cancel succeeded.

## C02-006 — Truthful, state-specific user messages
Implemented the exact six-row message table from the correction order in `PatientReminders.tsx`'s new `REMINDER_STATUS_COPY`. Specifically:
- `UNSUPPORTED`/`PERMISSION_DENIED`/`FAILED`/`RETRY_REQUIRED` each render their own `Card` with `role="status" aria-live="polite"`.
- `SCHEDULING` is shown only while the async call set by `PatientLayout.tsx` is in flight.
- `SCHEDULED` renders **no banner and no live-region announcement at all** — this was a deliberate design choice: the correction order says "without announcing unverified success," and the safest reading of that is to never announce success via an ARIA live region at all, reserving the live-region channel for states that need the user's attention (denial, failure, retry).
- The adjacent "How Reminders Work" info card's prior unconditional "You'll see notifications at the scheduled times" sentence is removed; the approved `SCHEDULED`-state sentence ("Reminders are scheduled on this device. Delivery timing may vary with device settings.") is appended only when `reminderStatus === 'SCHEDULED'`.

## C02-007 — App-resume permission refresh
**Before:** the reminders-sync effect in `PatientLayout.tsx` depended only on `state.reminders` — returning from device settings after toggling notification permission did nothing until some other state change happened to re-run the effect.

**After:** `addReminderResumeListener()` registers a `document.addEventListener('visibilitychange', ...)` handler. On each transition to `visible`, it re-checks permission (`ensureReminderPermission()`) and, only if the result differs from what was last known, triggers a fresh `syncReminderNotifications()` call through the same coordinator used everywhere else, and resets the "don't nag" permission-prompt flag if permission just became granted. The listener is removed on unmount/account change (returned cleanup function, called from `PatientLayout.tsx`'s `useEffect` return).

**Why not `@capacitor/app`:** that package (which provides a native `resume` lifecycle event) is not an installed dependency. The correction order specifically asked for "the existing application lifecycle integration," and a Capacitor app is fundamentally a WebView — `document.visibilityState` already transitions on backgrounding/foregrounding on both Android and iOS without any additional native plugin. Adding a new dependency for this was judged unnecessary and avoided.

## C02-008 — Collision-free, persisted notification ids
**Before:** `notificationId(reminderId, dayOfWeek)` — a stateless string hash, `(hash * 31 + charCode) | 0`, reduced modulo `0x0fffffff` and multiplied by 8 plus the day. Independently proven (and re-verified by direct computation in this session) to collide: `81135175-714b-4450-82ee-fb6fe896f202` and `d9bad919-f0dc-4fa4-8626-76b3d7294c76` both produce `1177044809` for day 1.

```
$ node -e "... (the exact function) ...; console.log(notificationId('81135175-714b-4450-82ee-fb6fe896f202',1), notificationId('d9bad919-f0dc-4fa4-8626-76b3d7294c76',1))"
1177044809 1177044809
```

**After:** `allocateNotificationId(map, accountId, reminderId, dayOfWeek)` — the logical identity is `accountId::reminderId::dayOfWeek`. If that exact key already has an assigned id in the persisted map, it is reused (stable across reloads/edits). Otherwise, a candidate id is seeded from the same hash function as before (for distribution, not uniqueness) and linearly probed forward until a value **not already present as any value in the map** is found — collision is structurally impossible once this check is in place, since no two keys can ever be assigned the same id. The map is persisted to `localStorage` (a Capacitor WebView has normal DOM storage access; this is internal bookkeeping, not PHI, so it does not conflict with the app's `sessionStorage`-for-auth HIPAA posture). Stale entries (occurrences no longer active — e.g. a deleted reminder) are pruned per-account on every sync, without ever touching another account's entries, bounding growth.

## Exact-alarm permission — evaluated, not added
`SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM` were considered and deliberately not added. Reasoning:
- Medication/task reminders tolerate a delivery window of a few minutes — this is not a time-critical dispatch use case.
- Requesting exact-alarm permission on a targetSdk 33+ app (this app's `targetSdkVersion` is 36) invites additional Google Play Console policy review for a declared use case — out of scope for a corrective pass with no signing/Play-console authorization.
- The installed plugin's own `LocalNotificationManager.java` (`setExactIfPossible`) already falls back gracefully to inexact scheduling without this permission — nothing is broken by its absence, only timing precision is affected.
- Per the correction order's own instruction: "Whether medically precise timing is required remains an owner decision and is not authorized by this work order." This is recorded here as an explicit, reasoned non-decision, not a default.

## Device acceptance plan (unexecuted — no device/emulator available)
1. Fresh install on an API 33+ device/emulator; visit Reminders; confirm the OS permission prompt appears exactly once, and (if granted) no banner renders.
2. Deny permission (fresh install or by revoking in system settings); confirm the "Notifications are turned off" banner renders, using the exact C02-006 copy.
3. Create a reminder a few minutes out; background the app; confirm delivery within a few minutes (not exact-alarm precision, by design).
4. Schedule a reminder for the next day; reboot the device without reopening the app; confirm it still fires (native plugin's own boot-restore receiver, unchanged by this pass).
5. Change the device timezone with a reminder scheduled; confirm the next occurrence fires at the new local wall-clock time.
6. Edit then delete a reminder in quick succession; confirm exactly the final state's notification(s) are scheduled — no duplicate, no reappearance of the deleted one.
7. Enable/disable notification permission in system settings, then return to the app without touching any reminder; confirm the banner and schedule state refresh (C02-007) without an app reload.
8. Sign out while reminders are scheduled; confirm (via `adb shell dumpsys alarm` or waiting past a scheduled time) nothing fires afterward.
9. Schedule reminders for `81135175-714b-4450-82ee-fb6fe896f202`-shaped and `d9bad919-f0dc-4fa4-8626-76b3d7294c76`-shaped reminder records (the exact previously-colliding pair, as real app data) on the same device/day; confirm both fire independently and can each be edited/cancelled without affecting the other.

None of these 9 steps were performed by this engagement — no Android build toolchain, device, or emulator was available.
