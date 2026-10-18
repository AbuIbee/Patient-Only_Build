import { supabase } from '@/lib/supabase';

// RELEASE-BLOCKER-CLOSURE PHASE 2: split out of AdminLayout.tsx, which
// otherwise exports both components (AdminLayout and friends) and these
// constants/functions — Vite Fast Refresh (react-refresh/only-export-
// components) requires a component-exporting file to export components
// only. Still exported solely so REPAIR B's regression tests can assert on
// the preset data and the save guard directly — no behavior change.

export interface SubRow {
  user_id: string;
  tier: string;
  plan: string | null; // REPAIR 006 — server-authoritative paid-plan identity
  program: string | null; // REPAIR 007 — server-authoritative Temporary/Companion identity
  status: string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  promo_expires_at: string | null;
}

// ─── Account Type Definitions ─────────────────────────────────────────────────
// Each entry defines exactly what gets written to the subscriptions table
// and what rules/policies apply.

export interface AccountTypeDef {
  key: string;           // unique key used in the dropdown value
  label: string;         // display name
  tier: string;          // subscriptions.tier
  // REPAIR 006: the trusted paid-plan identity (subscriptions.plan) — the
  // actual field that distinguishes Daily Care from Full Support.
  // Previously `daily_care`/`full_support` were two admin UI labels that
  // BOTH silently wrote tier='paid_tier' with no further distinction
  // anywhere — the exact defect this repair fixes. Must be null for any
  // non-paid_tier entry (enforced both here conceptually and by
  // migration 017's DB-level CHECK).
  plan: 'daily_care' | 'full_support' | null;
  // REPAIR 007: the trusted Temporary/Companion program identity
  // (subscriptions.program). Mutually exclusive with `plan` — the DB
  // requires tier=free_tier whenever this is set (migration 018). Issuance
  // timestamp and 72h/30d expiry are computed server-side inside
  // admin_set_subscription(), never accepted from this client.
  program: 'temp_user' | 'companion' | null;
  status: string;        // subscriptions.status — must be one of the seven approved values
                          // (active/past_due/canceled/expired/pending_payment/promo/trial);
                          // 'trialing' is not and has never been a valid value. 'trial' (added
                          // by migration 032, OWNER-PRICING-BUSINESS-REGISTRATION-REPAIR Phase B)
                          // is the real, server-enforced residential trial — see the 'trial'
                          // preset below, which is what the 'trialing' blocker this file
                          // previously flagged (REPAIR B) was waiting on.
  trialDays: number | null;  // days from now for trial_ends_at (null = never)
  promoDays: number | null;  // days from now for promo_expires_at (null = not promo)
  isTempUser: boolean;   // marks as read-only demo account
  color: string;         // badge colour
  description: string;
  // MYMEMORIA-CRITICAL-REPAIR-FINALIZATION-003 / REPAIR B: a preset is only
  // selectable if the system actually has a trusted, server-enforced way to
  // expire it. `status: 'active'` has NO time-bound check anywhere in the
  // canonical entitlement logic (isSubscriptionActive() in
  // src/types/subscription.ts: `return sub.status === 'active'` — unconditional;
  // confirmed the same in ProtectedRoute.tsx's own separate inline check).
  // That logic was deliberately simplified to assume no trial/expiry concept
  // remains (see subscription.ts's own "No free trial logic runs" deprecated
  // stubs). Writing status:'active' for a preset that is SUPPOSED to be
  // time-limited (temp_user, companion) would therefore grant that account
  // permanent, never-expiring access — not the 72-hour/30-day eligibility
  // window this preset exists to provide. Until real server-side expiration
  // enforcement is built (a trusted check against trial_ends_at wired into
  // the actual access gates, not just this admin screen), this preset must
  // stay unavailable rather than silently grant unsupported indefinite
  // access. See saveAccountType() below, which refuses to proceed for any
  // preset with available: false even if somehow still selected.
  available: boolean;
}

// MYMEMORIA-FUNCTIONAL-REPAIR-004 / REPAIR 1: the empty-string key is the
// explicit "no account type selected or determinable" sentinel — used both
// as the required placeholder for a brand-new account (nothing chosen yet)
// and as the honest result when an EXISTING account's stored tier/status
// cannot be distinguished from any single known preset (see
// getAccountTypeKey() below). It is never written anywhere:
// saveAccountType()'s existing `available` guard refuses it exactly like
// any other unavailable preset, since `available: false` here too.
export const UNASSIGNED_KEY = '';

