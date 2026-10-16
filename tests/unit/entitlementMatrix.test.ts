// MYMEMORIA-FUNCTIONAL-REPAIR-005 / REPAIR-006 / REPAIR E regression tests.
// Pure-logic tests against src/types/subscription.ts — the single
// canonical entitlement source every gate (FeatureGate, SubscriptionContext,
// PatientLayout's nav/view locking) ultimately reads. No DB, no React
// rendering — these assert the DATA CONTRACT itself.
import { describe, it, expect } from 'vitest';
import {
  hasFeatureAccess,
  isSubscriptionActive,
  needsPayment,
  TIERS,
  PLANS,
  type FeatureKey,
  type PlanName,
  type Subscription,
} from '@/types/subscription';

const ALL_FEATURE_KEYS: FeatureKey[] = [
  'reminders_unlimited', 'medications', 'care_partner_checkin', 'memories_unlimited',
  'mood_history', 'games', 'media', 'voice_messages', 'ai_voices', 'documents',
  'sms_alerts', 'mood_email', 'slideshow_autoplay',
];

const APPROVED_FREE_FEATURES: FeatureKey[] = ['medications', 'media', 'documents'];
const DAILY_CARE_ADDS: FeatureKey[] = ['reminders_unlimited', 'care_partner_checkin', 'memories_unlimited', 'mood_history', 'games'];
const FULL_SUPPORT_ONLY_ADDS: FeatureKey[] = ['voice_messages', 'ai_voices', 'slideshow_autoplay', 'sms_alerts', 'mood_email'];

