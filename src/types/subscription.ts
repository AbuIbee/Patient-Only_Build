// ─── Subscription tier definitions ───────────────────────────────────────────

export type TierName =  'free_tier' | 'paid_tier' | 'master';

export type SubscriptionStatus =
  | 'active'       // paid and current (or master/promo)
  | 'past_due'     // payment failed, grace period
  | 'canceled'     // explicitly canceled
  | 'expired'      // never paid / payment lapsed
  | 'pending_payment' // account created, awaiting Stripe confirmation
  | 'promo';       // active via promotional code

export interface Subscription {
  id: string;
  userId: string;
  tier: TierName;
  status: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  promoCode: string | null;      // promo code that was redeemed
  promoExpiresAt: string | null; // ISO date — when promo free access ends
  canceledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Sprint 1 Tier Scope ────────────────────────────────────────────────────
// Free Tier and Paid Tier are the only customer plans in the active pricing flow.
// Legacy promotional and trial declarations remain below for compatibility only;
// PricingPage_Sprint1.tsx does not use them.

/**
 * Master account detection is DB-driven — managed via the Admin Center.
 * Go to: Admin Center → All Users → click any user → Account Type → Master Account.
 */
export const MASTER_EMAILS: string[] = [];  // managed via Admin Center UI + subscriptions table

export function isMasterEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return MASTER_EMAILS.map(e => e.toLowerCase()).includes(email.toLowerCase());
}

// ─── Temp User (Read-Only Demo Accounts) ─────────────────────────────────────

/**
 * Pattern: temp-user@<domain> OR temp-user<digits>@<domain>
 * Examples: temp-user@tempuser.com, temp-user1@example.com
 * These accounts are always read-only regardless of subscription tier.
 */
export const TEMP_USER_EMAIL_PATTERN = /^temp-user\d*@/i;

export function isTempUser(email: string | null | undefined): boolean {
  if (!email) return false;
  return TEMP_USER_EMAIL_PATTERN.test(email.toLowerCase().trim());
}

export const TEMP_USER_BLOCKED_MSG =
  'This is a read-only demo account. Contact support to get full access.';

// ─── Promo codes ─────────────────────────────────────────────────────────────

export interface PromoCode {
  code: string;
  tier: TierName;
  days: number;
  maxUses: number | null;   // null = unlimited
  expiresAt: string | null; // ISO date, null = no expiry
  description: string;
}

export const PROMO_CODES: PromoCode[] = [
  // Add promo codes here as needed, e.g.:
  // { code: 'WELCOME30', tier: 'free_tier', days: 30, maxUses: null, expiresAt: null, description: '30 days Daily Care free' },
];

export function validatePromoCode(code: string): PromoCode | null {
  const promo = PROMO_CODES.find(p => p.code.toUpperCase() === code.toUpperCase().trim());
  if (!promo) return null;
  if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) return null;
  return promo;
}

// ─── Tier metadata ─────────────────────────────────────────────────────────

export interface TierConfig {
  name: TierName;
  label: string;
  price: number;           // monthly price in dollars
  annualPrice: number | null;
  description: string;
  tagline: string;
  features: TierFeature[];
  stripePriceIdMonthly: string;
  stripePriceIdAnnual: string | null;
}

export interface TierFeature {
  label: string;
  included: boolean;
  highlight?: boolean;    // star feature shown prominently
}

