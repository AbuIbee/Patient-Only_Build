import {
  createContext,
  useContext,
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
  FREE_TRIAL_DAYS,
  PROMO_TOTAL_DAYS,
} from '@/types/subscription';

// ─── Context shape ────────────────────────────────────────────────────────────

interface SubscriptionContextType {
  subscription: Subscription | null;
  tier: TierName;
  isLoading: boolean;
  isActive: boolean;
  isMaster: boolean;
  trialDays: number;
  canRefund: boolean;
  isExpired: boolean;
  can: (feature: FeatureKey) => boolean;
  refresh: () => Promise<void>;
  redeemPromoCode: (code: string) => Promise<{ success: boolean; message: string; promo?: PromoCode }>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [userEmail, setUserEmail]       = useState<string | null>(null);
  const [isLoading, setIsLoading]       = useState(true);

  const loadSubscription = useCallback(async (): Promise<string | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setSubscription(null); return null; }

      setUserEmail(user.email ?? null);

      // ── Master account: skip DB entirely, synthesise a master subscription ──
      if (isMasterEmail(user.email)) {
        setSubscription({
          id: `master-${user.id}`,
          userId: user.id,
          tier: 'master',
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
        .select('id, user_id, tier, status, trial_started_at, trial_ends_at, current_period_start, current_period_end, stripe_customer_id, stripe_subscription_id, promo_code, promo_expires_at, canceled_at, created_at, updated_at')
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
          setSubscription(mapRow(created));
        }
        return user.id;
      }

      setSubscription(mapRow(data));
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

  const tier: TierName = subscription?.tier ?? 'free_tier';

  // For master accounts isActive must be true regardless of subscription state
  const isActive  = masterFlag ? true : isSubscriptionActive(subscription);
  const trialDays = trialDaysRemaining(subscription);
  const canRefund = isWithinRefundWindow(subscription);
  const isExpired = masterFlag ? false : isTrialExpired(subscription);

  const can = useCallback(
    (feature: FeatureKey): boolean => {
      // Always grant if master — check both the flag AND the subscription tier
      // directly so there is no timing window where access is incorrectly denied
      if (masterFlag) return true;
      if (subscription?.tier === 'master') return true;
      if (!isActive) return false;
      return hasFeatureAccess(tier, feature);
    },
    [tier, isActive, masterFlag, subscription?.tier]
  );

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        tier,
        isLoading,
        isActive,
        isMaster: masterFlag,
        trialDays,
        canRefund,
        isExpired,
        can,
        refresh: loadSubscription,
        redeemPromoCode,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be used inside SubscriptionProvider');
  return ctx;
}

// ─── Helper: snake_case DB row → camelCase TS object ────────────────────────

function mapRow(row: Record<string, unknown>): Subscription {
  return {
    id:                    row.id as string,
    userId:                row.user_id as string,
    tier:                  row.tier as TierName,
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
