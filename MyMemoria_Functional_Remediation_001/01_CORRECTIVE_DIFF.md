# 01 — Corrective Diff (MYMEMORIA-CLAUDE-CORRECTIVE-001)

Branch `remediation/mymemoria-functional-001`, confirmed at expected HEAD `3a6ed1e8` with a clean worktree before any edit (see command output in this session; only the pre-existing, already-documented `dist/` build-artifact residue was present, not source). No new branch created; all 8 prior commits preserved exactly. Two new commits added on top:

```
4ebbda8d CORRECTIVE (F16/FQA-010): verify native manifest coverage, surface denied-permission state
f62b3689 CORRECTIVE (F10/FQA-016/SEC-004): close the gap migration 010 left open
3a6ed1e8 Add required reports: ... (unchanged, prior HEAD)
```

## Commit `f62b3689` — F10/FQA-016/SEC-004

| File | Change |
|---|---|
| `supabase/migrations/011_subscriptions_revoke_client_billing_authority.sql` | **New file.** `DROP POLICY IF EXISTS` on 8 exact, evidence-confirmed policy names on `public.subscriptions`; redefines `admin_set_subscription()` against the real table shape (keyed by `id`, not `user_id`) using an existence-check upsert; adds a manual rollback note and 8 staging-only authorization test descriptions. See `02_SUBSCRIPTION_POLICY_REMEDIATION.md` for full detail. **Not executed.** |

## Commit `4ebbda8d` — F16/FQA-010

| File | Change |
|---|---|
| `src/lib/reminderScheduler.ts` | `syncReminderNotifications()` return type changed from `Promise<void>` to `Promise<ReminderPermissionStatus>` (`'granted' \| 'denied' \| 'unsupported'`), a new exported type. Internal scheduling/cancellation logic unchanged except for the new return values at each early-exit point. Header comment updated to record the manifest-merger finding (see `03_ANDROID_NOTIFICATION_INTEGRATION.md`). |
| `src/pages/patient/PatientLayout.tsx` | Import updated to also bring in the `ReminderPermissionStatus` type. New `useState<ReminderPermissionStatus>('unsupported')` + the existing reminders-sync `useEffect` now awaits the promise and stores its result (with a `cancelled` guard against a stale update after unmount/re-run). `<PatientReminders />` render call now passes `reminderPermissionDenied={reminderPermissionStatus === 'denied'}`. |
| `src/pages/patient/PatientReminders.tsx` | Component signature changed from `PatientReminders()` to `PatientReminders({ reminderPermissionDenied = false }: { reminderPermissionDenied?: boolean })`. New conditional `<Card>` block rendered above the existing "How Reminders Work" info card when `reminderPermissionDenied` is true, with a truthful "Notifications are turned off" message and a pointer to device settings. No other JSX changed. |
| `tests/unit/reminderScheduler.permission.test.ts` | **New file.** 5 tests mocking `@capacitor/core` and `@capacitor/local-notifications` (see `04_TEST_RESULTS.md`). |

## What was deliberately NOT changed, and why
- **`android/app/src/main/AndroidManifest.xml` — untouched.** Inspection (not assumption) of the installed `@capacitor/local-notifications@8.0.2` package's own AAR manifest, plus confirmation that the module is correctly wired into the native Gradle build (`android/capacitor.settings.gradle`, `android/app/capacitor.build.gradle` both already include `capacitor-local-notifications`), established that `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, and `WAKE_LOCK` — plus the plugin's own boot-restore receiver — are already supplied via Android's standard manifest merger. Adding redundant app-level declarations would not change build output and was correctly judged unnecessary under "implement only necessary manifest/config/permission handling."
- **No `SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM` added.** Medication/task reminders tolerate a few minutes of delivery slop; requesting exact-alarm permission invites additional Google Play Console review requirements for no confirmed benefit to this use case. Judged not justified, per the correction order's own instruction to add it "only if justified."
- **Migration `010` left in place, not edited.** The correction order asked for a new additive migration, not a rewrite of history; `010` remains as the historical record of what was originally proposed (including its now-documented shape error), and `011` supersedes its policy/RPC effect going forward.
- **No signing, Play Console, or deployment configuration touched.**