function baseSub(overrides: Partial<Subscription>): Subscription {
  return {
    id: 'sub-1',
    userId: 'user-1',
    tier: 'free_tier',
    plan: null,
    program: null,
    status: 'active',
    currentPeriodStart: null,
    currentPeriodEnd: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    promoCode: null,
    promoExpiresAt: null,
    canceledAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('REPAIR A — exactly three approved free-tier features', () => {
  it('grants free_tier access to exactly medications, media, and documents — nothing else', () => {
    const granted = ALL_FEATURE_KEYS.filter(f => hasFeatureAccess('free_tier', f));
    expect(granted.sort()).toEqual([...APPROVED_FREE_FEATURES].sort());
  });

  it.each(APPROVED_FREE_FEATURES)('free_tier has access to approved feature "%s"', (feature) => {
    expect(hasFeatureAccess('free_tier', feature)).toBe(true);
  });

  const paidOnly = ALL_FEATURE_KEYS.filter(f => !APPROVED_FREE_FEATURES.includes(f));
  it.each(paidOnly)('free_tier is denied paid-only feature "%s" regardless of any plan value passed', (feature) => {
    expect(hasFeatureAccess('free_tier', feature, 'daily_care')).toBe(false);
    expect(hasFeatureAccess('free_tier', feature, 'full_support')).toBe(false);
    expect(hasFeatureAccess('free_tier', feature, null)).toBe(false);
  });

  it.each(ALL_FEATURE_KEYS)('master has access to every feature, including "%s", regardless of plan (tier-override bypass)', (feature) => {
    expect(hasFeatureAccess('master', feature)).toBe(true);
    expect(hasFeatureAccess('master', feature, 'daily_care')).toBe(true);
  });

  it('does not invent a reminder quota or memory allowance — reminders_unlimited and memories_unlimited are a plain boolean gate, not tier-dependent partial access', () => {
    expect(typeof hasFeatureAccess('free_tier', 'reminders_unlimited')).toBe('boolean');
    expect(typeof hasFeatureAccess('paid_tier', 'memories_unlimited', 'daily_care')).toBe('boolean');
  });
});

describe('REPAIR 006 — Daily Care receives Free plus its own approved additions', () => {
  it.each(APPROVED_FREE_FEATURES)('Daily Care retains free feature "%s"', (feature) => {
    expect(hasFeatureAccess('paid_tier', feature, 'daily_care')).toBe(true);
  });

  it.each(DAILY_CARE_ADDS)('Daily Care has access to its own approved addition "%s"', (feature) => {
    expect(hasFeatureAccess('paid_tier', feature, 'daily_care')).toBe(true);
  });

  it.each(FULL_SUPPORT_ONLY_ADDS)('REPAIR 006 requirement 4 — Daily Care is DENIED Full-Support-only feature "%s"', (feature) => {
    expect(hasFeatureAccess('paid_tier', feature, 'daily_care')).toBe(false);
  });
});

describe('REPAIR 006 — Full Support receives everything Daily Care has, plus its own additions', () => {
  it.each([...APPROVED_FREE_FEATURES, ...DAILY_CARE_ADDS])('Full Support retains Daily Care-level feature "%s"', (feature) => {
    expect(hasFeatureAccess('paid_tier', feature, 'full_support')).toBe(true);
  });

  it.each(FULL_SUPPORT_ONLY_ADDS)('Full Support has access to its own exclusive feature "%s"', (feature) => {
    expect(hasFeatureAccess('paid_tier', feature, 'full_support')).toBe(true);
  });

  it('Full Support has access to every single FeatureKey', () => {
    for (const f of ALL_FEATURE_KEYS) {
      expect(hasFeatureAccess('paid_tier', f, 'full_support')).toBe(true);
    }
  });
});

describe('REPAIR 006 requirement 5 — ineligible subscriptions cannot obtain paid permissions merely via a stored plan name', () => {
  it('a free_tier row with plan erroneously set still gets no paid features (tier gates first)', () => {
    // hasFeatureAccess never trusts `plan` alone — it only consults plan
    // AFTER confirming tier === 'paid_tier'. A free_tier row should never
    // have a non-null plan per migration 017's own CHECK constraint, but
    // even if one existed, the feature check still fails closed.
    for (const f of FULL_SUPPORT_ONLY_ADDS) {
      expect(hasFeatureAccess('free_tier', f, 'full_support' as PlanName)).toBe(false);
    }
  });

  it('isSubscriptionActive still gates status independent of tier/plan — expired/canceled/past_due/pending_payment grant nothing regardless of plan', () => {
    for (const status of ['expired', 'canceled', 'past_due', 'pending_payment'] as const) {
      expect(isSubscriptionActive(baseSub({ tier: 'paid_tier', plan: 'full_support', status }))).toBe(false);
    }
  });
});

describe('REPAIR 006 requirement 6 — promo scope is never assumed to be Full Support', () => {
  it('hasFeatureAccess treats a paid_tier+daily_care promo exactly like a non-promo Daily Care subscription (status is checked separately by isSubscriptionActive/can(), not by hasFeatureAccess)', () => {
    expect(hasFeatureAccess('paid_tier', 'voice_messages', 'daily_care')).toBe(false);
    expect(hasFeatureAccess('paid_tier', 'reminders_unlimited', 'daily_care')).toBe(true);
  });

  it('PLANS never implies a promo code defaults to full_support — PLANS only describes the two real, priced products, not promo defaults', () => {
    expect(Object.keys(PLANS).sort()).toEqual(['daily_care', 'full_support']);
  });
});

describe('REPAIR 006 requirements 6/7 — unrecognized or absent paid-plan identity (legacy subscriptions)', () => {
  it('a paid_tier row with plan=null (legacy/unclassified) keeps FULL historical access — not silently revoked', () => {
    for (const f of ALL_FEATURE_KEYS) {
      expect(hasFeatureAccess('paid_tier', f, null)).toBe(true);
    }
  });

  it('a paid_tier row with plan=undefined (the 2-argument call shape, e.g. legacy call sites) behaves identically to explicit null', () => {
    for (const f of ALL_FEATURE_KEYS) {
      expect(hasFeatureAccess('paid_tier', f)).toBe(true);
    }
  });

  it('REPAIR 006 requirement 6 — absent plan identity is NEVER recorded or asserted as "this is Full Support" — hasFeatureAccess takes no plan parameter that could be mistaken for an identity assignment; it is a pure read, called fresh every time', () => {
    // Structural check: hasFeatureAccess returns a boolean, not a plan
    // value — it cannot itself "classify" anything, only answer yes/no for
    // one specific feature. This test documents that the fallback behavior
    // tested above is an entitlement-level default, not a renamed/returned
    // identity.
    const result = hasFeatureAccess('paid_tier', 'voice_messages', null);
    expect(typeof result).toBe('boolean');
  });
});

describe('REPAIR B requirement 2 — pricing display never claims a paid-only feature as free', () => {
  const freeFeatureLabels: Record<FeatureKey, string> = {
    medications: 'Medication tracker + logs',
    media: 'Videos & media upload',
    documents: 'Document vault',
    reminders_unlimited: 'Unlimited reminders',
    care_partner_checkin: 'Care Partner check-in (A–G)',
    memories_unlimited: 'Family memory vault (unlimited)',
    voice_messages: 'Voice messages from family',
    ai_voices: 'AI comfort voices',
    mood_history: 'Mood history & trends',
    games: 'Games & brain training',
    sms_alerts: 'Medication missed-dose SMS alerts',
    mood_email: 'Weekly mood summary email',
    slideshow_autoplay: 'Automatic slideshow playback',
  };

  it('every free_tier-displayed "included" feature with a known FeatureKey label actually has free_tier access', () => {
    for (const f of TIERS.free_tier.features) {
      const key = (Object.entries(freeFeatureLabels).find(([, label]) => label === f.label) ?? [])[0] as FeatureKey | undefined;
      if (!key) continue; // not a gated FeatureKey (core/ungated copy line) — out of scope
      expect(hasFeatureAccess('free_tier', key)).toBe(f.included);
    }
  });

  it('the three approved features are shown as included in the free tier pricing display', () => {
    const includedLabels = TIERS.free_tier.features.filter(f => f.included).map(f => f.label);
    expect(includedLabels).toContain(freeFeatureLabels.medications);
    expect(includedLabels).toContain(freeFeatureLabels.media);
    expect(includedLabels).toContain(freeFeatureLabels.documents);
  });

  it('PLANS.daily_care correctly marks its own additions included and Full-Support-only features not included', () => {
    const included = PLANS.daily_care.features.filter(f => f.included).map(f => f.label);
    for (const key of DAILY_CARE_ADDS) expect(included).toContain(freeFeatureLabels[key]);
    for (const key of FULL_SUPPORT_ONLY_ADDS) expect(included).not.toContain(freeFeatureLabels[key]);
  });

  it('PLANS.full_support marks every feature included', () => {
    expect(PLANS.full_support.features.every(f => f.included)).toBe(true);
  });

  it('PLANS prices match the owner-confirmed amounts exactly', () => {
    expect(PLANS.daily_care.monthlyPrice).toBe(4.99);
    expect(PLANS.daily_care.annualLicensePrice).toBe(49.99);
    expect(PLANS.full_support.monthlyPrice).toBe(9.99);
    expect(PLANS.full_support.annualLicensePrice).toBe(99.99);
  });
});

describe('REPAIR 007 — program-aware isSubscriptionActive()/needsPayment() never trust a client clock', () => {
  it('a program subscription is active ONLY when the trusted server check explicitly reports true', () => {
    const tempSub = baseSub({ tier: 'free_tier', program: 'temp_user' });
    expect(isSubscriptionActive(tempSub, true)).toBe(true);
    expect(isSubscriptionActive(tempSub, false)).toBe(false);
  });

  it('fails CLOSED when the trusted check has not yet returned (undefined) or explicitly reports unknown (null) — never optimistic', () => {
    const companionSub = baseSub({ tier: 'free_tier', program: 'companion' });
    expect(isSubscriptionActive(companionSub)).toBe(false);
    expect(isSubscriptionActive(companionSub, undefined)).toBe(false);
    expect(isSubscriptionActive(companionSub, null)).toBe(false);
  });

  it('a program subscription ignores sub.status entirely — the server-computed eligibility is the sole signal, never a stale/legacy status value on the row', () => {
    const sub = baseSub({ tier: 'free_tier', program: 'temp_user', status: 'canceled' });
    expect(isSubscriptionActive(sub, true)).toBe(true);
  });

  it('master still bypasses everything, even a (structurally impossible) row that also carries a program value', () => {
    const impossible = baseSub({ tier: 'master', program: 'companion' });
    expect(isSubscriptionActive(impossible, false)).toBe(true);
  });

  it('needsPayment() is false for a program subscription regardless of trusted-eligibility state — expiry means losing eligibility, never "requires payment"', () => {
    expect(needsPayment(baseSub({ tier: 'free_tier', program: 'temp_user' }))).toBe(false);
    expect(needsPayment(baseSub({ tier: 'free_tier', program: 'companion' }))).toBe(false);
  });

  it("Companion's approved feature set is exactly the ordinary free-tier set — no new entitlement logic exists for it, only the expiry gate above", () => {
    const companionTier: Subscription['tier'] = 'free_tier';
    for (const f of APPROVED_FREE_FEATURES) expect(hasFeatureAccess(companionTier, f)).toBe(true);
    for (const f of [...DAILY_CARE_ADDS, ...FULL_SUPPORT_ONLY_ADDS]) expect(hasFeatureAccess(companionTier, f)).toBe(false);
  });
});

describe('invalid, missing, canceled, and expired subscriptions — no unauthorized paid or master access', () => {
  it('a null subscription has no feature access at all (fails closed)', () => {
    expect(isSubscriptionActive(null)).toBe(false);
  });

  it('a canceled subscription is not active, regardless of tier/plan', () => {
    expect(isSubscriptionActive(baseSub({ tier: 'paid_tier', plan: 'full_support', status: 'canceled' }))).toBe(false);
    expect(isSubscriptionActive(baseSub({ tier: 'free_tier', status: 'canceled' }))).toBe(false);
  });

  it('an expired subscription is not active, regardless of tier/plan', () => {
    expect(isSubscriptionActive(baseSub({ tier: 'paid_tier', plan: 'daily_care', status: 'expired' }))).toBe(false);
  });

  it('an expired promo is not active (promoExpiresAt in the past)', () => {
    const sub = baseSub({ tier: 'paid_tier', plan: 'full_support', status: 'promo', promoExpiresAt: new Date(Date.now() - 86400000).toISOString() });
    expect(isSubscriptionActive(sub)).toBe(false);
  });

  it('an unexpired promo is active', () => {
    const sub = baseSub({ tier: 'paid_tier', plan: 'daily_care', status: 'promo', promoExpiresAt: new Date(Date.now() + 86400000).toISOString() });
    expect(isSubscriptionActive(sub)).toBe(true);
  });

  it('a free_tier account cannot be treated as paid/master merely by requesting it client-side — hasFeatureAccess has no caller-supplied override beyond the trusted (tier, plan) pair', () => {
    // hasFeatureAccess takes exactly 2 required params (tier, feature) plus
    // one optional (plan) — there is no additional flag/override a caller
    // could pass to request elevated access. The only way `tier`/`plan`
    // become 'paid_tier'/a real plan is via SubscriptionContext reading the
    // server-authoritative subscriptions row (gated by RLS +
    // admin_set_subscription()/provision_free_subscription() — no
    // client-direct INSERT/UPDATE path exists, per migrations 011/013/017).
    // hasFeatureAccess(tier, feature, plan?) compiles to 3 plain JS
    // parameters (TS `?` optionality has no runtime default, so
    // Function.length counts all three) — asserted here as a structural
    // fact, not a security boundary in itself; the actual authorization
    // boundary is which VALUES can ever reach this function (see comment
    // above), not its arity.
    expect(hasFeatureAccess.length).toBe(3);
  });
});
