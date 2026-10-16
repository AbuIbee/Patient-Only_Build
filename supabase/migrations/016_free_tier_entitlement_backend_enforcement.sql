-- 016_free_tier_entitlement_backend_enforcement.sql
-- MYMEMORIA-FUNCTIONAL-REPAIR-005 — REPAIR C: trusted server-side
-- enforcement for the corrected free-tier entitlement matrix
-- (src/types/subscription.ts FEATURE_ACCESS, corrected in this same
-- repair pass to exactly three free-tier features: medications, media,
-- documents).
--
-- PROPOSAL ONLY — NOT EXECUTED. See header note in 002_identity_and_role_contract.sql.
-- This file has not been run against any database.
--
-- WHY THIS FILE EXISTS: FEATURE_ACCESS / hasFeatureAccess() / useSubscription
-- ().can() / FeatureGate / PatientLayout's nav-and-view locking are ALL
-- client-side TypeScript. Nothing in any tracked migration (001-015) has
-- ever enforced subscription tier at the database layer for ANY table —
-- every RLS policy on memories/reminders/care_partner_checkins/etc. is
-- scoped by PATIENT OWNERSHIP or CAREGIVER AUTHORIZATION only, never by
-- tier. Before this repair, that was fine: reminders_unlimited,
-- care_partner_checkin, memories_unlimited, voice_messages, and ai_voices
-- were ALL free_tier features, so a free_tier patient using them via a
-- direct API call (bypassing the UI) was not actually doing anything
-- unauthorized. Now that those five are paid_tier/master-only, the SAME
-- direct-API path would let a free_tier account use a feature the UI
-- correctly hides — "client-side feature checks must not be represented
-- as backend security enforcement" (this repair order's own requirement)
-- is exactly the gap this file closes, for the two tables this engagement
-- can confirm enough about to do so safely.

