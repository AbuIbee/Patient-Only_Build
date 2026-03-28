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
  hasFeatureAccess,
  isSubscriptionActive,
  trialDaysRemaining,
  isWithinRefundWindow,
} from '@/types/subscription';

// ─── Context shape ────────────────────────────────────────────────────────────

interface SubscriptionContextType {
  subscription: Subscription | null;
  tier: TierName;
  isLoading: boolean;
  isActive: boolean;
  trialDays: number;
  canRefund: boolean;
  can: (feature: FeatureKey) => boolean;
  refresh: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSubscription = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setSubscription(null);
        return;
      }

      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('[Subscription] Load error:', error.message);
        return;
      }

      if (!data) {
        // New user — create a free Companion trial row automatically
        const trialStart = new Date();
        const trialEnd = new Date(trialStart.getTime() + 7 * 24 * 60 * 60 * 1000);

        const { data: created, error: createErr } = await supabase
          .from('subscriptions')
          .insert({
            user_id:          user.id,
            tier:             'companion',
            status:           'trialing',
            trial_started_at: trialStart.toISOString(),
            trial_ends_at:    trialEnd.toISOString(),
          })
          .select()
          .single();

        if (createErr) {
          console.error('[Subscription] Create error:', createErr.message);
        } else {
          setSubscription(mapRow(created));
        }
        return;
      }

      setSubscription(mapRow(data));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSubscription();

    // Re-check when Stripe webhook updates the row via realtime
    const channel = supabase
      .channel('subscription_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subscriptions' },
        () => loadSubscription()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadSubscription]);

  const tier: TierName = subscription?.tier ?? 'companion';
  const isActive = isSubscriptionActive(subscription);
  const trialDays = trialDaysRemaining(subscription);
  const canRefund = isWithinRefundWindow(subscription);

  // A feature is accessible when the subscription is active OR trialing
  // (the trial gives full access to whatever tier they signed up for)
  const can = useCallback(
    (feature: FeatureKey) => {
      if (!isActive) return false;
      return hasFeatureAccess(tier, feature);
    },
    [tier, isActive]
  );

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        tier,
        isLoading,
        isActive,
        trialDays,
        canRefund,
        can,
        refresh: loadSubscription,
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
    canceledAt:            (row.canceled_at as string) ?? null,
    createdAt:             row.created_at as string,
    updatedAt:             row.updated_at as string,
  };
}
