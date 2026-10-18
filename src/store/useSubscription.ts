import { createContext, useContext } from 'react';
import type { Subscription, TierName, FeatureKey, PromoCode } from '@/types/subscription';

// RELEASE-BLOCKER-CLOSURE PHASE 2: the context object and this hook live
// here (not in SubscriptionContext.tsx), because that file also exports the
// SubscriptionProvider component — Vite Fast Refresh (react-refresh/only-
// export-components) requires a component-exporting file to export
// components only.
export interface SubscriptionContextType {
  subscription: Subscription | null;
  tier: TierName;
  isLoading: boolean;
  isActive: boolean;
  isMaster: boolean;
  trialDays: number;
  canRefund: boolean;
  isExpired: boolean;
  // REPAIR 007: null = no program, or not yet confirmed by the trusted
  // server check; true/false = the ACTUAL, server-computed (now()-based)
  // eligibility of a Temporary/Companion program. Never derived from a
  // client Date() comparison.
  programActive: boolean | null;
  // OWNER-PRICING-BUSINESS-REGISTRATION-REPAIR Phase B: same null/true/
  // false contract as programActive, but for the 14-day residential
  // trial — trusted is_my_trial_active()-sourced, never a client Date().
  trialActive: boolean | null;
  // REPAIR 008: the trusted, non-email-derived signal for the Temporary
  // demo experience and for Companion's active (non-expired) state — see
  // the derivation comment above `isTempUserDemo` in the Provider below.
  isTempUserDemo: boolean;
  isCompanionActive: boolean;
  can: (feature: FeatureKey) => boolean;
  refresh: () => Promise<void>;
  redeemPromoCode: (code: string) => Promise<{ success: boolean; message: string; promo?: PromoCode }>;
}

export const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be used inside SubscriptionProvider');
  return ctx;
}