-- ============================================================
-- SCOPE, PRECISELY
-- ============================================================
-- Of the five FeatureKeys that moved from free_tier to paid_tier/master in
-- this repair pass:
--   - memories_unlimited  → `memories` table: CLOSED below (confirmed
--     schema via 001_initial_schema.sql; confirmed INSERT call site in
--     tracked application code).
--   - care_partner_checkin → `care_partner_checkins` table: CLOSED below
--     (confirmed INSERT call site + exact column names in
--     src/pages/patient/CarePartnerCheckin.tsx; table itself is NOT
--     defined in any tracked migration — same "tracked != live" situation
--     `subscriptions` was in before 010-013 — but RESTRICTIVE policies do
--     not need to know or match whatever PERMISSIVE policy already exists
--     on this table, only the table and column names, which the
--     application's own confirmed INSERT call supplies).
--   - reminders_unlimited → NOT ACTED ON. `grep -rn "from('reminders')"
--     src/` shows exactly one call site in the entire tracked codebase
--     (PatientLayout.tsx's own SELECT of the patient's existing reminders)
--     and ZERO insert/update/delete call sites anywhere. There is no
--     patient-initiated write path to this table in tracked application
--     code to restrict — reminders appear to be created by some other,
--     untracked process (an admin/caregiver tool, or a different app
--     surface outside this repo). Adding a write restriction here would
--     be guessing at a write path that may not exist, and reading a
--     patient's OWN already-existing reminders is explicitly NOT something
--     this repair should newly block ("do not remove legitimate user
--     access to previously stored data"). No migration change for this
--     table; flagged as a blocker below, not silently assumed safe.
--   - voice_messages, ai_voices → NOT ACTED ON. Confirmed via
--     PatientLayout.tsx's own logout handler (the list of localStorage
--     keys it clears: `customVoiceUrl`, `customVoiceBase64`,
--     `customVoiceLabel`, `selectedVoice`) that these are CLIENT-SIDE /
--     browser-localStorage features with no backing Supabase table at
--     all. There is nothing in Postgres to write an RLS policy against.
--     Enforcing these two server-side would require moving them to a real
--     backed table or a dedicated trusted endpoint first — new
--     infrastructure, not a bounded correction, and this repair order does
--     not call for it. Flagged as a blocker, not invented.
--
-- `medications`, `media`, `documents` (the three APPROVED free features)
-- are untouched by this file — they are free for every tier, so there is
-- nothing to newly restrict for them.
--
-- APPROACH: a RESTRICTIVE policy (ANDed with whatever PERMISSIVE
-- ownership/caregiver-authorization policy already exists on each table,
-- rather than replacing it) that only applies to INSERT — i.e. creating a
-- NEW row. SELECT/UPDATE/DELETE on rows a patient or their caregiver
-- already legitimately created are completely untouched, regardless of
-- the patient's CURRENT tier — satisfies "do not remove legitimate user
-- access to previously stored data merely because a feature is no longer
-- included in the standard free subscription." The entitlement check is
-- keyed on the PATIENT's own subscriptions row (`s.user_id = patient_id`
-- on the new row) — identity-blind as to whether the caller is the
-- patient or an authorized caregiver inserting on their behalf, since
-- what's being gated is the PATIENT's record/entitlement, not the
-- caller's own.
--
-- "Active" is defined identically to src/types/subscription.ts's
-- isSubscriptionActive(): status='active', or status='promo' with no
-- expiry or an unexpired one. No new status interpretation is invented;
-- canceled/expired/past_due/pending_payment patients are excluded by
-- simply not matching this existing definition — not a new assumption
-- about those statuses specifically.
--
-- RLS is assumed already enabled on both tables (CLAUDE.md: "Row-level
-- security is enabled on all tables" — a documented project invariant,
-- not a guess this file makes independently). This file does NOT issue
-- `ENABLE ROW LEVEL SECURITY` for `care_partner_checkins` (untracked table)
-- — doing so blind, if RLS were somehow NOT already enabled there, would
-- deny ALL access by default the moment it's turned on with no
-- comprehensive existing policy set to fall back on. That would be exactly
-- the "silently disable existing patient-data access" this repair order
-- prohibits. If RLS is NOT already enabled on this table, this migration's
-- RESTRICTIVE policy has no effect at all (fails closed toward "no change"
-- in that scenario, not toward "unexpectedly lock everyone out").

CREATE OR REPLACE FUNCTION public.patient_has_paid_entitlement(p_patient_id UUID)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = p_patient_id
      AND s.tier IN ('paid_tier', 'master')
      AND (
        s.status = 'active'
        OR (s.status = 'promo' AND (s.promo_expires_at IS NULL OR s.promo_expires_at > now()))
      )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.patient_has_paid_entitlement IS 'REPAIR C (FUNCTIONAL-REPAIR-005): single source of truth for "does this patient currently have paid/master entitlement", mirroring src/types/subscription.ts isSubscriptionActive() + tier check exactly. SECURITY DEFINER so a RESTRICTIVE policy using it can read the subscriptions row regardless of which role (patient or caregiver) is performing the gated INSERT — it reads no caller-supplied state beyond the patient id already present on the row being inserted.';

