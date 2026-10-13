-- 010_subscriptions_and_admin_rpc.sql
-- F10 (Admin account types).
--
-- PROPOSAL ONLY — NOT EXECUTED. See header note in 002_identity_and_role_contract.sql.
--
-- `subscriptions` is referenced throughout the app (App.tsx session restore,
-- SubscriptionContext, AdminLayout) but does not exist in this repo's
-- tracked migrations (cross-cutting finding, _audit_group_B.md). This
-- proposes it with trial_ends_at NULLABLE — the pre-remediation
-- AdminLayout.saveAccountType sent a fixed far-future "never" date only for
-- tier='master' specifically to work around what looks like a NOT NULL
-- constraint on this column live; the other account types (canceled,
-- companion) send null for trial_ends_at and would hit that same
-- constraint if it exists. Nullable removes the need for either workaround.

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id           UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  tier              TEXT NOT NULL CHECK (tier IN ('free_tier', 'paid_tier', 'master')),
  status            TEXT NOT NULL CHECK (status IN (
                       'trialing', 'promo', 'active', 'canceled', 'expired',
                       'pending_payment', 'requires_payment', 'past_due', 'incomplete'
                     )),
  stripe_subscription_id TEXT,
  trial_started_at  TIMESTAMP WITH TIME ZONE,
  trial_ends_at     TIMESTAMP WITH TIME ZONE,
  promo_expires_at  TIMESTAMP WITH TIME ZONE,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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
