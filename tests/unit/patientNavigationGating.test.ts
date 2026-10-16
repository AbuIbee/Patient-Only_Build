// MYMEMORIA-FUNCTIONAL-REPAIR-005 / REPAIR B + E regression tests.
// Asserts that PatientLayout's navigation-gating data (VIEW_FEATURE) is
// never out of sync with the canonical entitlement matrix
// (src/types/subscription.ts) — the exact defect this repair fixed
// (PAID_ONLY_VIEWS used to be a separate, hardcoded, disagreeing map).
// No React rendering — the gating data now lives in its own module
// (patientViewFeatures.ts, split out of PatientLayout.tsx under
// RELEASE-BLOCKER-CLOSURE PHASE 2 to satisfy react-refresh/only-export-
// components) with no '@/lib/supabase' dependency, so no client-bootstrap
// mocking is needed to import it for its exported data constants.
import { describe, it, expect } from 'vitest';
import { hasFeatureAccess, type FeatureKey } from '@/types/subscription';

import {
  VIEW_FEATURE,
  PAID_TIER_VIEWS_WITHOUT_A_FEATURE_KEY,
  type PatientView,
} from '@/pages/patient/patientViewFeatures';

describe('VIEW_FEATURE — single authoritative policy (REPAIR B requirement 3)', () => {
  it('every gated view maps to a real FeatureKey the canonical matrix recognizes', () => {
    for (const feature of Object.values(VIEW_FEATURE)) {
      expect(() => hasFeatureAccess('free_tier', feature as FeatureKey)).not.toThrow();
    }
  });

  it('the three approved free features are reachable (at minimum, Medications — media/documents have no dedicated nav view of their own gated entry here, confirmed free either way)', () => {
    expect(VIEW_FEATURE.medications).toBe('medications');
    expect(VIEW_FEATURE.media).toBe('media');
    expect(VIEW_FEATURE.documents).toBe('documents');
  });

  it('medications, media, and documents views are NEVER locked for free_tier (the three approved features)', () => {
    const freeViews: PatientView[] = ['medications', 'media', 'documents'];
    for (const view of freeViews) {
      const feature = VIEW_FEATURE[view]!;
      expect(hasFeatureAccess('free_tier', feature)).toBe(true);
    }
  });

  it('every OTHER mapped view (paid-only features) is locked for free_tier — matches the corrected 5-feature restriction', () => {
    const paidOnlyViews: PatientView[] = ['checkin', 'reminders', 'memories', 'games'];
    for (const view of paidOnlyViews) {
      const feature = VIEW_FEATURE[view]!;
      expect(hasFeatureAccess('free_tier', feature)).toBe(false);
    }
  });

  it('every mapped view is unlocked for paid_tier and master', () => {
    for (const feature of Object.values(VIEW_FEATURE)) {
      expect(hasFeatureAccess('paid_tier', feature as FeatureKey)).toBe(true);
      expect(hasFeatureAccess('master', feature as FeatureKey)).toBe(true);
    }
  });

  it('REPAIR B requirement 2 regression: documents and media are NOT in the paid-only view set (the exact bug this repair fixed — they used to be hardcoded paid-only here despite always being free in FEATURE_ACCESS)', () => {
    expect(VIEW_FEATURE.documents).toBeDefined();
    expect(hasFeatureAccess('free_tier', VIEW_FEATURE.documents!)).toBe(true);
    expect(hasFeatureAccess('free_tier', VIEW_FEATURE.media!)).toBe(true);
  });

  it('views with no FeatureKey (core/ungated) are not in VIEW_FEATURE at all', () => {
    const ungated: PatientView[] = ['dashboard', 'mood', 'intake', 'emergency_contacts', 'careteam'];
    for (const view of ungated) {
      expect(VIEW_FEATURE[view]).toBeUndefined();
    }
  });

  it('the one orphan view with no approved FeatureKey (routines) is tracked explicitly, not silently free or silently invented a key', () => {
    expect(VIEW_FEATURE.routines).toBeUndefined();
    expect(PAID_TIER_VIEWS_WITHOUT_A_FEATURE_KEY.has('routines')).toBe(true);
  });

  it('REPAIR 006 — Daily Care unlocks every nav view VIEW_FEATURE gates (all five are Daily-Care-level features; none of this map requires Full Support specifically)', () => {
    for (const feature of Object.values(VIEW_FEATURE)) {
      expect(hasFeatureAccess('paid_tier', feature as FeatureKey, 'daily_care')).toBe(true);
    }
  });

  it('REPAIR 006 — Full Support also unlocks every nav view VIEW_FEATURE gates (a superset of Daily Care)', () => {
    for (const feature of Object.values(VIEW_FEATURE)) {
      expect(hasFeatureAccess('paid_tier', feature as FeatureKey, 'full_support')).toBe(true);
    }
  });

  it('REPAIR 006 — a legacy paid_tier account with no plan identifier is not locked out of any nav view it could already reach (requirement 7 — no silent revocation)', () => {
    for (const feature of Object.values(VIEW_FEATURE)) {
      expect(hasFeatureAccess('paid_tier', feature as FeatureKey, null)).toBe(true);
    }
  });
});
