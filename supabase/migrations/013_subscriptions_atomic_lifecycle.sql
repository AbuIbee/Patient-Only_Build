-- 013_subscriptions_atomic_lifecycle.sql
-- C02-002 (schema alignment + atomic admin RPC) and
-- C02-003 (server-owned free-tier provisioning + atomic promo redemption).
--
-- PROPOSAL ONLY — NOT EXECUTED. See header note in 002_identity_and_role_contract.sql.
--
-- EVIDENCE (read-only; MyMemoria_Production_Audit/04_SUPABASE_SECURITY_AND_SCHEMA.md):
-- "Recorded subscriptions has id PK, user_id NOT NULL and recorded
-- uniqueness, trial_started_at/trial_ends_at NOT NULL, plus provider,
-- period and cancellation columns." 010's CREATE TABLE IF NOT EXISTS used
-- `user_id UUID PRIMARY KEY` — wrong shape — and omitted
-- current_period_start/current_period_end/stripe_customer_id/canceled_at/
-- promo_code. This file supersedes that shape for anything still run
-- fresh, and makes 011's admin_set_subscription() genuinely atomic now
-- that uniqueness on user_id is confirmed (011 used a SELECT-then-branch
-- specifically because that confirmation was not yet available).

-- ── Schema alignment (idempotent either way: fresh install or existing-DB) ──
CREATE TABLE IF NOT EXISTS subscriptions (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                 UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  tier                    TEXT NOT NULL CHECK (tier IN ('free_tier', 'paid_tier', 'master')),
  status                  TEXT NOT NULL,
  trial_started_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  trial_ends_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  current_period_start    TIMESTAMP WITH TIME ZONE,
  current_period_end      TIMESTAMP WITH TIME ZONE,
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  canceled_at             TIMESTAMP WITH TIME ZONE,
  promo_code              TEXT,
  promo_expires_at        TIMESTAMP WITH TIME ZONE,
  created_at              TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at              TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- In case this runs against a table that exists but is missing any of
-- these (defensive; evidence says they already exist, but this file does
-- not assume its own evidence is infallible).
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS current_period_end   TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS stripe_customer_id    TEXT,
  ADD COLUMN IF NOT EXISTS canceled_at           TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS promo_code            TEXT;

-- *** CORRECTED (CORRECTIVE-002 / CORRECTION C) ***: defensive coverage for
-- the one fresh-install path this file's own header already flags as wrong
-- — 010_subscriptions_and_admin_rpc.sql's `CREATE TABLE IF NOT EXISTS
-- subscriptions (user_id UUID PRIMARY KEY, ...)` has NO `id` column at all.
-- If 010 is ever the one that actually creates this table (a genuinely
-- fresh database, never production — production evidence already confirms
-- `id` is the real PK there), this file's own `CREATE TABLE IF NOT EXISTS`
-- immediately above is a no-op (010 already created it) and `id` would
-- otherwise never get added, breaking every function below that does
-- `RETURNING * INTO v_row` / declares `v_row subscriptions` and relies on
-- `id` existing. Added defensively; harmless (no-op) against the real,
-- already-`id`-keyed production shape.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT uuid_generate_v4();
DO $$ BEGIN
  ALTER TABLE subscriptions ALTER COLUMN id SET NOT NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'subscriptions.id could not be made NOT NULL — reconcile manually (likely means it already is, or a row has a null id from an unexpected source).';
END $$;
DO $$ BEGIN
  ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR invalid_table_definition THEN NULL;
END $$;

-- *** CORRECTED (CORRECTIVE-002 / CORRECTION C) ***: the original exception
-- handler here (`WHEN duplicate_table`) was wrong — Postgres raises
-- `duplicate_object` (SQLSTATE 42710), not `duplicate_table` (42P07), when
-- `ADD CONSTRAINT` targets a constraint name that already exists. The
-- original handler would not have caught that error at all: on a database
-- where `subscriptions_user_id_unique` (or an equivalent unique constraint
-- under this exact name) already exists, this statement would have raised
-- an uncaught error and aborted the rest of this migration file.
DO $$ BEGIN
  ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- *** CORRECTED (CORRECTIVE-002 / CORRECTION C) ***: status CHECK, resolved.
-- The original note here said "not reconciled" pending an owner decision
-- between six approved statuses (src/types/subscription.ts's
-- SubscriptionStatus: active/past_due/canceled/expired/pending_payment/
-- promo) and three additional values live application code also uses
-- (trialing/requires_payment/incomplete — see App.tsx, ProtectedRoute.tsx,
-- TrialBanner.tsx, AdminLayout.tsx). MYMEMORIA-CRITICAL-REPAIR-CORRECTIVE-002
-- resolves this explicitly: "Preserve exactly these six subscription
-- statuses... Do not extend the database status constraint to nine
-- values." This is now enforced as an actual CHECK constraint (previously
-- there was NONE on this column at all in this file — only an imperative
-- check inside admin_set_subscription(), which a direct service-role/
-- webhook write would never go through).
--
-- *** CONFIRMED, NOT-YET-RESOLVED CONSEQUENCE (explicitly flagged, not
-- silently absorbed) ***: src/pages/admin/AdminLayout.tsx's own
-- `ACCOUNT_TYPES` table offers two account-type presets with
-- `status: 'trialing'` (lines 67 and 83), passed directly as
-- `admin_set_subscription`'s `p_status` argument by `saveAccountType()`.
-- Once this CHECK constraint (and the matching validation inside
-- admin_set_subscription() below) is live, selecting either of those two
-- account types in the admin panel will fail with 'Invalid status:
-- trialing' — a real, confirmed regression, not a hypothetical one. This
-- file does NOT invent a mapping for what those two presets should become
-- among the six approved values (e.g. 'active' with a trial_ends_at in the
-- future vs. some other transition) — that is a business-policy decision
-- this corrective order explicitly says not to invent. The blocker is
-- preserved here, explicitly, for the owner: either (a) the six-value list
-- is the actual intended final state and those two AdminLayout.tsx presets
-- need an owner-approved replacement status before this migration is ever
-- executed, or (b) 'trialing' (and/or the other two) should be added back
-- to the approved set, which is also an owner decision, not this file's to
-- make. This migration enforces the six values exactly as instructed and
-- surfaces this consequence rather than hiding it.
DO $$ BEGIN
  ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
  ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN ('active', 'past_due', 'canceled', 'expired', 'pending_payment', 'promo'));
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'subscriptions_status_check NOT applied — one or more existing rows already contain a status value outside the six approved values (e.g. trialing/requires_payment/incomplete). Existing rows are preserved untouched (this file never updates or deletes rows); reconcile those specific rows with the owner before re-running this constraint. See the AdminLayout.tsx consequence noted above for where new rows in that state would keep coming from if left unresolved.';
END $$;

-- ── Atomic admin_set_subscription (supersedes 011's SELECT-then-branch) ─────
-- 011 used an explicit existence check specifically because this engagement
-- had no confirmation of a UNIQUE(user_id) constraint at the time. That
-- constraint is now confirmed by the evidence above (and enforced again,
-- defensively, just above in this file), so this redefinition uses a true
-- atomic INSERT ... ON CONFLICT, removing the SELECT-then-INSERT/UPDATE
-- race entirely.
--
-- trial_ends_at handling: never NULL (live column is NOT NULL). When the
-- caller passes NULL (an account type with no active trial window), this
-- function falls back to `trial_started_at` — i.e. a zero-length trial,
-- meaning "not currently trialing" — rather than inventing a new meaning.
-- This exact pattern (trial_started_at = trial_ends_at = now()) is already
-- the established, existing behavior of the free-tier auto-provisioning
-- path in SubscriptionContext.tsx's loadSubscription(), not a new policy
-- introduced by this migration.
--
-- *** CORRECTED (CORRECTIVE-002 / CORRECTION C) — hard installability bug:
-- a Postgres function's RETURN TYPE cannot be changed by CREATE OR REPLACE
-- FUNCTION. 010_subscriptions_and_admin_rpc.sql and
-- 011_subscriptions_revoke_client_billing_authority.sql both defined
-- `admin_set_subscription(UUID,TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TIMESTAMPTZ)
-- RETURNS void`. This file redefines the SAME name+argument signature with
-- RETURNS subscriptions. Run in the documented sequence (010 then 011 then
-- this file), the CREATE OR REPLACE FUNCTION immediately below would raise
-- `ERROR: cannot change return type of existing function` and abort —
-- taking the rest of this migration file down with it, including
-- provision_free_subscription(), promo_codes, and redeem_promo_code()
-- further down, none of which had executed yet. The explicit DROP FUNCTION
-- below (matching the exact signature 010/011 used) makes this
-- CREATE FUNCTION succeed regardless of which prior version, if any, is
-- live. ***
DROP FUNCTION IF EXISTS public.admin_set_subscription(
  UUID, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE
);
CREATE OR REPLACE FUNCTION public.admin_set_subscription(
  p_user_id UUID,
  p_tier TEXT,
  p_status TEXT,
  p_trial_started_at TIMESTAMP WITH TIME ZONE,
  p_trial_ends_at TIMESTAMP WITH TIME ZONE,
  p_promo_expires_at TIMESTAMP WITH TIME ZONE
) RETURNS subscriptions AS $$
DECLARE
  v_row subscriptions;
  v_trial_started TIMESTAMP WITH TIME ZONE := COALESCE(p_trial_started_at, now());
  v_trial_ends TIMESTAMP WITH TIME ZONE := COALESCE(p_trial_ends_at, v_trial_started);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'Only admins can change subscription/account type';
  END IF;

  IF p_tier NOT IN ('free_tier', 'paid_tier', 'master') THEN
    RAISE EXCEPTION 'Invalid tier: %', p_tier;
  END IF;

  -- *** CORRECTED (CORRECTIVE-002 / CORRECTION C) ***: narrowed from nine
  -- values to exactly the six this corrective order names as approved —
  -- matching the subscriptions_status_check CHECK constraint added above.
  -- See that constraint's comment for the confirmed AdminLayout.tsx
  -- 'trialing'-preset consequence this narrowing causes, flagged there as
  -- an open owner decision rather than resolved here.
  IF p_status NOT IN ('active', 'past_due', 'canceled', 'expired', 'pending_payment', 'promo') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  INSERT INTO subscriptions (user_id, tier, status, trial_started_at, trial_ends_at, promo_expires_at, updated_at)
  VALUES (p_user_id, p_tier, p_status, v_trial_started, v_trial_ends, p_promo_expires_at, now())
  ON CONFLICT (user_id) DO UPDATE SET
    tier              = EXCLUDED.tier,
    status            = EXCLUDED.status,
    trial_started_at  = EXCLUDED.trial_started_at,
    trial_ends_at     = EXCLUDED.trial_ends_at,
    promo_expires_at  = EXCLUDED.promo_expires_at,
    updated_at        = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.admin_set_subscription(UUID, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_subscription(UUID, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) TO authenticated;

-- ── Server-owned free-tier provisioning (C02-003) ──────────────────────────
-- Replaces PricingPage.tsx's direct `.upsert(..., {onConflict:'user_id'})`
-- and SubscriptionContext.tsx's direct `.insert(...)` for a missing row —
-- both became unreachable once 011 removed client INSERT/UPDATE on
-- subscriptions, and both only ever need to grant exactly 'free_tier'/
-- 'active' for the CALLER's own account, never an arbitrary tier.
CREATE OR REPLACE FUNCTION public.provision_free_subscription()
RETURNS subscriptions AS $$
DECLARE
  v_row subscriptions;
  v_now TIMESTAMP WITH TIME ZONE := now();
BEGIN
  SELECT * INTO v_row FROM subscriptions WHERE user_id = auth.uid();

  IF v_row.id IS NOT NULL THEN
    -- Idempotent: never downgrade an existing legitimate paid subscription,
    -- and never re-provision a row that already exists for any tier/status.
    RETURN v_row;
  END IF;

  INSERT INTO subscriptions (user_id, tier, status, trial_started_at, trial_ends_at)
  VALUES (auth.uid(), 'free_tier', 'active', v_now, v_now)
  ON CONFLICT (user_id) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    -- Lost a race against a concurrent call; the other call's row wins and
    -- is returned as-is rather than overwritten.
    SELECT * INTO v_row FROM subscriptions WHERE user_id = auth.uid();
  END IF;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.provision_free_subscription() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_free_subscription() TO authenticated;

COMMENT ON FUNCTION public.provision_free_subscription IS 'C02-003: the only path for a signed-in user to provision their own free-tier row. Always idempotent; never touches an existing row of any tier/status.';

-- ── Promo codes — data-driven, not client-trusted (C02-003) ───────────────
-- src/types/subscription.ts's PROMO_CODES array is currently EMPTY ("Add
-- promo codes here as needed") — i.e. no promo code is currently approved
-- to redeem anything. This table mirrors that same PromoCode shape
-- structurally (code/tier/days/max_uses/expires_at) but is NOT seeded with
-- any row by this migration, preserving that exact "no codes active"
-- reality. It exists so redeem_promo_code() below can look up a code's
-- terms authoritatively server-side instead of trusting client-supplied
-- tier/days parameters (which would otherwise let a caller claim ANY tier
-- for ANY code string). Migrating the TS array's future entries into this
-- table (if/when codes are added) is a follow-up for the owner to
-- coordinate — not decided or performed by this migration.
CREATE TABLE IF NOT EXISTS promo_codes (
  code        TEXT PRIMARY KEY,
  tier        TEXT NOT NULL CHECK (tier IN ('free_tier', 'paid_tier', 'master')),
  days        INTEGER NOT NULL CHECK (days > 0),
  max_uses    INTEGER,              -- NULL = unlimited, matching PromoCode.maxUses
  expires_at  TIMESTAMP WITH TIME ZONE,  -- NULL = no expiry, matching PromoCode.expiresAt
  description TEXT,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;

-- Anyone signed in may read the code catalog (needed to show available
-- promos in the UI, if that's ever added) but never write it directly —
-- only a trusted administrative path should add/remove codes, which this
-- corrective pass does not implement (no codes exist to manage yet).
DO $$ BEGIN
  CREATE POLICY "Authenticated users can read the promo code catalog"
    ON promo_codes FOR SELECT
    USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- *** CORRECTED (CORRECTIVE-002 / CORRECTION C) — missing dependency ***:
-- redeem_promo_code() below reads/writes `promo_redemptions`, but no
-- tracked migration (001-013) ever defines that table — CLAUDE.md lists it
-- as a known live table (same "tracked != live" situation `subscriptions`
-- was in before 010), but on a database where it genuinely does not exist
-- yet (any fresh install), `CREATE FUNCTION` would still succeed (Postgres
-- does not validate a plpgsql function body's table references until the
-- function is actually called), masking the gap until redeem_promo_code()
-- is invoked for the first time and fails with "relation promo_redemptions
-- does not exist." Defined here, defensively, ahead of that function.
CREATE TABLE IF NOT EXISTS promo_redemptions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       TEXT NOT NULL,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  promo_code  TEXT NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE promo_redemptions ADD CONSTRAINT promo_redemptions_email_code_unique UNIQUE (email, promo_code);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE promo_redemptions ENABLE ROW LEVEL SECURITY;
-- No client-facing SELECT/INSERT/UPDATE/DELETE policy is added: the only
-- confirmed-needed write path is redeem_promo_code() (SECURITY DEFINER,
-- bypasses RLS by function privilege, same pattern as every other
-- sensitive write in this project) and there is no confirmed read
-- requirement from any tracked application code (PricingPage.tsx's own
-- reads of this table are commented-out, dead code). RLS enabled with zero
-- policies is fail-closed by default — if a real read/write need surfaces
-- later, add a narrowly-scoped policy then, not a guess now.

-- ── Atomic promo redemption (C02-003) ──────────────────────────────────────
-- Single function = one implicit transaction covering: lookup the code
-- authoritatively (not from client parameters), check expiry, check
-- max_uses against the redemption count, check this email/user hasn't
-- already redeemed it, insert the redemption record, and update the
-- subscription — all or nothing. Replaces SubscriptionContext.tsx's
-- separate insert-then-update (where a denied/zero-row UPDATE could leave
-- the redemption consumed with no entitlement granted, and the client-side
-- rollback DELETE had no permission to succeed against the live
-- promo_redemptions policies in the first place).
CREATE OR REPLACE FUNCTION public.redeem_promo_code(p_code TEXT)
RETURNS subscriptions AS $$
DECLARE
  v_promo promo_codes;
  v_email TEXT;
  v_existing_redemption_count INTEGER;
  v_already_redeemed_by_me INTEGER;
  v_current subscriptions;
  v_row subscriptions;
  v_signup_date TIMESTAMP WITH TIME ZONE;
  v_promo_expiry TIMESTAMP WITH TIME ZONE;
BEGIN
  SELECT * INTO v_promo FROM promo_codes WHERE code = upper(trim(p_code));
  IF v_promo.code IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired promotional code.';
  END IF;

  IF v_promo.expires_at IS NOT NULL AND v_promo.expires_at < now() THEN
    RAISE EXCEPTION 'Invalid or expired promotional code.';
  END IF;

  SELECT email INTO v_email FROM profiles WHERE id = auth.uid();
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Profile not found for current user.';
  END IF;
  v_email := lower(v_email);

  SELECT count(*) INTO v_already_redeemed_by_me
  FROM promo_redemptions WHERE email = v_email AND promo_code = v_promo.code;
  IF v_already_redeemed_by_me > 0 THEN
    RAISE EXCEPTION 'This promotional code has already been used on this email address.';
  END IF;

  IF v_promo.max_uses IS NOT NULL THEN
    SELECT count(*) INTO v_existing_redemption_count
    FROM promo_redemptions WHERE promo_code = v_promo.code;
    IF v_existing_redemption_count >= v_promo.max_uses THEN
      RAISE EXCEPTION 'Invalid or expired promotional code.';
    END IF;
  END IF;

  SELECT * INTO v_current FROM subscriptions WHERE user_id = auth.uid();
  IF v_current.tier = 'master' THEN
    RAISE EXCEPTION 'Master accounts already have full access.';
  END IF;
  IF v_current.status = 'promo' THEN
    RAISE EXCEPTION 'A promotional code is already active on your account.';
  END IF;

  -- Unique (email, promo_code) constraint on promo_redemptions (if present
  -- live) is the final race guard; this function's own prior-count check
  -- above is the primary one. Insert failing on that constraint surfaces as
  -- a visible error to the caller, not a silent no-op.
  INSERT INTO promo_redemptions (email, user_id, promo_code)
  VALUES (v_email, auth.uid(), v_promo.code);

  v_signup_date := COALESCE(v_current.trial_started_at, now());
  v_promo_expiry := v_signup_date + (v_promo.days || ' days')::interval;

  INSERT INTO subscriptions (user_id, tier, status, trial_started_at, trial_ends_at, promo_code, promo_expires_at)
  VALUES (auth.uid(), v_promo.tier, 'promo', v_signup_date, v_promo_expiry, v_promo.code, v_promo_expiry)
  ON CONFLICT (user_id) DO UPDATE SET
    tier              = v_promo.tier,
    status            = 'promo',
    promo_code        = v_promo.code,
    promo_expires_at  = v_promo_expiry,
    updated_at        = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.redeem_promo_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_promo_code(TEXT) TO authenticated;

COMMENT ON FUNCTION public.redeem_promo_code IS 'C02-003: validation, redemption-reservation and subscription transition in one atomic transaction. A thrown exception leaves both promo_redemptions and subscriptions exactly as they were — Postgres rolls back the whole function body on any unhandled error.';

-- ── Staging-only authorization tests (described; NOT executed) ─────────────
-- T1 (positive, atomic admin upsert): call admin_set_subscription twice in a
--   row for a brand-new user_id with identical arguments. Expected: exactly
--   one row exists afterward (ON CONFLICT handles the second call), no
--   unique-violation error surfaced to the caller.
-- T2 (positive, concurrency): fire two admin_set_subscription calls for the
--   same new user_id concurrently (two separate connections). Expected: no
--   unique-violation error from either; exactly one final row.
-- T3 (negative, trial_ends_at never null): call admin_set_subscription with
--   p_trial_ends_at = NULL for a type with no trial (e.g. 'active'/
--   'paid_tier'). Expected: succeeds; trial_ends_at is set to
--   trial_started_at (or now()), never NULL — no NOT NULL violation.
-- T4 (positive, free provisioning idempotency): call
--   provision_free_subscription() twice for the same signed-in user.
--   Expected: identical row both times, no duplicate, no downgrade.
-- T5 (negative, no paid downgrade): a user with tier='paid_tier',
--   status='active' calls provision_free_subscription(). Expected: returns
--   the existing paid row unchanged.
-- T6 (positive, promo happy path): redeem_promo_code() with a code seeded
--   into promo_codes for a user who has never redeemed it. Expected:
--   subscription updates to the code's tier/status='promo'; promo_redemptions
--   gains exactly one row for that email+code.
-- T7 (negative, promo replay): same user calls redeem_promo_code() again
--   with the same code. Expected: RAISE EXCEPTION 'already been used'; no
--   second redemption row; subscription unchanged from after T6.
-- T8 (negative, promo expired/max-uses/invalid): codes with expires_at in
--   the past, max_uses already reached, or a nonexistent code string.
--   Expected: RAISE EXCEPTION 'Invalid or expired'; no row changes.
-- T9 (negative, promo failure leaves no orphan): force a failure after the
--   promo_redemptions insert but before the subscriptions upsert completes
--   (e.g. a disallowed tier value, if one were ever seeded). Expected: the
--   whole function rolls back — no redemption row survives, matching
--   "failure leaves the promo unconsumed."
--
-- CORRECTIVE-002 / CORRECTION C additions:
-- T10 (installability, the actual bug this correction fixes): apply
--   010_subscriptions_and_admin_rpc.sql, then
--   011_subscriptions_revoke_client_billing_authority.sql, then this file,
--   in that exact sequence, against a single fresh database. Expected:
--   all three apply cleanly; specifically, this file's
--   `DROP FUNCTION IF EXISTS admin_set_subscription(...)` immediately
--   before its `CREATE OR REPLACE FUNCTION` must be present, or the
--   CREATE would raise 'cannot change return type of existing function'
--   (011 defined RETURNS void; this file defines RETURNS subscriptions)
--   and abort before provision_free_subscription(), promo_codes, or
--   redeem_promo_code() are ever created.
-- T11 (installability): apply this file twice in a row (idempotency check
--   for the corrected DO blocks). Expected: the second run raises no
--   uncaught `duplicate_table`/`duplicate_object`/`invalid_table_definition`
--   errors from the id-column, primary-key, or unique-constraint DO blocks.
-- T12 (negative, six-status enforcement — the regression this introduces):
--   call `admin_set_subscription(<user>, 'free_tier', 'trialing', now(),
--   now(), null)` (the exact call AdminLayout.tsx's 'trialing'-preset
--   account types make). Expected: `RAISE EXCEPTION 'Invalid status:
--   trialing'` — confirms the flagged AdminLayout.tsx consequence is real,
--   not merely theoretical, and that it is enforced consistently at both
--   the RPC and the table CHECK constraint.
-- T13 (negative, six-status enforcement at the table level): with the
--   service_role key (bypasses RLS, not this CHECK), attempt
--   `insert into subscriptions (user_id, tier, status, trial_started_at,
--   trial_ends_at) values (<user>, 'free_tier', 'trialing', now(), now())`
--   directly. Expected: CHECK constraint violation — the six-value
--   restriction is enforced at the table itself, not only inside
--   admin_set_subscription(), so it cannot be bypassed by any writer that
--   skips the RPC (including a genuine service-role connection).
-- T14 (positive, promo_redemptions dependency — the gap this correction
--   fixes): on a fresh database that has never had promo_redemptions
--   defined by any other process, seed one row into promo_codes and call
--   redeem_promo_code() for a user who has never redeemed it. Expected:
--   succeeds (previously this would fail at call time with "relation
--   promo_redemptions does not exist" on such a database, even though
--   CREATE FUNCTION itself had already silently succeeded earlier).