// All tier values written to DB use recognized TierName values (free_tier / paid_tier / master).
// The key/label fields are admin-only display names; they do not flow into the patient app.
export const ACCOUNT_TYPES: AccountTypeDef[] = [
  {
    key: UNASSIGNED_KEY,
    label: '— Select an account type —',
    tier: '', plan: null, program: null, status: '',
    trialDays: null, promoDays: null, isTempUser: false,
    color: 'bg-gray-100 text-gray-400',
    description: 'No account type is selected, or this account\'s stored tier/status cannot be distinguished from a single known preset. An explicit selection is required before saving any account-type change — never guessed or defaulted.',
    available: false,
  },
  {
    key: 'temp_user',
    label: 'Temp User (Read-Only Demo)',
    tier: 'free_tier', plan: null, program: 'temp_user', status: 'active',
    trialDays: 3, promoDays: null, isTempUser: true,
    color: 'bg-amber-100 text-amber-800',
    // REPAIR 008 / REPAIR A: re-enabled. Migration 018 provides trusted
    // 72-hour server-side expiration; migration 019 adds full SELECT +
    // write (INSERT/UPDATE/DELETE) isolation on every real patient-data
    // table and storage bucket this account could otherwise reach, plus a
    // guard inside the one SECURITY DEFINER RPC (undo_medication_dose)
    // that would otherwise have bypassed those policies; and
    // src/pages/patient/temp-demo/ provides obviously-fictional
    // demonstration views (no Supabase import at all, by construction)
    // for the three required views (Medication Management, Media,
    // Documents), swapped in by PatientLayout.tsx's trusted
    // isTempUserDemo check — never an email pattern. A Temporary account
    // can still reach a few OTHER nav items (Mood, Patient Intake,
    // Emergency Contact) that carry no dedicated fictional-content view
    // yet; those remain backend-isolated (migration 019) but will show
    // empty/error states rather than a polished demo — a known UX
    // rough edge, not a safety gap, left for a future polish pass.
    description: '72-hour read-only demonstration access with fictional sample content for Medications, Media, and Documents — all other real patient data and storage access is denied at the database layer (migration 019), not merely hidden in the UI.',
    available: true,
  },
  {
    key: 'promo',
    label: 'Promo (45-day Full Access)',
    // REPAIR 006: this preset's own pre-existing label already says "Full
    // Access" — plan:'full_support' makes that explicit rather than
    // inventing a new meaning for it. A DIFFERENT promo code configured via
    // the promo_codes table (redeem_promo_code()) carries its OWN plan
    // value per migration 017 — never assumed to be Full Support generally.
    tier: 'paid_tier', plan: 'full_support', program: null, status: 'promo',
    trialDays: 45, promoDays: 45, isTempUser: false,
    color: 'bg-teal-100 text-teal-800',
    description: '45 days Full Support access from today, then prompts upgrade',
    available: true,
  },
  {
    key: 'companion',
    label: 'Companion (Internal Only)',
    tier: 'free_tier', plan: null, program: 'companion', status: 'active',
    trialDays: 30, promoDays: null, isTempUser: false,
    color: 'bg-yellow-100 text-yellow-800',
    // REPAIR 007: re-enabled. Companion's approved feature set (medications/
    // media/documents) is exactly the ordinary free-tier set — no new
    // entitlement logic was needed — and migration 018 provides trusted
    // 30-day server-side expiration via is_my_program_active(), enforced in
    // both SubscriptionContext and ProtectedRoute. Companion access to any
    // specific patient still separately requires that account's own
    // independent patient ownership or verified caregiver authorization;
    // this preset alone never grants cross-patient access.
    // REPAIR 008 / REPAIR B: migration 019 closes the one remaining gap —
    // an EXPIRED Companion's loss of access now also holds against a
    // direct Supabase call that bypasses the app's own can() check
    // (caller_is_expired_companion(), applied to medications/
    // medication_logs/patient_document_uploads/media_uploads/
    // patient_loved_one_photos and the patient-media/patient-documents
    // storage buckets). An ACTIVE Companion's access is completely
    // unaffected by that change.
    description: '30-day internal access to Medication Management, Media, and Documents only — trusted server-side expiration (migration 018) now also enforced against direct database/storage access once expired (migration 019). Still requires separate, independent patient ownership or caregiver authorization for any specific patient; grants no paid-only features.',
    available: true,
  },
  {
    key: 'trial',
    label: '14-Day Trial (Daily Care)',
    // OWNER-PRICING-BUSINESS-REGISTRATION-REPAIR Phase B: the real
    // residential trial — migration 032's DB CHECK requires exactly
    // tier=paid_tier/plan=daily_care whenever status='trial'; trial_ends_at
    // is computed server-side by admin_set_subscription() itself
    // (now() + 14 days by default), never accepted from this client, and
    // is_my_trial_active() is the trusted expiry check every access gate
    // in this app reads — same enforcement guarantee REPAIR B required
    // before any trial-like preset could be marked available.
    tier: 'paid_tier', plan: 'daily_care', program: null, status: 'trial',
    trialDays: 14, promoDays: null, isTempUser: false,
    color: 'bg-amber-100 text-amber-800',
    description: '14-day trial granting Daily Care entitlements only — server-enforced expiration (is_my_trial_active()), same trusted-clock guarantee as Temp User/Companion.',
    available: true,
  },
  {
    key: 'daily_care',
    label: 'Daily Care (Paid)',
    tier: 'paid_tier', plan: 'daily_care', program: null, status: 'active',
    trialDays: null, promoDays: null, isTempUser: false,
    color: 'bg-blue-100 text-blue-800',
    description: 'Active paid tier — Daily Care plan ($9.99/mo, no separate residential annual license)',
    available: true,
  },
  {
    key: 'full_support',
    label: 'Full Support (Paid)',
    tier: 'paid_tier', plan: 'full_support', program: null, status: 'active',
    trialDays: null, promoDays: null, isTempUser: false,
    color: 'bg-green-100 text-green-800',
    description: 'Active paid tier — Full Support plan ($14.99/mo, no separate residential annual license)',
    available: true,
  },
  {
    key: 'master',
    label: 'Master (Free Forever)',
    tier: 'master', plan: null, program: null, status: 'active',
    trialDays: null, promoDays: null, isTempUser: false,
    color: 'bg-purple-100 text-purple-800',
    description: 'Free forever — full access, never expires',
    available: true,
  },
  {
    key: 'canceled',
    label: 'Canceled / Inactive',
    tier: 'free_tier', plan: null, program: null, status: 'canceled',
    trialDays: null, promoDays: null, isTempUser: false,
    color: 'bg-gray-100 text-gray-600',
    description: 'Account is inactive or canceled',
    available: true,
  },
];

