# 02 — Billing Forward Migration Plan (C02-001/002/003/009)

**None of 011, 012, or 013 have been executed.** This is the forward deployment plan and the exact account-type compatibility table the correction order's C02-002 section asked for.

## Deployment order

| # | File | Depends on | Must NOT run before |
|---|---|---|---|
| 1 | `011_subscriptions_revoke_client_billing_authority.sql` | — | — |
| 2 | `012_profiles_revoke_client_role_authority.sql` | — | — (independent of 011/013, but logically pairs with them — both close client-write escalation paths) |
| 3 | `013_subscriptions_atomic_lifecycle.sql` | 011 (redefines the same `admin_set_subscription` function 011 first created) | Applying 013 without 011 first would leave 011's policy drops un-applied while 013's RPC redefinition already assumes they're gone — apply in this order. |

All three are additive/idempotent by construction (`IF NOT EXISTS`, `DROP POLICY/CONSTRAINT IF EXISTS` + recreate, `CREATE OR REPLACE FUNCTION`) and safe to attempt against an unknown current state — that is not a substitute for a human running `pg_policies`/`information_schema` checks against the real target first, per the same caveat every migration in this engagement has carried since `002`.

## Account-type compatibility table (C02-002's required deliverable)

`AdminLayout.tsx`'s `ACCOUNT_TYPES` defines seven types. Each is checked against two live constraints `MyMemoria_Production_Audit` evidence confirms: `trial_ends_at` and `trial_started_at` are both `NOT NULL`, and the `status` CHECK constraint's exact allowed values could not be independently confirmed (only column/policy data was available, not constraint definitions).

| Account type | tier | status | trialDays | Pre-013 trial_ends_at | NOT NULL violation (pre-013)? | Post-013 trial_ends_at | Resolved? |
|---|---|---|---|---|---|---|---|
| `temp_user` | free_tier | `trialing` | 3 | computed (3 days out) | No | unchanged | **Status value unconfirmed** — see below |
| `promo` | paid_tier | `promo` | 45 | computed (45 days out) | No | unchanged | Yes (status value not flagged as suspect by any evidence) |
| `companion` | free_tier | `trialing` | 30 | computed (30 days out) | No | unchanged | **Status value unconfirmed** — see below |
| `daily_care` | paid_tier | `active` | null | **NULL** | **Yes** | `trial_started_at` (now) | **Yes — fixed by 013** |
| `full_support` | paid_tier | `active` | null | **NULL** | **Yes** | `trial_started_at` (now) | **Yes — fixed by 013** |
| `master` | master | `active` | null | NULL (post-F10-corrective; was `'2099-12-31'` originally) | **Yes** | `trial_started_at` (now) | **Yes — fixed by 013** |
| `canceled` | free_tier | `canceled` | null | **NULL** | **Yes** | `trial_started_at` (now) | **Yes — fixed by 013** |

**4 of 7 types (`daily_care`, `full_support`, `master`, `canceled`) had a confirmed NOT NULL violation before this pass — all 4 are resolved by `013`'s `admin_set_subscription()` redefinition**, which falls back to `trial_started_at` (effectively "now," a zero-length trial window) whenever the caller passes `NULL` for `trial_ends_at`. This is the exact same pattern `SubscriptionContext.tsx`'s own free-tier auto-provisioning already used before this pass touched anything (`trial_started_at: now, trial_ends_at: now` for a no-trial free account) — **not a new business-semantics invention**, which is why this was resolved directly rather than escalated as a stop condition. The correction order's own conditional language ("if... cannot be represented... without changing business semantics, stop") does not apply here, because representing "no active trial" as a zero-length trial window is already the codebase's own established meaning for that case, not a new one this pass is choosing.

**1 remaining, genuinely open question — not resolved, correctly not guessed:** `temp_user` and `companion` both send `status: 'trialing'`. FQA-011 (an earlier independent audit read during this engagement) states the live `status` CHECK constraint "excludes trialing" — but this could not be independently re-confirmed (the available evidence lists live table *columns* and *policies*, never the literal CHECK constraint expression). Two outcomes are possible, and this plan does not guess which:
- If `'trialing'` **is** a valid live status value: no action needed, both types already work correctly after this pass.
- If `'trialing'` **is not** a valid live status value: calling `admin_set_subscription('temp_user'-shaped args)` will fail with a visible Postgres CHECK-violation error (a safe failure — no silent corruption, no false success) — but the `temp_user`/`companion` account types would remain **non-functional through the admin panel** until either (a) the live constraint is confirmed to actually allow `'trialing'` and nothing more is needed, or (b) the owner decides what replacement status value (if any) should represent those two types, which **is** a business-semantics decision this plan does not make unilaterally.

**Recommended next step for the owner/DBA, before applying any of 011/012/013:** run `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'subscriptions'::regclass AND contype = 'c';` (read-only) against the real project to get the literal `status` CHECK expression, and confirm/refute the `'trialing'` question definitively. This single query resolves the one remaining open item in this entire plan.

## Forward-fix summary (what each file actually changes, net)
- **011:** removes 8 named client-writable policies from `subscriptions` (including one misnamed "Service role can update subscriptions" that actually applied to `PUBLIC` with `USING(true)`); adds `admin_set_subscription()` v1 (existence-check based).
- **012:** removes client INSERT/UPDATE privilege on `profiles.role` entirely (column-level, not RLS); caps the signup trigger's metadata-derived role; adds `admin_set_role()`.
- **013:** aligns `subscriptions`' shape with the real live table; redefines `admin_set_subscription()` as a true atomic upsert; adds `provision_free_subscription()`, `promo_codes` (empty), and `redeem_promo_code()`.

## Rollback (corrected per C02-009 — see the migration file's own comments for the full procedure)
Do not `DROP FUNCTION` any of `admin_set_subscription`, `admin_set_role`, `provision_free_subscription`, or `redeem_promo_code` as a "rollback" — Postgres has no history of a prior `CREATE OR REPLACE FUNCTION` body, so this removes the only copy that exists. If a real rollback is ever needed: capture the exact function definition/ACLs from the target environment *before* applying anything, and restore via a fresh `CREATE OR REPLACE FUNCTION` using that captured definition — never a bare `DROP` with no replacement.

## What this plan does not authorize
No part of this plan is an instruction to execute 011/012/013 against any environment, including the isolated-staging environment it assumes will eventually exist. Execution requires separate, explicit owner authorization, per every standing instruction in this engagement.