export const TIERS: Record<TierName, TierConfig> = {

  free_tier: {
    name: 'free_tier',
    label: 'Free Tier',
    price: 0,
    annualPrice: null,
    description: '$0.00 / month',
    tagline: 'Essential caregiving support',
    stripePriceIdMonthly: '',
    stripePriceIdAnnual: null,
    /*
     * SPRINT 1 — Original Free Tier feature list retained for review:
     *
     * features: [
     *   { label: 'Daily time & orientation', included: true },
     *   { label: 'Unlimited reminders', included: true, highlight: true },
     *   { label: 'Medication tracker + logs', included: true, highlight: true },
     *   { label: 'Care Partner check-in (A–G)', included: true, highlight: true },
     *   { label: 'Family memory vault (unlimited)', included: true },
     *   { label: 'Family & memory categories', included: true },
     *   { label: '"You are safe" affirmation', included: true },
     *   { label: 'Videos & media upload', included: true },
     *   { label: 'Voice messages from family', included: false },
     *   { label: 'AI comfort voices', included: false },
     *   { label: 'Document vault', included: false },
     * ],
     */
    features: [
      { label: 'Daily time & orientation', included: true },
      { label: 'Unlimited reminders', included: true, highlight: true },
      { label: 'Medication tracker + logs', included: true, highlight: true },
      { label: 'Care Partner check-in (A–G)', included: true, highlight: true },
      { label: 'Family memory vault (unlimited)', included: true, highlight: true },
      { label: 'Family & memory categories', included: true },
      { label: '"You are safe" affirmation', included: true },
      { label: 'Videos & media upload', included: true, highlight: true },
      { label: 'Voice messages from family', included: true, highlight: true },
      { label: 'AI comfort voices', included: true, highlight: true },
      { label: 'Document vault', included: true, highlight: true },
      { label: 'Mood history & trends', included: false },
      { label: 'Games & brain training', included: false },
      { label: 'Medication missed-dose SMS alerts', included: false },
      { label: 'Weekly mood summary email', included: false },
    ],
  },

  paid_tier: {
    name: 'paid_tier',
    label: 'Paid Tier',
    price: 2.99,
    annualPrice: null,
    description: '$2.99 / month',
    tagline: 'Every feature in the application',
    stripePriceIdMonthly: import.meta.env.VITE_STRIPE_PRICE_FULL_SUPPORT_MONTHLY || '',
    stripePriceIdAnnual: null,
    /*
     * SPRINT 1 — Original Paid Tier feature list retained for review:
     *
     * features: [
     *   { label: 'Voice messages from family', included: true, highlight: true },
     *   { label: 'AI comfort voices (all 4)', included: true, highlight: true },
     *   { label: 'Slideshow auto-play', included: true },
     *   { label: 'Document vault (medical records)', included: true, highlight: true },
     *   { label: 'Medication missed SMS alerts', included: true },
     *   { label: 'Weekly mood summary email', included: true },
     *   { label: 'Priority support', included: true },
     * ],
     */
    features: [
      { label: 'Everything in the Free Tier', included: true, highlight: true },
      { label: 'Mood history & trends', included: true, highlight: true },
      { label: 'Games & brain training', included: true, highlight: true },
      { label: 'Medication missed-dose SMS alerts', included: true },
      { label: 'Weekly mood summary email', included: true },
      { label: 'All future application features', included: true },
      { label: 'Complete application access', included: true, highlight: true },
    ],
  },

  // Master tier — internal use only, never shown in pricing UI
  master: {
    name: 'master',
    label: 'Master',
    price: 0,
    annualPrice: null,
    description: 'Internal master account',
    tagline: 'Full access — no payment required',
    stripePriceIdMonthly: '',
    stripePriceIdAnnual: null,
    features: [],  // inherits all features via hasFeatureAccess override
  },
};

// ─── Feature access checks ─────────────────────────────────────────────────
// Single source of truth — check this before rendering any gated component.

export type FeatureKey =
  | 'reminders_unlimited'
  | 'medications'
  | 'care_partner_checkin'
  | 'memories_unlimited'
  | 'mood_history'
  | 'games'
  | 'media'
  | 'voice_messages'
  | 'ai_voices'
  | 'documents'
  | 'sms_alerts'
  | 'mood_email';

/*
 * SPRINT 1 — Original entitlement map retained for review:
 *
 * const FEATURE_ACCESS: Record<FeatureKey, TierName[]> = {
 *   reminders_unlimited:  ['free_tier', 'paid_tier', 'master'],
 *   medications:          ['free_tier', 'paid_tier', 'master'],
 *   care_partner_checkin: ['free_tier', 'paid_tier', 'master'],
 *   memories_unlimited:   ['paid_tier', 'master'],
 *   mood_history:         ['paid_tier', 'master'],
 *   games:                ['paid_tier', 'master'],
 *   media:                ['paid_tier', 'master'],
 *   voice_messages:       ['paid_tier', 'master'],
 *   ai_voices:            ['paid_tier', 'master'],
 *   documents:            ['paid_tier', 'master'],
 *   sms_alerts:           ['paid_tier', 'master'],
 *   mood_email:           ['paid_tier', 'master'],
 * };
 */