// MYMEMORIA-FUNCTIONAL-REPAIR-004 / REPAIR 1: the two fallbacks here used to
// return 'companion' — a GUESS. Neither "no subscription row at all" nor
// "tier=free_tier, status=active with no other matching rule" can actually
// be distinguished, from stored data alone, from: an ordinary self-service
// free-tier signup (provision_free_subscription()), the (currently
// unavailable) companion preset, or the (currently unavailable) temp_user
// preset used without its distinguishing email pattern. No column records
// "which preset created this row." Guessing 'companion' misrepresented
// stored data as a specific, chosen account type it was never confirmed to
// be. Both now return UNASSIGNED_KEY — an honest "cannot be determined"
// result — rather than a guess.
// REPAIR 006: `if (isPaid && sub.status === 'active') return 'full_support'`
// was the exact defect named in this repair order — ANY active paid
// account displayed as Full Support regardless of what was actually
// purchased, because nothing distinguished the two products. Now reads
// the real, trusted `plan` column instead of guessing from tier alone.
// REPAIR 007: the email-pattern check that used to run FIRST here
// (`/^temp-user\d*@/i.test(email)` => 'temp_user') has been removed.
// Requirement 3 of that repair order is explicit: client-side parameters,
// email patterns, and editable profile fields cannot authorize — or, by the
// same logic, be treated as proof of — a program. The trusted `program`
// column (set only via admin_set_subscription(), never derived from an
// address string) is now the sole signal checked below. `_email` is kept in
// the signature only for call-site compatibility; it is no longer read.
export function getAccountTypeKey(sub: SubRow | null, _email: string): string {
  if (!sub) return UNASSIGNED_KEY;
  if (sub.tier === 'master') return 'master';
  // REPAIR 007: program is checked ahead of status/plan — a program row is
  // always tier=free_tier/status='active' at the DB level (migration 018's
  // own CHECKs), so without this it would otherwise fall through to no
  // matching preset at all.
  if (sub.program === 'temp_user') return 'temp_user';
  if (sub.program === 'companion') return 'companion';
  if (sub.status === 'promo') return 'promo';
  // Recognize current DB values (paid_tier) and legacy values (daily_care, full_support)
  const isPaid = sub.tier === 'paid_tier' || sub.tier === 'daily_care' || sub.tier === 'full_support';
  if (isPaid && sub.status === 'active') {
    if (sub.plan === 'daily_care') return 'daily_care';
    if (sub.plan === 'full_support') return 'full_support';
    // Legacy paid_tier row with no verifiable plan identifier — requirement
    // 6: never automatically classify this as Full Support (or Daily
    // Care). Honest "cannot be determined from stored data" result.
    return UNASSIGNED_KEY;
  }
  if (sub.status === 'canceled' || sub.status === 'expired') return 'canceled';
  return UNASSIGNED_KEY;
}

