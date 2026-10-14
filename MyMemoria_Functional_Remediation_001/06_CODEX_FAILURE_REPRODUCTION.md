# 06 — Codex Failure Reproduction (MYMEMORIA-CLAUDE-CORRECTIVE-003)

For each C02 finding with a concrete, independently-reproducible defect, this report shows the BEFORE state (reproduced fresh in this session, not just quoted from the prior report) and the AFTER state (this pass's fix), so the correction can be checked against the original failure directly.

## C02-008 — Notification ID collision

**BEFORE** (superseded `notificationId()`, re-run in this session against the exact function body from before this pass):
```js
function notificationId(reminderId, dayOfWeek) {
  let hash = 0;
  for (let i = 0; i < reminderId.length; i++) {
    hash = (hash * 31 + reminderId.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 0x0fffffff) * 8 + dayOfWeek;
}
notificationId('81135175-714b-4450-82ee-fb6fe896f202', 1); // 1177044809
notificationId('d9bad919-f0dc-4fa4-8626-76b3d7294c76', 1); // 1177044809 — COLLISION
```

**AFTER** (`allocateNotificationId()`, current implementation, exercised by `tests/unit/reminderScheduler.test.ts`'s `'assigns independent ids to the known previously-colliding UUID pair'` test — PASSING):
```js
const map = {};
allocateNotificationId(map, 'acct-1', '81135175-714b-4450-82ee-fb6fe896f202', 1); // some id X
allocateNotificationId(map, 'acct-1', 'd9bad919-f0dc-4fa4-8626-76b3d7294c76', 1); // a DIFFERENT id Y, X !== Y
```
The allocator checks every already-assigned value in the map before accepting a candidate id, so this pair (and any future colliding-hash pair) is structurally guaranteed two different ids, not probabilistically likely to avoid collision.

## C02-004 — Silent failures reported as success

**BEFORE** (reproduced via `scheduler_fault_probe.json`'s three scenarios against the pre-pass function):
| Native call that fails | Reported status before this pass |
|---|---|
| `getPending()` throws | `'granted'` |
| `cancel()` throws | `'granted'` |
| `schedule()` throws (after a successful cancel) | `'granted'` |

**AFTER** (`tests/unit/reminderScheduler.permission.test.ts`, all passing):
| Native call that fails | Reported status now | Test |
|---|---|---|
| `cancel()` throws (on previously-owned ids) | `{ status: 'FAILED', operation: 'cancel' }` | `'returns FAILED with operation "cancel" when cancelling previously-owned notifications throws'` |
| `schedule()` throws | `{ status: 'FAILED', operation: 'schedule' }` | `'returns FAILED with operation "schedule" when scheduling throws after a successful cancel'` |
| `getPending()` throws (during post-schedule reconciliation) | `{ status: 'FAILED', operation: 'getPending' }` | `'returns FAILED with operation "getPending" when reading pending notifications fails during reconciliation'` |
| `schedule()` succeeds but the ids don't actually land (reconciliation mismatch) | `{ status: 'RETRY_REQUIRED', operation: 'reconcile' }` | `'returns RETRY_REQUIRED when post-schedule reconciliation shows a requested id is missing'` |

No scenario that previously returned `'granted'` on a failure now returns anything but a visibly-failed/retry-required typed result.

## C02-005 — Stale sync revives old reminders

**BEFORE** (`scheduler_race_probe.json`, reproduced conceptually against the pre-pass function, which had no serialization at all): a delayed OLD sync's native call could complete after a NEW sync's, leaving both pending — `actual: ["NEW","OLD"]` against an `expected: ["NEW"]`.

**AFTER** (`tests/unit/reminderScheduler.permission.test.ts`, both passing):
- `'a delayed OLD sync is strictly serialized ahead of NEW...'` — constructs the exact scenario (OLD's native `schedule()` call deliberately held open while a NEW request is issued) and asserts OLD's own post-schedule check detects it is no longer latest and reports `RETRY_REQUIRED`, while NEW (which could not even start until OLD's call settled, by construction of the FIFO queue) reports `SCHEDULED`.
- `'requests superseded before their queued turn starts...'` — three requests issued synchronously; the two earlier generations report `RETRY_REQUIRED` without ever invoking the native plugin at all (`scheduleMock` called exactly once, by the latest).

## C02-001 / C02-002 / C02-003 / C02-009 — SQL-based findings

These cannot be "run" without a live database (no isolated staging exists), so reproduction here is a direct, line-cited comparison between the exact defect Codex's independent audit named and the exact corrected SQL/application code, rather than an executed before/after test:

| Finding | Codex's cited evidence | This pass's exact correction |
|---|---|---|
| C02-001 | `011:97-102::admin_set_subscription` trusts `profiles.role`; live `profiles_update`/`profiles_insert` permit self-role mutation | `012_profiles_revoke_client_role_authority.sql`: `REVOKE UPDATE ON public.profiles FROM authenticated; GRANT UPDATE (first_name, last_name, phone, photo_url, phone_normalized, must_change_password, mfa_enabled, updated_at) ON public.profiles TO authenticated;` (role excluded) — re-confirmed in this session that `AdminLayout.tsx`'s `saveUser()` (the plain `.update({role: e.role,...})` call Codex's audit implicitly describes) no longer sends `role` in that call at all; it goes through `admin_set_role()` instead. |
| C02-002 | `010:16-29::subscriptions` CREATE TABLE IF NOT EXISTS uses `user_id UUID PRIMARY KEY` — doesn't match the recorded `id` PK; `AdminLayout.tsx:63-118,196-215` sends `trialing`/null `trial_ends_at` against recorded NOT NULL/CHECK constraints; `011`'s SELECT-then-INSERT is non-atomic | `013_subscriptions_atomic_lifecycle.sql`: real `id`-keyed shape; `admin_set_subscription()` redefined as `INSERT ... ON CONFLICT (user_id) DO UPDATE` (single atomic statement, re-confirmed by direct re-read of the file); `COALESCE(p_trial_ends_at, v_trial_started)` eliminates every NULL-trial_ends_at case this session's own compatibility table (`02_BILLING_FORWARD_MIGRATION_PLAN.md`) traced across all 7 account types. |
| C02-003 | `SubscriptionContext.tsx:92-114,183-240` direct free-tier insert and separate, unchecked promo insert+update | Re-confirmed by direct re-read of the current file: `loadSubscription()`'s missing-row branch now calls `supabase.rpc('provision_free_subscription')` exclusively; `redeemPromoCode()` is now a single `supabase.rpc('redeem_promo_code', { p_code: code })` call with no separate insert/update/rollback-delete sequence anywhere in the function body. |
| C02-009 | `011:147-168::ROLLBACK` incorrectly claims `DROP FUNCTION` restores 010's version | Re-confirmed by direct re-read: `grep -n "revert to whatever" supabase/migrations/011_*.sql` now matches only inside the corrected text itself, in a sentence explicitly refuting the old claim (`"... does NOT 'revert to whatever 010 left in place' ..."`) — the original paragraph asserting it as fact is gone, replaced by the correct capture-before-change / `CREATE OR REPLACE` procedure. |

## C02-006 / C02-007 — UI/lifecycle findings
Not independently executable without a browser/device. Re-confirmed by direct code re-read in this session:
- C02-006: `grep -n "You'll see notifications at the scheduled times" src/pages/patient/PatientReminders.tsx` → **no matches** (the sentence Codex's audit cited verbatim is gone; re-confirmed, not assumed).
- C02-007: `grep -n "visibilitychange" src/lib/reminderScheduler.ts` → present (the listener implementation, 3 matches: the comment, `addEventListener`, `removeEventListener`). `grep -n "addReminderResumeListener" src/pages/patient/PatientLayout.tsx` → present (the import and the wiring call in a dedicated `useEffect` with a cleanup return) — `PatientLayout.tsx` consumes the exported function rather than containing the literal `visibilitychange` string itself, confirmed by reading both files directly rather than assumed.

## What this report does not claim
Every reproduction above is either (a) an executed, passing automated test in this session, or (b) a direct, grep/read-confirmed comparison of source text — never a claim of live database or device behavior. No RLS policy drop, no RPC, and no native scheduling behavior has been executed against a real system by this report or by any part of this corrective pass.