/*
 * SPRINT 1 ACTIVE ENTITLEMENT MAP
 *
 * Free Tier has only the approved caregiving features below.
 * Paid Tier and Master have all FeatureKey values.
 */
const FEATURE_ACCESS: Record<FeatureKey, TierName[]> = {
  reminders_unlimited:  ['free_tier', 'paid_tier', 'master'],
  medications:          ['free_tier', 'paid_tier', 'master'],
  care_partner_checkin: ['free_tier', 'paid_tier', 'master'],
  memories_unlimited:   ['free_tier', 'paid_tier', 'master'],
  media:                ['free_tier', 'paid_tier', 'master'],
  voice_messages:       ['free_tier', 'paid_tier', 'master'],
  ai_voices:            ['free_tier', 'paid_tier', 'master'],
  documents:            ['free_tier', 'paid_tier', 'master'],
  mood_history:         ['paid_tier', 'master'],
  games:                ['paid_tier', 'master'],
  sms_alerts:           ['paid_tier', 'master'],
  mood_email:           ['paid_tier', 'master'],
};

/** Returns true if the given tier has access to the feature. */
export function hasFeatureAccess(tier: TierName, feature: FeatureKey): boolean {
  if (tier === 'master') return true;  // master bypasses all gates
  return FEATURE_ACCESS[feature].includes(tier);
}

/** Returns true if the subscription is currently active. */
export function isSubscriptionActive(sub: Subscription | null): boolean {
  if (!sub) return false;
  if (sub.tier === 'master') return true;
  if (sub.status === 'promo') {
    if (!sub.promoExpiresAt) return true;
    return new Date(sub.promoExpiresAt) > new Date();
  }
  return sub.status === 'active';
}

/** Returns true if the subscription requires payment to proceed. */
export function needsPayment(sub: Subscription | null): boolean {
  if (!sub) return true;
  if (sub.tier === 'master') return false;
  if (sub.status === 'promo') {
    if (!sub.promoExpiresAt) return false;
    return new Date(sub.promoExpiresAt) <= new Date();
  }
  return sub.status === 'expired' || sub.status === 'canceled' || sub.status === 'pending_payment';
}

/** Returns true if the subscription is past due (payment failed, grace period). */
export function isPastDue(sub: Subscription | null): boolean {
  if (!sub) return false;
  return sub.status === 'past_due';
}
// ─── Backward-compatibility stubs ────────────────────────────────────────────
// These are kept so existing files (App.tsx, SubscriptionContext.tsx,
// LoginPage.tsx, ProtectedRoute.tsx, TrialBanner.tsx) continue to compile
// without changes. No free trial logic runs — they safely return zero/false.

/** @deprecated No free trial. Kept for import compatibility only. */
export const FREE_TRIAL_DAYS = 0;

/** @deprecated No free trial. Kept for import compatibility only. */
export const PROMO_TOTAL_DAYS = 0;

/** @deprecated Always returns 0 — no trial period. */
export function trialDaysRemaining(_sub: Subscription | null): number {
  return 0;
}

/** @deprecated Always returns false — no refund window. */
export function isWithinRefundWindow(_sub: Subscription | null): boolean {
  return false;
}

/** @deprecated Always returns false — no trial to expire. */
export function isTrialExpired(sub: Subscription | null): boolean {
  if (!sub) return false;
  if (sub.tier === 'master') return false;
  if (sub.status === 'promo') {
    if (!sub.promoExpiresAt) return false;
    return new Date(sub.promoExpiresAt) <= new Date();
  }
  return sub.status === 'expired' || sub.status === 'canceled' || sub.status === 'pending_payment';
}