REVOKE ALL ON FUNCTION public.patient_has_paid_entitlement(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.patient_has_paid_entitlement(UUID) TO authenticated;

-- ── memories: gate NEW memory creation only ─────────────────────────────
DO $$ BEGIN
  CREATE POLICY "Free-tier accounts cannot create new memories (REPAIR C)"
    ON memories
    AS RESTRICTIVE
    FOR INSERT
    WITH CHECK (public.patient_has_paid_entitlement(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── care_partner_checkins: gate NEW check-in submission only ────────────
-- Table/column evidence: src/pages/patient/CarePartnerCheckin.tsx's own
-- `.from('care_partner_checkins').insert({ patient_id: ..., ... })` call —
-- not from any tracked migration, since none defines this table.
DO $$ BEGIN
  CREATE POLICY "Free-tier accounts cannot submit new care partner check-ins (REPAIR C)"
    ON care_partner_checkins
    AS RESTRICTIVE
    FOR INSERT
    WITH CHECK (public.patient_has_paid_entitlement(patient_id));
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN
    RAISE NOTICE 'care_partner_checkins does not exist in this database — skipped. This table is not defined in any tracked migration; confirm its real name/shape before relying on this policy.';
END $$;

-- ============================================================
-- BLOCKERS (explicitly not resolved by this file — reported, not guessed)
-- ============================================================
-- 1. `reminders_unlimited`: no patient-initiated write path found anywhere
--    in tracked application code to restrict. If one exists outside this
--    repo (a caregiver tool, an admin screen, a different client), it is
--    invisible to this engagement and therefore not addressed here.
-- 2. `voice_messages` / `ai_voices`: client-side/localStorage only, no
--    backing table — cannot be enforced at the database layer without
--    first building real backend storage for them, which this repair does
--    not do.
-- 3. `care_partner_checkins` table shape is entirely unconfirmed beyond
--    the one INSERT call site's column names — if the real live table
--    uses different column names than `patient_id`, or RLS is not actually
--    enabled on it, this policy silently has no effect (fails toward "no
--    change", per this file's own stated design) rather than erroring.
--    Confirm the live schema before relying on this policy in any
--    environment.
-- 4. Existing `memories`/`care_partner_checkins` rows created under the
--    OLD (free_tier-inclusive) entitlement are completely untouched —
--    this file does not retroactively revoke, flag, or re-validate
--    anything already stored. Whether a now-free-tier patient should
--    retain full read/write access to memories or check-ins they created
--    while still entitled is the EXACT "record-retention and post-
--    entitlement access policy remains subject to owner approval"
--    question this repair order itself defers — not resolved here,
--    and this file's RESTRICTIVE policy (INSERT-only) does not touch it
--    either way.

-- ============================================================
-- STAGING-ONLY AUTHORIZATION TESTS (described for the owner to run in an
-- isolated environment; NOT executed by this migration file or by this
-- engagement — no isolated test database exists)
-- ============================================================
-- T1 (negative): a patient with subscriptions.tier='free_tier',
--   status='active' attempts `insert into memories (patient_id, title,
--   category, created_by) values (auth.uid(), 'x', 'photo', auth.uid())`
--   directly (bypassing the UI). Expected: denied by the new RESTRICTIVE
--   policy, even though the pre-existing PERMISSIVE policy would otherwise
--   allow it.
-- T2 (positive): same attempt, but the patient's subscriptions row has
--   tier='paid_tier', status='active'. Expected: succeeds — unaffected,
--   paid patients are never newly restricted.
-- T3 (positive, promo): same attempt with tier='paid_tier',
--   status='promo', promo_expires_at in the future. Expected: succeeds.
-- T4 (negative, expired promo): same as T3 but promo_expires_at in the
--   past. Expected: denied — matches isSubscriptionActive()'s own
--   definition of an expired promo as not active.
-- T5 (positive, master): tier='master' (any status). Expected: succeeds.
-- T6 (positive, caregiver-initiated on behalf of a paid patient):
--   caregiver B, authorized via caregiver_patients for patient P
--   (tier='paid_tier', status='active'), inserts a memory with
--   patient_id=P. Expected: succeeds — the check reads P's entitlement,
--   not B's.
-- T7 (negative, caregiver-initiated on behalf of a free-tier patient):
--   same caregiver B, patient P now free_tier. Expected: denied —
--   identical outcome regardless of who the caller is, since the gate is
--   patient-identity-blind by design.
-- T8 (positive, pre-existing data untouched): a free-tier patient who
--   already has memories/check-ins from before this migration performs a
--   SELECT (and, if the existing permissive UPDATE/DELETE policies allow
--   it independent of this file, an UPDATE/DELETE) of their OWN existing
--   rows. Expected: unaffected — this policy is FOR INSERT only.
-- T9 (regression — existing rows preserved): snapshot row counts for both
--   tables before/after applying this migration. Expected: identical —
--   this file adds one function and (at most) two RESTRICTIVE policies;
--   it does not touch any row.
