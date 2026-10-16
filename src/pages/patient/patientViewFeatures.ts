import type { FeatureKey } from '@/types/subscription';

export type PatientView =
  | 'dashboard'
  | 'medications'
  | 'routines'
  | 'memories'
  | 'mood'
  | 'documents'
  | 'reminders'
  | 'checkin'
  | 'intake'
  | 'emergency_contacts'
  | 'careteam'
  | 'media'
  | 'games';

// MYMEMORIA-FUNCTIONAL-REPAIR-005 / REPAIR B: this used to be a completely
// separate, hardcoded, PatientView-keyed map — the actual single
// authoritative entitlement policy, src/types/subscription.ts's
// FEATURE_ACCESS (read here only through useSubscription().can(), never
// duplicated), had no say in it at all, and the two disagreed outright
// (e.g. this map locked 'documents'/'media' as paid-only while
// FEATURE_ACCESS already granted them to free_tier). VIEW_FEATURE below
// replaces it: every gated view now maps to the FeatureKey that actually
// authorizes it, so nav visibility and in-view authorization are always
// reading the exact same policy. A view absent from this map carries no
// FeatureKey in the approved matrix at all and is never feature-gated —
// dashboard/intake/emergency_contacts/careteam are core account functions;
// 'mood' here is basic mood logging, distinct from the separately-gated
// 'mood_history' trends/analytics FeatureKey.
// RELEASE-BLOCKER-CLOSURE PHASE 2: split out of PatientLayout.tsx, which
// otherwise exports both a component (PatientLayout) and these constants —
// Vite Fast Refresh (react-refresh/only-export-components) requires a
// component-exporting file to export components only. Still exported
// solely so REPAIR E's regression tests can assert nav-gating data
// directly against the canonical FEATURE_ACCESS matrix — no behavior
// change.
export const VIEW_FEATURE: Partial<Record<PatientView, FeatureKey>> = {
  checkin:     'care_partner_checkin',
  reminders:   'reminders_unlimited',
  memories:    'memories_unlimited',
  documents:   'documents',
  media:       'media',
  games:       'games',
  medications: 'medications',
};

// 'routines' ("My Day") has no FeatureKey anywhere in the approved
// entitlement matrix — it is neither one of the three approved free-tier
// features nor named among the existing paid-only FeatureKeys this repair
// preserves. Inventing a new FeatureKey for it is out of scope ("do not
// invent... new features"). Preserved exactly as it already behaved
// (paid-tier/master only) — gated on the SAME canonical tier/isActive
// values useSubscription() exposes everywhere else, not a separate,
// parallel entitlement source — rather than silently un-gated or
// permanently locked with no path to resolve.
// *** OPEN OWNER DECISION (not resolved here): *** either approve a real
// FeatureKey for "My Day" routines, or confirm it stays bundled with paid
// tier indefinitely.
export const PAID_TIER_VIEWS_WITHOUT_A_FEATURE_KEY = new Set<PatientView>(['routines']);
