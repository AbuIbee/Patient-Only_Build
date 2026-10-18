import {
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';
import {
  type Subscription,
  type TierName,
  type FeatureKey,
  type PromoCode,
  hasFeatureAccess,
  isSubscriptionActive,
  trialDaysRemaining,
  isWithinRefundWindow,
  isTrialExpired,
  isMasterEmail,
} from '@/types/subscription';
import { SubscriptionContext } from './useSubscription';

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [userEmail, setUserEmail]       = useState<string | null>(null);
  const [isLoading, setIsLoading]       = useState(true);
  // REPAIR 007: starts null (not yet confirmed) and fails closed — see
  // isSubscriptionActive()'s own doc comment for why an unconfirmed program
  // must never be treated as active.
  const [programActive, setProgramActive] = useState<boolean | null>(null);
  // OWNER-PRICING-BUSINESS-REGISTRATION-REPAIR Phase B: same fail-closed
  // pattern for the 14-day residential trial.
  const [trialActive, setTrialActive] = useState<boolean | null>(null);
  // ENTERPRISE CONSOLIDATED DELIVERY: "every patient actively covered by
  // an authorized Enterprise organization receives Full Support
  // automatically." Independent of — and never written into —
  // `subscription`/the `subscriptions` table at all, so a patient's
  // preexisting personal subscription row is never touched by coverage
  // starting, ending, or an organization being removed. Starts false
  // (not null) because, unlike program/trial, coverage is checked for
  // EVERY signed-in user regardless of their subscription's own status —
  // false is the correct default for someone who was never covered, not
  // an "unconfirmed, fails closed" state.
  const [isEnterpriseCovered, setIsEnterpriseCovered] = useState(false);

  const loadSubscription = useCallback(async (): Promise<string | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setSubscription(null); return null; }

      setUserEmail(user.email ?? null);

      // ENTERPRISE CONSOLIDATED DELIVERY: checked for EVERY signed-in
      // user, independent of tier/plan/status and of whichever branch
      // below runs — coverage is a separate, parallel entitlement source,
      // never conflated with (or written into) the personal subscription
      // row. Master is checked too (harmless — masterFlag already
      // overrides everything downstream regardless of this value).
      const { data: covered, error: coverageError } = await supabase.rpc('is_my_enterprise_coverage_active');
      if (coverageError) {
        console.error('[Subscription] Enterprise coverage check error:', coverageError.message);
        setIsEnterpriseCovered(false); // fail closed
      } else {
        setIsEnterpriseCovered(covered === true);
      }

      // ── Master account: skip DB entirely, synthesise a master subscription ──
      if (isMasterEmail(user.email)) {
        setProgramActive(null);
        setTrialActive(null);
        setSubscription({
          id: `master-${user.id}`,
          userId: user.id,
          tier: 'master',
          plan: null, // REPAIR 006: plan only has meaning for tier='paid_tier'
          program: null, // REPAIR 007: master is never a Temporary/Companion program
          status: 'active',
          trialStartedAt: user.created_at ?? new Date().toISOString(),
          trialEndsAt: '2099-12-31T00:00:00Z',
          currentPeriodStart: null,
          currentPeriodEnd: null,
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          promoCode: null,
          promoExpiresAt: null,
          canceledAt: null,
          createdAt: user.created_at ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        return user.id;
      }

      // ── Regular user: load from DB ────────────────────────────────────────
      const { data, error } = await supabase
        .from('subscriptions')
        // REPAIR 006: `plan` — server-authoritative paid-plan identity.
        // REPAIR 007: `program` — server-authoritative Temporary/Companion
        // identity (see supabase/migrations/017_.../018_... .sql). Both
        // read back exactly as stored; never inferred client-side.
        .select('id, user_id, tier, plan, program, status, trial_started_at, trial_ends_at, current_period_start, current_period_end, stripe_customer_id, stripe_subscription_id, promo_code, promo_expires_at, canceled_at, created_at, updated_at')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('[Subscription] Load error:', error.message);
        return null;
      }

      if (!data) {
        // C02-003: a direct client .insert() here is unreachable once
        // 011/013 remove client INSERT/UPDATE on subscriptions — and would
        // have let any caller insert an arbitrary tier anyway. The RPC only
        // ever grants the caller's OWN row exactly 'free_tier'/'active',
        // idempotently, and never touches an existing row of any tier.
        const { data: created, error: createErr } = await supabase.rpc('provision_free_subscription');

        if (createErr) {
          console.error('[Subscription] Free-tier provisioning error:', createErr.message);
        } else if (created) {
          setProgramActive(null); // freshly-provisioned row is never a program
          // A freshly-issued trial is trivially active (now() is always <=
          // a trial_ends_at that was just set 14 days out) — no extra RPC
          // round-trip needed to know that for THIS SAME provisioning
          // call's own result.
          setTrialActive(created.status === 'trial' ? true : null);
          setSubscription(mapRow(created));
        }
        return user.id;
      }

      const mapped = mapRow(data);
      setSubscription(mapped);

      // REPAIR 007: for a program-classified row, fetch the TRUSTED,
      // server-`now()`-computed eligibility — never a client Date()
      // comparison against trialEndsAt (see isSubscriptionActive()'s doc
      // comment). Non-program rows never call this at all.
      if (mapped.program) {
        const { data: active, error: programError } = await supabase.rpc('is_my_program_active');
        if (programError) {
          console.error('[Subscription] Program eligibility check error:', programError.message);
          setProgramActive(false); // fail closed — never optimistic on an error
        } else {
          setProgramActive(active === true);
        }
      } else {
        setProgramActive(null);
      }

      // OWNER-PRICING-BUSINESS-REGISTRATION-REPAIR Phase B: same pattern,
      // for the 14-day residential trial — is_my_trial_active() is the
      // ONLY trusted signal; never a client Date() comparison.
      if (mapped.status === 'trial') {
        const { data: trialActive, error: trialError } = await supabase.rpc('is_my_trial_active');
        if (trialError) {
          console.error('[Subscription] Trial eligibility check error:', trialError.message);
          setTrialActive(false); // fail closed
        } else {
          setTrialActive(trialActive === true);
        }
      } else {
        setTrialActive(null);
      }

      return user.id;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let mounted = true;

    const init = async () => {
      const userId = await loadSubscription();
      if (!mounted || !userId) return;
      channel = supabase
        .channel(`subscription_changes_${userId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'subscriptions',
          filter: `user_id=eq.${userId}`,
        }, () => loadSubscription())
        .subscribe();
    };

    init();

    return () => {
      mounted = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [loadSubscription]);

  // ── Promo code redemption ────────────────────────────────────────────────

  // C02-003: validation, redemption-reservation and the subscription
  // transition now happen in one atomic server transaction
  // (redeem_promo_code(), 013_subscriptions_atomic_lifecycle.sql). The
  // previous client-side version inserted the redemption, THEN updated the
  // subscription as a separate, unchecked-for-affected-rows call — after
  // 011 removes client UPDATE on subscriptions, that update would silently
  // affect zero rows with no error, consuming the code with no entitlement
  // granted. The client-side rollback .delete() also had no permission to
  // succeed against the live promo_redemptions policies even before that.
  const redeemPromoCode = useCallback(async (code: string): Promise<{ success: boolean; message: string; promo?: PromoCode }> => {
    try {
      const { data, error } = await supabase.rpc('redeem_promo_code', { p_code: code });

      if (error) {
        return { success: false, message: error.message || 'Could not apply code. Please try again.' };
      }
      if (!data) {
        // The frontend must verify returned state before declaring success
        // — an RPC that reports no error but also returns no row is not
        // evidence of a successful redemption.
        return { success: false, message: 'Could not confirm the code was applied. Please try again.' };
      }

      await loadSubscription();
      const expiry = data.promo_expires_at ? new Date(data.promo_expires_at) : null;
      return {
        success: true,
        message: expiry
          ? `Code applied! Free access until ${expiry.toLocaleDateString()}.`
          : 'Code applied!',
      };
    } catch {
      return { success: false, message: 'Unexpected error. Please try again.' };
    }
  }, [loadSubscription]);

  // ── Derived values ───────────────────────────────────────────────────────

  // isMaster is true if EITHER the email matches OR the subscription tier is master.
  // Checking both covers the case where userEmail hasn't been set yet but the
  // subscription object already reflects the master tier from a previous load.
  const masterFlag = isMasterEmail(userEmail) || subscription?.tier === 'master';

  // ENTERPRISE CONSOLIDATED DELIVERY — item 2/3: a covered patient's
  // EFFECTIVE tier/plan is paid_tier/full_support regardless of their
  // personal subscription row's own tier/plan/status, and regardless of
  // master (master already implies everything coverage would, so no
  // precedence conflict either way). The underlying `subscription` object
  // itself — and its tier/plan/status — is NEVER mutated by this; a
  // covered patient's preexisting personal subscription (if any) is
  // preserved exactly as stored, ready to resume the moment coverage
  // ends (item: "handle organization removal, license expiration and
  // coverage transitions without deleting data or silently billing the
  // patient").
  const tier: TierName = masterFlag ? 'master' : isEnterpriseCovered ? 'paid_tier' : (subscription?.tier ?? 'free_tier');
  const effectivePlan = masterFlag ? null : isEnterpriseCovered ? 'full_support' : (subscription?.plan ?? null);

  // For master accounts isActive must be true regardless of subscription state.
  // REPAIR 007 / Phase B: programActive and trialActive (both trusted,
  // server-computed) are threaded through so an expired Temporary/
  // Companion grant OR an expired residential trial loses access via this
  // SAME single isActive value every gate in the app already reads.
  // Enterprise coverage is its own trusted, server-computed signal
  // (is_my_enterprise_coverage_active(), checked above) — true here
  // bypasses the personal-subscription check entirely while covered.
  const isActive  = masterFlag ? true : isEnterpriseCovered ? true : isSubscriptionActive(subscription, programActive, trialActive);
  const trialDays = trialDaysRemaining(subscription);
  const canRefund = isWithinRefundWindow(subscription);
  const isExpired = masterFlag ? false : isTrialExpired(subscription);

  // REPAIR 008 / REPAIR A/C: the ONE trusted signal the Temporary demo
  // experience is allowed to branch on. Never derived from an email
  // pattern — only from the server-authoritative `program` column plus
  // the server-`now()`-computed `programActive` (is_my_program_active()).
  // `!masterFlag` is defensive (a master row's program is always null per
  // migration 018's CHECK, but this keeps the two flags mutually
  // exclusive by construction even if that invariant were ever violated).
  const isTempUserDemo    = !masterFlag && subscription?.program === 'temp_user' && programActive === true;
  const isCompanionActive = !masterFlag && subscription?.program === 'companion' && programActive === true;

  const can = useCallback(
    (feature: FeatureKey): boolean => {
      // Always grant if master — check both the flag AND the subscription tier
      // directly so there is no timing window where access is incorrectly denied
      if (masterFlag) return true;
      if (subscription?.tier === 'master') return true;
      if (!isActive) return false;
      // REPAIR 006 / ENTERPRISE CONSOLIDATED DELIVERY: effectivePlan is
      // 'full_support' while covered (regardless of the stored personal
      // plan), otherwise the stored plan exactly as before.
      return hasFeatureAccess(tier, feature, effectivePlan);
    },
    [tier, isActive, masterFlag, subscription?.tier, effectivePlan]
  );

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        tier,
        plan: effectivePlan,
        isEnterpriseCovered,
        isLoading,
        isActive,
        isMaster: masterFlag,
        trialDays,
        canRefund,
        isExpired,
        programActive,
        trialActive,
        isTempUserDemo,
        isCompanionActive,
        can,
        refresh: async () => { await loadSubscription(); },
        redeemPromoCode,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

// RELEASE-BLOCKER-CLOSURE PHASE 2: the SubscriptionContext object and
// useSubscription() hook live in ./useSubscription.ts, not here — a file
// exporting both a component (SubscriptionProvider) and a non-component
// value breaks Vite Fast Refresh (react-refresh/only-export-components).
// Every import site was updated instead.

// ─── Helper: snake_case DB row → camelCase TS object ────────────────────────

function mapRow(row: Record<string, unknown>): Subscription {
  return {
    id:                    row.id as string,
    userId:                row.user_id as string,
    tier:                  row.tier as TierName,
    plan:                  (row.plan as Subscription['plan']) ?? null,
    program:               (row.program as Subscription['program']) ?? null,
    status:                row.status as Subscription['status'],
    trialStartedAt:        row.trial_started_at as string,
    trialEndsAt:           row.trial_ends_at as string,
    currentPeriodStart:    (row.current_period_start as string) ?? null,
    currentPeriodEnd:      (row.current_period_end as string) ?? null,
    stripeCustomerId:      (row.stripe_customer_id as string) ?? null,
    stripeSubscriptionId:  (row.stripe_subscription_id as string) ?? null,
    promoCode:             (row.promo_code as string) ?? null,
    promoExpiresAt:        (row.promo_expires_at as string) ?? null,
    canceledAt:            (row.canceled_at as string) ?? null,
    createdAt:             row.created_at as string,
    updatedAt:             row.updated_at as string,
  };
}
