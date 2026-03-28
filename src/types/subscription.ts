// ─── Subscription tier definitions ───────────────────────────────────────────

export type TierName = 'companion' | 'daily_care' | 'full_support';

export type SubscriptionStatus =
  | 'trialing'     // within the 7-day trial window
  | 'active'       // paid and current
  | 'past_due'     // payment failed, grace period
  | 'canceled'     // explicitly canceled
  | 'expired';     // trial ended, never paid

export interface Subscription {
  id: string;
  userId: string;
  tier: TierName;
  status: SubscriptionStatus;
  trialStartedAt: string;        // ISO date — when they first signed up
  trialEndsAt: string;           // ISO date — trialStartedAt + 7 days
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  canceledAt: string | null;
  createdAt: string;
  updatedAt: string;
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
    description: 'Free forever',
    tagline: 'Get started with the basics',
    stripePriceIdMonthly: '',   // free — no Stripe price needed
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
    price: 12.99,
    annualPrice: null,
    description: '$12.99 / month',
    tagline: 'Full daily support — about $0.43 a day',
    stripePriceIdMonthly: import.meta.env.VITE_STRIPE_PRICE_DAILY_CARE_MONTHLY || '',
    stripePriceIdAnnual: null,
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
    label: 'Full Support',
    price: 24.99,
    annualPrice: 254.90,
    description: '$24.99 / month',
    tagline: 'Everything — or $254.90/yr (save 15%)',
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
  reminders_unlimited:  ['daily_care', 'full_support'],
  medications:          ['daily_care', 'full_support'],
  care_partner_checkin: ['daily_care', 'full_support'],
  memories_unlimited:   ['daily_care', 'full_support'],
  mood_history:         ['daily_care', 'full_support'],
  games:                ['daily_care', 'full_support'],
  media:                ['daily_care', 'full_support'],
  voice_messages:       ['full_support'],
  ai_voices:            ['full_support'],
  documents:            ['full_support'],
  sms_alerts:           ['full_support'],
  mood_email:           ['full_support'],
};

/** Returns true if the given tier has access to the feature. */
export function hasFeatureAccess(tier: TierName, feature: FeatureKey): boolean {
  return FEATURE_ACCESS[feature].includes(tier);
}

/** Returns true if the subscription is currently in an active or trialing state. */
export function isSubscriptionActive(sub: Subscription | null): boolean {
  if (!sub) return false;
  return sub.status === 'active' || sub.status === 'trialing';
}

/** Returns days remaining in the trial (0 if expired or not trialing). */
export function trialDaysRemaining(sub: Subscription | null): number {
  if (!sub || sub.status !== 'trialing') return 0;
  const end = new Date(sub.trialEndsAt).getTime();
  const now = Date.now();
  return Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
}

/** Returns true if still within the 7-day money-back window. */
export function isWithinRefundWindow(sub: Subscription | null): boolean {
  if (!sub) return false;
  const start = new Date(sub.trialStartedAt).getTime();
  const now = Date.now();
  const daysSinceStart = (now - start) / (1000 * 60 * 60 * 24);
  return daysSinceStart <= 7;
}
