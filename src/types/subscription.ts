// ─── Subscription tier definitions ───────────────────────────────────────────

export type TierName =  'free_tier' | 'paid_tier' | 'master';

// MYMEMORIA-FUNCTIONAL-REPAIR-006: paid-PLAN identity, distinct from tier,
// status, role, and admin privilege. `tier` still governs the broad access
// class (free/paid/master) exactly as before — unchanged. `plan` (new)
// governs WHICH paid product was purchased, and only has meaning when
// tier === 'paid_tier'. A free_tier or master subscription's plan is
// always null.
export type PlanName = 'daily_care' | 'full_support';

// MYMEMORIA-FUNCTIONAL-REPAIR-007: `program` identifies an issued
// Temporary or Companion grant — distinct from tier/plan/status/role, and
// orthogonal to them. Both programs are tier='free_tier'; `program` is the
// ONLY thing that distinguishes an ordinary free signup from a Temporary
// or Companion ISSUED account. A row with program=null is an ordinary
// account of whatever tier it has (free, paid, or master) — requirement 1
// ("Ordinary Free remains the default classification") is satisfied simply
// by this column defaulting to NULL and nothing ever setting it except the
// one trusted RPC (see supabase/migrations/018_... .sql).
export type ProgramName = 'temp_user' | 'companion';

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
  // REPAIR 006: server-authoritative paid-plan identity (see
  // supabase/migrations/017_... .sql). Never inferred from a display
  // label, price text, or any client-local value — always read back from
  // the trusted `subscriptions.plan` column exactly as stored.
  plan: PlanName | null;
  // REPAIR 007: server-authoritative Temporary/Companion program identity
  // (see supabase/migrations/018_... .sql). Never inferred from an email
  // pattern, a client parameter, or any editable profile field.
  program: ProgramName | null;
  status: SubscriptionStatus;
  // REPAIR 007: for a program-classified row, these are the TRUSTED
  // issuance (trialStartedAt) and expiry (trialEndsAt) timestamps — the
  // same columns the existing trial/promo lifecycle already used, reused
  // rather than duplicated with a second pair of columns. The actual
  // eligibility decision is never made by comparing these to the client's
  // own Date() — see isProgramActive() below and
  // is_my_program_active() (the trusted, server-`now()`-based RPC).
  trialStartedAt?: string | null;
  trialEndsAt?: string | null;
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

// REPAIR 007/008: `isTempUser()`/TEMP_USER_EMAIL_PATTERN are a client-side,
// email-pattern-based, read-only UI guard. They are NOT the program
// classification and never authorize anything — requirement 3 ("email
// patterns... cannot authorize a program"). REPAIR 008 / REPAIR C went
// through every call site: SubscriptionContext.tsx's `isTempUserDemo`
// (derived solely from the trusted `program` column +
// is_my_program_active()) is now the authoritative signal everywhere a
// real access decision is made (TempUserGuard.tsx's isReadOnly,
// PatientLayout.tsx's Temp-demo view swap); the several places that
// previously ALSO ran a redundant standalone isTempUser(email) check next
// to the trusted one (PatientProfileSetup.tsx, PatientEmergencyContacts.tsx,
// CarePartnerCheckin.tsx) had that redundant check removed outright. What
// remains is TempUserGuard.tsx's isReadOnly OR'ing isTempUser(email) in
// addition to the trusted signal — strictly a safety net that can only
// make the UI MORE restrictive, documented in detail at that call site.
// MYMEMORIA-FUNCTIONAL-CLOSURE-MASTER-009 / PHASE 2: App.tsx's own
// root-level routing check (previously the one remaining email-pattern
// use, since SubscriptionContext is not mounted at that render point) now
// reads a trusted signal too — restoreSession() there performs the same
// subscriptions + is_my_program_active() read every other gate in this
// app relies on and stores the result locally, rather than importing the
// full SubscriptionContext tree. Neither remaining use can grant, renew,
// or remove a program entitlement.

// ─── Temporary / Companion program metadata ──────────────────────────────────
// Display/documentation only — NOT the enforcement mechanism. The actual
// eligibility decision is always the server-trusted is_my_program_active()
// RPC (now() evaluated in Postgres); these durations exist so the admin UI
// and this file's own callers can show "72 hours" / "30 days" without
// hardcoding the number in more than one place.
export const PROGRAM_DURATIONS_HOURS: Record<ProgramName, number> = {
  temp_user: 72,       // 72 hours
  companion: 30 * 24,  // 30 days
};

export const PROGRAM_LABELS: Record<ProgramName, string> = {
  temp_user: 'Temporary (Read-Only Demo)',
  companion: 'Companion',
};

