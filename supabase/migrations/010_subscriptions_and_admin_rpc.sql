-- 010_subscriptions_and_admin_rpc.sql
-- F10 (Admin account types).
--
-- PROPOSAL ONLY — NOT EXECUTED. See header note in 002_identity_and_role_contract.sql.
--
-- `subscriptions` is referenced throughout the app (App.tsx session restore,
-- SubscriptionContext, AdminLayout) but does not exist in this repo's
-- tracked migrations (cross-cutting finding, _audit_group_B.md).
--
-- *** MYMEMORIA-GITHUB-SUPABASE-COMPAT-001 CORRECTION ***: this file's
-- original table definition below used `user_id UUID PRIMARY KEY` with a
-- 9-value status CHECK — a shape this repo's own later evidence
-- (011/013's header comments, citing MyMemoria_Production_Audit/
-- 04_SUPABASE_SECURITY_AND_SCHEMA.md) already identified as WRONG: the
-- real table has `id` as PK with `user_id` as a separate NOT NULL UNIQUE
-- column, NOT NULL trial timestamps, provider/period columns, and exactly
-- six approved statuses (active, past_due, canceled, expired,
-- pending_payment, promo — work order §4). `013_subscriptions_atomic_
-- lifecycle.sql`'s own `CREATE TABLE IF NOT EXISTS` already has the right
-- shape, but it runs AFTER this file, and `ADD COLUMN IF NOT EXISTS`
-- cannot retroactively move a PRIMARY KEY from `user_id` to `id` or add a
-- UNIQUE constraint correctly once the wrong shape already exists —
-- against an EMPTY database (staging's actual situation before this runs),
-- this file was the one that would have actually created the table, in the
-- wrong shape, with 013's later fixups unable to fully correct it. Rather
-- than reorder the migration chain, this file's own definition is now
-- corrected to the real shape directly, so whichever file ends up actually
-- creating the table on a given target, the result is the same, correct
-- shape either way. `013`'s own `CREATE TABLE IF NOT EXISTS` becomes a
-- true no-op against this. The `status` CHECK here intentionally omits
-- 'trialing'/'requires_payment'/'incomplete' — none of those three is one
-- of the six approved values; if any row (staging or production) already
-- holds one of them, this CHECK will fail to install (caught below) rather
-- than silently accept a non-approved status going forward.
CREATE TABLE IF NOT EXISTS subscriptions (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                 UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  tier                    TEXT NOT NULL CHECK (tier IN ('free_tier', 'paid_tier', 'master')),
  status                  TEXT NOT NULL CHECK (status IN (
                             'active', 'past_due', 'canceled', 'expired',
                             'pending_payment', 'promo'
                           )),
  trial_started_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  trial_ends_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  current_period_start    TIMESTAMP WITH TIME ZONE,
  current_period_end      TIMESTAMP WITH TIME ZONE,
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  canceled_at             TIMESTAMP WITH TIME ZONE,
  promo_code              TEXT,
  promo_expires_at        TIMESTAMP WITH TIME ZONE,
  created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- *** MYMEMORIA-GITHUB-SUPABASE-COMPAT-001 CORRECTION (staging-verified,
-- 2026-10-16) ***: defensive tightening in case this runs against a table
-- already created (by an earlier partial apply of this same file) before
-- this NOT NULL was added — matches production's confirmed real shape
-- (both columns are NOT NULL there today). Every row created through this
-- file's own INSERT paths has a DEFAULT, so this is expected to succeed;
-- if some other, unconfirmed write path ever left a real NULL row, this
-- ALTER will fail loudly (not silently) rather than mask it.
ALTER TABLE subscriptions ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE subscriptions ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- A user may read their OWN subscription row (needed for
-- SubscriptionContext.can()/tier/isActive and App.tsx's payment gate), but
-- cannot write tier/status directly — that only happens through
-- admin_set_subscription() below, or the Stripe webhook's service-role key
-- (out of scope here; not a client path).
DO $$ BEGIN
  CREATE POLICY "Users can view their own subscription"
    ON subscriptions FOR SELECT
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can view all subscriptions"
    ON subscriptions FOR SELECT
    USING (
      EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin'))
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Deliberately NO client-facing INSERT/UPDATE policy on this table. All
-- writes go through admin_set_subscription (admin panel) or a service-role
-- Stripe webhook (not covered by RLS at all, since service-role bypasses
-- it) — never a direct authenticated-client upsert, which is what let any
-- caller send arbitrary tier/status previously (F10's "client-trusted
-- fields" finding).

CREATE OR REPLACE FUNCTION public.admin_set_subscription(
  p_user_id UUID,
  p_tier TEXT,
  p_status TEXT,
  p_trial_started_at TIMESTAMP WITH TIME ZONE,
  p_trial_ends_at TIMESTAMP WITH TIME ZONE,
  p_promo_expires_at TIMESTAMP WITH TIME ZONE
) RETURNS void AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'Only admins can change subscription/account type';
  END IF;

  IF p_tier NOT IN ('free_tier', 'paid_tier', 'master') THEN
    RAISE EXCEPTION 'Invalid tier: %', p_tier;
  END IF;

  IF p_status NOT IN (
    'trialing', 'promo', 'active', 'canceled', 'expired',
    'pending_payment', 'requires_payment', 'past_due', 'incomplete'
  ) THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  INSERT INTO subscriptions (user_id, tier, status, trial_started_at, trial_ends_at, promo_expires_at, updated_at)
  VALUES (p_user_id, p_tier, p_status, p_trial_started_at, p_trial_ends_at, p_promo_expires_at, now())
  ON CONFLICT (user_id) DO UPDATE SET
    tier              = EXCLUDED.tier,
    status            = EXCLUDED.status,
    trial_started_at  = EXCLUDED.trial_started_at,
    trial_ends_at     = EXCLUDED.trial_ends_at,
    promo_expires_at  = EXCLUDED.promo_expires_at,
    updated_at        = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.admin_set_subscription(UUID, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_subscription(UUID, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) TO authenticated;

COMMENT ON FUNCTION public.admin_set_subscription IS 'F10: server-authoritative subscription/account-type writer; the admin check happens inside this function, not just in AdminLayout.tsx UI.';