export function getAccountTypeDef(key: string): AccountTypeDef {
  // REPAIR 1: fallback was 'canceled' — itself a guess/default for an
  // unrecognized or not-yet-chosen key (the exact defect this repair order
  // names: "no account is canceled merely because a form is opened").
  // Falls back to the explicit UNASSIGNED_KEY placeholder instead, which is
  // `available: false` and therefore cannot be silently saved either.
  return ACCOUNT_TYPES.find(t => t.key === key) ?? ACCOUNT_TYPES.find(t => t.key === UNASSIGNED_KEY)!;
}

// ─── Save account type to subscriptions table ─────────────────────────────────
// F10 remediation: this previously upserted tier/status/trial_ends_at
// directly into `subscriptions` from the browser with no server-side
// transition validation — any authenticated client calling the same
// supabase-js upsert (not just this admin UI) could set their own tier to
// 'master'/'active' if RLS allowed it. The write now goes through the
// `admin_set_subscription` SECURITY DEFINER RPC (see
// 010_subscriptions_and_admin_rpc.sql), which re-validates the caller is an
// admin and that tier/status is one of the allowed combinations
// server-side, so the privilege boundary doesn't depend solely on this
// admin panel's own code path. Previously trial_ends_at was given a fixed
// 2099 "never" value only for tier === 'master' specifically to work around
// a NOT NULL constraint — the migration makes the column nullable instead,
// so 'canceled'/'companion' (which pass null for trial_ends_at) stop
// risking a constraint violation and 'master' no longer needs the
// far-future placeholder.
export async function saveAccountType(userId: string, key: string): Promise<void> {
  const def = getAccountTypeDef(key);

  // REPAIR B: defense in depth — the dropdown disables unavailable options,
  // but a <select>'s bound value can still be an already-disabled option if
  // it was selected before being disabled (e.g. an existing user whose
  // current account type IS 'temp_user'/'companion', left untouched rather
  // than explicitly re-picked). Refuse explicitly rather than silently
  // writing a status with no trusted expiration enforcement, or relying on
  // the RPC's own six-status rejection to surface this (which would report
  // a confusing "Invalid status" for 'active' here, since the literal value
  // IS one of the six — the problem is enforcement, not the value).
  if (!def.available) {
    throw new Error(`"${def.label}" is not currently available: ${def.description}`);
  }

  const now = new Date();

  const trialEndsAt = def.trialDays
    ? new Date(now.getTime() + def.trialDays * 86400000).toISOString()
    : null;

  const promoExpiresAt = def.promoDays
    ? new Date(now.getTime() + def.promoDays * 86400000).toISOString()
    : null;

  // C02-002: the RPC now returns the saved row (RETURNS subscriptions) so
  // the caller can verify the authoritative persisted state rather than
  // just the absence of an error — a thrown error already rolls back the
  // whole function (see 013_subscriptions_atomic_lifecycle.sql), but an RPC
  // reporting no error while returning no row would not be evidence of a
  // successful save either.
  const { data: savedRow, error } = await supabase.rpc('admin_set_subscription', {
    p_user_id: userId,
    p_tier: def.tier,
    // REPAIR 006: the actual fix — Daily Care and Full Support now write
    // genuinely different, persisted plan identities instead of both
    // silently resolving to the same unlabeled paid_tier row.
    p_plan: def.plan,
    // REPAIR 007: the trusted Temporary/Companion program identity. The RPC
    // itself (migration 018) computes the real 72h/30d trial_ends_at from
    // server now() whenever this is set, ignoring p_trial_ends_at below —
    // this client never supplies or fabricates a program's expiry.
    p_program: def.program,
    p_status: def.status,
    p_trial_started_at: now.toISOString(),
    p_trial_ends_at: trialEndsAt,
    p_promo_expires_at: promoExpiresAt,
  });
  if (error) throw error;
  if (!savedRow || savedRow.tier !== def.tier || savedRow.plan !== def.plan || savedRow.program !== def.program || savedRow.status !== def.status) {
    throw new Error('Subscription save could not be confirmed — the saved state did not match the requested account type.');
  }
}