// ─── Promo codes ─────────────────────────────────────────────────────────────

export interface PromoCode {
  code: string;
  tier: TierName;
  // REPAIR 006 requirement 6: a promo code that grants paid_tier must
  // name WHICH plan explicitly — never assumed. null is only valid when
  // tier !== 'paid_tier' (a free_tier promo, if ever used).
  plan: PlanName | null;
  days: number;
  maxUses: number | null;   // null = unlimited
  expiresAt: string | null; // ISO date, null = no expiry
  description: string;
}

export const PROMO_CODES: PromoCode[] = [
  // Add promo codes here as needed, e.g.:
  // { code: 'WELCOME30', tier: 'paid_tier', plan: 'daily_care', days: 30, maxUses: null, expiresAt: null, description: '30 days Daily Care free' },
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

// Declared ahead of TIERS/PLANS so both can reference the same numbers —
// the owner-confirmed prices, defined exactly once.
const DAILY_CARE_MONTHLY_PRICE = 4.99;
const DAILY_CARE_ANNUAL_LICENSE_PRICE = 49.99;
const FULL_SUPPORT_MONTHLY_PRICE = 9.99;
const FULL_SUPPORT_ANNUAL_LICENSE_PRICE = 99.99;

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
    features: [
      { label: 'Daily time & orientation', included: true },
      { label: 'Unlimited reminders', included: false },
      { label: 'Medication tracker + logs', included: true, highlight: true },
      { label: 'Care Partner check-in (A–G)', included: false },
      { label: 'Family memory vault (unlimited)', included: false },
      { label: 'Family & memory categories', included: true },
      { label: '"You are safe" affirmation', included: true },
      { label: 'Videos & media upload', included: true, highlight: true },
      { label: 'Voice messages from family', included: false },
      { label: 'AI comfort voices', included: false },
      { label: 'Document vault', included: true, highlight: true },
      { label: 'Mood history & trends', included: false },
      { label: 'Games & brain training', included: false },
      { label: 'Medication missed-dose SMS alerts', included: false },
      { label: 'Weekly mood summary email', included: false },
    ],
  },

  // MYMEMORIA-FUNCTIONAL-REPAIR-006: `paid_tier` itself no longer has one
  // price or one feature list — it is the broad access CLASS shared by two
  // distinct, separately-priced products (see PLANS below). This entry is
  // kept only because `TierName` (unchanged per this repair's own
  // requirement) still includes 'paid_tier', and a few places key off
  // TIERS[tier] generically (e.g. FeatureGate's upsell copy by
  // `requiredTier`). `price`/`features` here are deliberately NOT a real,
  // billable number — they describe the FLOOR (the cheaper of the two
  // plans) only for a generic "paid tier" reference that doesn't yet know
  // which plan. Anywhere that DOES know the plan should read PLANS[plan]
  // instead, which is the real, owner-approved pricing.
  paid_tier: {
    name: 'paid_tier',
    label: 'Paid Tier',
    price: DAILY_CARE_MONTHLY_PRICE,
    annualPrice: null,
    description: 'Two plans available — Daily Care and Full Support. See PLANS for exact pricing.',
    tagline: 'Daily Care or Full Support',
    stripePriceIdMonthly: '',
    stripePriceIdAnnual: null,
    features: [],  // see PLANS[plan].features for the real, plan-specific list
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

// ─── Paid plan metadata (REPAIR 006) ─────────────────────────────────────────
// The owner-approved, confirmed pricing. Two SEPARATE charges per plan: a
// monthly subscription, and an additional annual organization/account
// license — the license is never a substitute for the monthly charge, and
// this shape (two distinct price fields) keeps the app from ever
// conflating them into one number.

export interface PlanConfig {
  plan: PlanName;
  label: string;
  monthlyPrice: number;          // USD — confirmed by owner
  annualLicensePrice: number;    // USD — confirmed by owner; a SEPARATE charge
  description: string;
  tagline: string;
  features: TierFeature[];
  stripePriceIdMonthly: string;
  stripeAnnualLicensePriceId: string;
}

export const PLANS: Record<PlanName, PlanConfig> = {
  daily_care: {
    plan: 'daily_care',
    label: 'Daily Care',
    monthlyPrice: DAILY_CARE_MONTHLY_PRICE,
    annualLicensePrice: DAILY_CARE_ANNUAL_LICENSE_PRICE,
    description: `$${DAILY_CARE_MONTHLY_PRICE.toFixed(2)}/month, plus a separate $${DAILY_CARE_ANNUAL_LICENSE_PRICE.toFixed(2)}/year organization account license`,
    tagline: 'Everyday caregiving support',
    // BLOCKER (reported, not guessed): no Stripe price id for Daily Care is
    // confirmed anywhere in this project's documented environment
    // variables (CLAUDE.md names only VITE_STRIPE_PRICE_FULL_SUPPORT_MONTHLY).
    // Read defensively — defaults to '' exactly like free_tier/master
    // already do — rather than inventing an id. Live checkout for this
    // plan cannot function until the owner/infra confirms real Stripe
    // product/price identifiers for it.
    stripePriceIdMonthly: import.meta.env.VITE_STRIPE_PRICE_DAILY_CARE_MONTHLY || '',
    stripeAnnualLicensePriceId: import.meta.env.VITE_STRIPE_PRICE_DAILY_CARE_ANNUAL_LICENSE || '',
    features: [
      { label: 'Daily time & orientation', included: true },
      { label: 'Medication tracker + logs', included: true, highlight: true },
      { label: 'Videos & media upload', included: true, highlight: true },
      { label: 'Document vault', included: true, highlight: true },
      { label: 'Unlimited reminders', included: true, highlight: true },
      { label: 'Care Partner check-in (A–G)', included: true, highlight: true },
      { label: 'Family memory vault (unlimited)', included: true, highlight: true },
      { label: 'Mood history & trends', included: true },
      { label: 'Games & brain training', included: true },
      { label: 'Voice messages from family', included: false },
      { label: 'AI comfort voices', included: false },
      { label: 'Automatic slideshow playback', included: false },
      { label: 'Medication missed-dose SMS alerts', included: false },
      { label: 'Weekly mood summary email', included: false },
    ],
  },
  full_support: {
    plan: 'full_support',
    label: 'Full Support',
    monthlyPrice: FULL_SUPPORT_MONTHLY_PRICE,
    annualLicensePrice: FULL_SUPPORT_ANNUAL_LICENSE_PRICE,
    description: `$${FULL_SUPPORT_MONTHLY_PRICE.toFixed(2)}/month, plus a separate $${FULL_SUPPORT_ANNUAL_LICENSE_PRICE.toFixed(2)}/year organization account license`,
    tagline: 'Complete application access',
    // CLAUDE.md's documented required env vars DO name this one —
    // VITE_STRIPE_PRICE_FULL_SUPPORT_MONTHLY — but the annual-license price
    // id is NOT documented anywhere; read defensively, same as above.
    stripePriceIdMonthly: import.meta.env.VITE_STRIPE_PRICE_FULL_SUPPORT_MONTHLY || '',
    stripeAnnualLicensePriceId: import.meta.env.VITE_STRIPE_PRICE_FULL_SUPPORT_ANNUAL_LICENSE || '',
    features: [
      { label: 'Daily time & orientation', included: true },
      { label: 'Medication tracker + logs', included: true, highlight: true },
      { label: 'Videos & media upload', included: true, highlight: true },
      { label: 'Document vault', included: true, highlight: true },
      { label: 'Unlimited reminders', included: true, highlight: true },
      { label: 'Care Partner check-in (A–G)', included: true, highlight: true },
      { label: 'Family memory vault (unlimited)', included: true, highlight: true },
      { label: 'Mood history & trends', included: true },
      { label: 'Games & brain training', included: true },
      { label: 'Voice messages from family', included: true, highlight: true },
      { label: 'AI comfort voices', included: true, highlight: true },
      { label: 'Automatic slideshow playback', included: true },
      { label: 'Medication missed-dose SMS alerts', included: true },
      { label: 'Weekly mood summary email', included: true },
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
  | 'mood_email'
  // REPAIR 006: new — gates ONLY the automatic/auto-advance slideshow
  // behavior (src/pages/patient/PatientHome.tsx's "Auto Play" toggle).
  // Manually viewing or stepping through a slideshow is NOT gated by this
  // key and remains available regardless of plan — only the newly-named
  // "Automatic slideshow playback" perk is.
  | 'slideshow_autoplay';

/*
 * MYMEMORIA-FUNCTIONAL-REPAIR-006 — CORRECTED, PLAN-AWARE ENTITLEMENT MAP.
 *
 * Replaces the flat FEATURE_ACCESS: Record<FeatureKey, TierName[]> map from
 * REPAIR 005. That map could only express "free_tier or not" — it had no
 * way to represent "Daily Care gets this, but Full Support-only features
 * don't," because tier alone can't distinguish the two paid products. The
 * three buckets below, plus hasFeatureAccess()'s plan-aware logic, replace
 * it entirely — no FeatureKey was removed, and every key keeps exactly the
 * free-vs-paid classification REPAIR 005 already established; this only
 * ADDS the daily_care/full_support split within "paid."
 *
 * "Priority support" (named in the work order as a possible Full Support
 * perk) has NO implementation anywhere in this codebase — no support-
 * ticket system, no contact-priority flag, nothing. No FeatureKey exists
 * for it and none is added here; fabricating a gate for functionality that
 * doesn't exist would violate "do not promise functionality not actually
 * implemented." Same for `sms_alerts`/`mood_email`: no SMS-sending or
 * email-sending backend exists in this codebase at all — these two
 * FeatureKeys are classification-only (used for pricing-page display and
 * `can()` would correctly gate them IF a feature existed to check), not
 * backed by any real gated action today.
 */
const FREE_TIER_FEATURES: FeatureKey[] = ['medications', 'media', 'documents'];

const DAILY_CARE_FEATURES: FeatureKey[] = [
  'reminders_unlimited', 'care_partner_checkin', 'memories_unlimited', 'mood_history', 'games',
];

const FULL_SUPPORT_ONLY_FEATURES: FeatureKey[] = [
  'voice_messages', 'ai_voices', 'slideshow_autoplay', 'sms_alerts', 'mood_email',
];

/**
 * Returns true if the given (tier, feature, plan) combination has access.
 * `plan` only matters when tier === 'paid_tier' — ignored for free_tier
 * (never has paid features regardless) and master (bypasses everything).
 *
 * LEGACY COMPATIBILITY (REPAIR 006 requirement 7 — "do not silently revoke
 * previously held access"): before this repair, EVERY paid_tier
 * subscription — regardless of which product was actually purchased — had
 * access to ALL FeatureKeys; there was no plan distinction at all. A
 * paid_tier row with `plan` null/undefined is exactly that pre-existing,
 * unclassified shape: not a new account, necessarily an OLD one this
 * repair found with no verifiable plan identifier (see migration 017's own
 * note). Such a row keeps the FULL historical feature set — this is
 * explicitly NOT "classifying it as Full Support" (requirement 6): no
 * plan value is assigned, written, or asserted anywhere by this fallback;
 * it is purely an entitlement-level backward-compatibility rule,
 * re-evaluated fresh every call from the stored (tier, plan) pair, never
 * recorded as a conclusion. The moment a trusted admin assigns an EXPLICIT
 * plan (required for every NEW admin_set_subscription() call per migration
 * 017 — a null plan can no longer be newly created going forward), that
 * specific account immediately narrows to the real plan's own feature set.
 *
 * `slideshow_autoplay` is the one feature in FULL_SUPPORT_ONLY_FEATURES
 * that was previously completely UNGATED for every tier (not even a
 * paid_tier-only feature before — available to everyone). A legacy
 * paid_tier+null-plan row already had it under the old, broader behavior,
 * so including it in the legacy fallback here is consistent with
 * requirement 7, not a new grant.
 */
export function hasFeatureAccess(tier: TierName, feature: FeatureKey, plan?: PlanName | null): boolean {
  if (tier === 'master') return true;
  if (FREE_TIER_FEATURES.includes(feature)) return true;
  if (tier !== 'paid_tier') return false;
  if (plan == null) return true; // legacy/unclassified paid_tier — full historical access; see doc comment above
  if (plan === 'full_support') return true;
  // plan === 'daily_care'
  return DAILY_CARE_FEATURES.includes(feature) || !FULL_SUPPORT_ONLY_FEATURES.includes(feature);
}

/** Returns true if the subscription is currently active. */
/**
 * `trustedProgramActive` MUST come from the server-computed
 * `is_my_program_active()` RPC (now() evaluated inside Postgres) — never
 * from comparing `sub.trialEndsAt` against the client's own `Date()`,
 * which a manipulated device clock can defeat. REPAIR 007 requirement:
 * "a successful expiration check must not depend on the client device
 * clock." Omitted/undefined is treated as "not yet confirmed" and fails
 * CLOSED (not active) rather than optimistically granting access while the
 * trusted check is still in flight or wasn't requested.
 */
export function isSubscriptionActive(sub: Subscription | null, trustedProgramActive?: boolean | null): boolean {
  if (!sub) return false;
  if (sub.tier === 'master') return true;
  if (sub.program) {
    return trustedProgramActive === true;
  }
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
  // REPAIR 007: Temporary/Companion are free_tier programs — expiry means
  // losing eligibility, never "needs payment" (there is nothing to pay
  // for). isSubscriptionActive() is the correct check for whether the
  // program is still usable; this function stays about billing only.
  if (sub.program) return false;
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
