// ─── Subscription tier definitions ───────────────────────────────────────────

export type TierName = 'companion' | 'daily_care' | 'full_support' | 'master';

export type SubscriptionStatus =
  | 'trialing'     // within the free trial window
  | 'active'       // paid and current (or master/promo)
  | 'past_due'     // payment failed, grace period
  | 'canceled'     // explicitly canceled
  | 'expired'      // trial ended, never paid
  | 'promo';       // active via promotional code

export interface Subscription {
  id: string;
  userId: string;
  tier: TierName;
  status: SubscriptionStatus;
  trialStartedAt: string;        // ISO date — when they first signed up
  trialEndsAt: string;           // ISO date — trialStartedAt + FREE_TRIAL_DAYS
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

// ─── Free trial duration ─────────────────────────────────────────────────────

/** Days of free access for the Companion (free) tier before requiring upgrade */
export const FREE_TRIAL_DAYS = 30;

/** Days of free access granted by a promotional code */
export const PROMO_TOTAL_DAYS = 45;

/**
 * Master account detection is now DB-driven — managed via the Admin Center.
 * Go to: Admin Center → All Users → click any user → Account Type → Master Account.
 * No code changes needed. This array is kept empty intentionally.
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

/**
 * Active promotional codes.
 * Each code grants PROMO_TOTAL_DAYS (~2 months) of free Companion access,
 * which counts toward — not in addition to — the 45-day free tier.
 *
 * tier: which tier the promo unlocks ('companion' = free basics extended,
 *       'daily_care' = mid-tier free for promo window)
 */
export interface PromoCode {
  code: string;
  tier: TierName;
  days: number;
  maxUses: number | null;   // null = unlimited
  expiresAt: string | null; // ISO date, null = no expiry
  description: string;
}

export const PROMO_CODES: PromoCode[] = [
  {
    code: 'WELCOME2MO',
    tier: 'companion',
    days: PROMO_TOTAL_DAYS,
    maxUses: null,
    expiresAt: null,
    description: '2 months free (includes 45-day free tier)',
  },
  // Add more codes here as needed, e.g.:
  // { code: 'CAREGIVER50', tier: 'daily_care', days: 61, maxUses: 100, expiresAt: null, description: '2 months Daily Care free' },
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
  companion: {
    name: 'companion',
    label: 'Companion',
    price: 0,
    annualPrice: null,
    description: 'Free for 30 days',
    tagline: 'Card required — not charged for 30 days. Cancel anytime.',
    stripePriceIdMonthly: import.meta.env.VITE_STRIPE_PRICE_COMPANION_FREE_TRIAL || '',
    stripePriceIdAnnual: null,
    features: [
      { label: 'Daily time & orientation', included: true },
      { label: '"You are safe" affirmation', included: true },
      { label: 'Tap-to-hear chime', included: true },
      { label: 'Mood check-in (today only)', included: true },
      { label: '3 daily reminders', included: true },
      { label: '1 family photo', included: true },
      { label: 'Medication tracking', included: false },
      { label: 'Family memory vault', included: false },
      { label: 'Care Partner check-in', included: false },
      { label: 'Games & brain training', included: false },
      { label: 'Videos & media', included: false },
      { label: 'Voice messages from family', included: false },
    ],
  },

  daily_care: {
    name: 'daily_care',
    label: 'Daily Care',
    price: 14.99,
    annualPrice: 155.99,
    description: '$14.99 / month',
    tagline: 'Full daily support — or $155.99/yr (save 13%)',
    stripePriceIdMonthly: import.meta.env.VITE_STRIPE_PRICE_DAILY_CARE_MONTHLY || '',
    stripePriceIdAnnual: import.meta.env.VITE_STRIPE_PRICE_DAILY_CARE_ANNUAL || '',
    features: [
      { label: 'Everything in Companion', included: true },
      { label: 'Unlimited reminders', included: true, highlight: true },
      { label: 'Medication tracker + logs', included: true, highlight: true },
      { label: 'Care Partner check-in (A–G)', included: true, highlight: true },
      { label: 'Family photo vault (unlimited)', included: true },
      { label: 'Family & memory categories', included: true },
      { label: 'Mood history & trends', included: true },
      { label: 'Games & brain training', included: true },
      { label: 'Videos & media upload', included: true },
      { label: 'Voice messages from family', included: false },
      { label: 'AI comfort voices', included: false },
      { label: 'Document vault', included: false },
    ],
  },

  full_support: {
    name: 'full_support',
    label: 'Full Service Care',
    price: 24.99,
    annualPrice: 264.99,
    description: '$24.99 / month',
    tagline: 'Everything — or $264.99/yr (save 12%)',
    stripePriceIdMonthly: import.meta.env.VITE_STRIPE_PRICE_FULL_SUPPORT_MONTHLY || '',
    stripePriceIdAnnual: import.meta.env.VITE_STRIPE_PRICE_FULL_SUPPORT_ANNUAL || '',
    features: [
      { label: 'Everything in Daily Care', included: true },
      { label: 'Voice messages from family', included: true, highlight: true },
      { label: 'AI comfort voices (all 4)', included: true, highlight: true },
      { label: 'Slideshow auto-play', included: true },
      { label: 'Document vault (medical records)', included: true, highlight: true },
      { label: 'Medication missed SMS alerts', included: true },
      { label: 'Weekly mood summary email', included: true },
      { label: 'Priority support', included: true },
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

const FEATURE_ACCESS: Record<FeatureKey, TierName[]> = {
  reminders_unlimited:  ['daily_care', 'full_support', 'master'],
  medications:          ['daily_care', 'full_support', 'master'],
  care_partner_checkin: ['daily_care', 'full_support', 'master'],
  memories_unlimited:   ['daily_care', 'full_support', 'master'],
  mood_history:         ['daily_care', 'full_support', 'master'],
  games:                ['daily_care', 'full_support', 'master'],
  media:                ['daily_care', 'full_support', 'master'],
  voice_messages:       ['full_support', 'master'],
  ai_voices:            ['full_support', 'master'],
  documents:            ['full_support', 'master'],
  sms_alerts:           ['full_support', 'master'],
  mood_email:           ['full_support', 'master'],
};

/** Returns true if the given tier has access to the feature. */
export function hasFeatureAccess(tier: TierName, feature: FeatureKey): boolean {
  if (tier === 'master') return true;  // master bypasses all gates
  return FEATURE_ACCESS[feature].includes(tier);
}

/** Returns true if the subscription is currently in an active or trialing state. */
export function isSubscriptionActive(sub: Subscription | null): boolean {
  if (!sub) return false;
  if (sub.tier === 'master') return true;  // master is always active
  if (sub.status === 'promo') {
    // Promo is active as long as promoExpiresAt is in the future
    if (!sub.promoExpiresAt) return true;
    return new Date(sub.promoExpiresAt) > new Date();
  }
  return sub.status === 'active' || sub.status === 'trialing';
}

/** Returns days remaining in the trial or promo window (0 if expired). */
export function trialDaysRemaining(sub: Subscription | null): number {
  if (!sub) return 0;
  if (sub.tier === 'master') return 0;  // master never expires

  if (sub.status === 'promo' && sub.promoExpiresAt) {
    const end = new Date(sub.promoExpiresAt).getTime();
    return Math.max(0, Math.ceil((end - Date.now()) / (1000 * 60 * 60 * 24)));
  }

  if (sub.status !== 'trialing') return 0;
  const end = new Date(sub.trialEndsAt).getTime();
  return Math.max(0, Math.ceil((end - Date.now()) / (1000 * 60 * 60 * 24)));
}

/** Returns true if still within the 7-day money-back window (not applicable to master/promo). */
export function isWithinRefundWindow(sub: Subscription | null): boolean {
  if (!sub) return false;
  if (sub.tier === 'master' || sub.status === 'promo') return false;
  const start = new Date(sub.trialStartedAt).getTime();
  const daysSinceStart = (Date.now() - start) / (1000 * 60 * 60 * 24);
  return daysSinceStart <= 7;
}

/** Returns true if the free trial has genuinely expired and user needs to upgrade. */
export function isTrialExpired(sub: Subscription | null): boolean {
  if (!sub) return false;
  if (sub.tier === 'master') return false;
  if (sub.status === 'promo') {
    if (!sub.promoExpiresAt) return false;
    return new Date(sub.promoExpiresAt) <= new Date();
  }
  if (sub.status !== 'trialing') return sub.status === 'expired';
  return new Date(sub.trialEndsAt) <= new Date();
}
