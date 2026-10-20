-- 072_r6_providers_intake_notifications_and_staff_writes.sql
-- ROUND 6 continuation — closes P06 (Medical Providers), P07 (Patient
-- Intake surfaced to authorized staff), O08 (Notification preferences),
-- and the write-access gaps blocking W03 (Quick Observation Entry) and
-- W10 (Care Team Invitations) in the new Enterprise Caregiver Portal
-- shell. Every change here follows the exact pattern already reviewed
-- and live-verified in migrations 067/070/071 — narrow, evidence-based
-- extensions of an existing authorization shape (caregiver_patients /
-- staff_patient_assignments dual-source check), never a broad rewrite.

-- ============================================================================
-- P06 — Medical Providers: no existing table carries this. Mirrors
-- migration 070's clinical-record tables exactly (has_patient_access()
-- for SELECT/INSERT, author_id = auth.uid() ownership, source
-- provenance).
-- ============================================================================
CREATE TABLE IF NOT EXISTS patient_care_providers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id     UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  provider_name  TEXT NOT NULL,
  provider_role  TEXT NOT NULL,
  phone          TEXT,
  email          TEXT,
  notes          TEXT,
  source         TEXT NOT NULL DEFAULT 'caregiver_report' CHECK (source IN ('verified_source', 'caregiver_report', 'professional_observation', 'unknown')),
  author_id      UUID NOT NULL REFERENCES profiles(id),
  created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE patient_care_providers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authorized caregivers/staff can view a patient's providers"
    ON patient_care_providers FOR SELECT
    USING (public.has_patient_access(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authorized caregivers/staff can record a patient's providers"
    ON patient_care_providers FOR INSERT
    WITH CHECK (author_id = auth.uid() AND public.has_patient_access(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.record_patient_provider(
  p_patient_id UUID, p_provider_name TEXT, p_provider_role TEXT,
  p_phone TEXT DEFAULT NULL, p_email TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'caregiver_report'
) RETURNS patient_care_providers AS $$
DECLARE
  v_row patient_care_providers;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.has_patient_access(p_patient_id) THEN RAISE EXCEPTION 'Not authorized for this patient'; END IF;
  IF p_source = 'professional_observation' AND NOT public.is_professional_staff_for_patient(p_patient_id) THEN
    RAISE EXCEPTION 'Only an assigned therapist or medical professional may record this as a professional observation';
  END IF;
  INSERT INTO patient_care_providers (patient_id, provider_name, provider_role, phone, email, notes, source, author_id)
  VALUES (p_patient_id, p_provider_name, p_provider_role, p_phone, p_email, p_notes, p_source, auth.uid())
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.record_patient_provider(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_patient_provider(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- P07 — Patient Intake: migration 009 granted SELECT only to
-- profiles.role IN ('admin','superadmin'). An authorized caregiver
-- (residential or Enterprise staff) for the SAME patient this intake
-- record names has no read path at all today — "complete care-relevant
-- intake... caregiver/emergency contacts" cannot be surfaced in either
-- patient record view without this. Read-only; intake remains
-- admin-reviewed/editable only (no change to that).
-- ============================================================================
DO $$ BEGIN
  CREATE POLICY "Authorized caregivers/staff can view their patient's intake record"
    ON patient_intake FOR SELECT
    USING (
      patient_profile_id IS NOT NULL
      AND (
        EXISTS (SELECT 1 FROM caregiver_patients cp WHERE cp.patient_id = patient_intake.patient_profile_id AND cp.caregiver_id = auth.uid())
        OR EXISTS (SELECT 1 FROM staff_patient_assignments spa WHERE spa.patient_id = patient_intake.patient_profile_id AND spa.user_id = auth.uid() AND spa.is_active = true)
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- O08 — Notification preferences: self-only, no RPC needed (every
-- operation is on the caller's own row).
-- ============================================================================
CREATE TABLE IF NOT EXISTS caregiver_notification_preferences (
  user_id                   UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  notify_messages           BOOLEAN NOT NULL DEFAULT true,
  notify_help_alerts        BOOLEAN NOT NULL DEFAULT true,
  notify_follow_up_due      BOOLEAN NOT NULL DEFAULT true,
  channel                   TEXT NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'email', 'in_app_and_email')),
  updated_at                TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE caregiver_notification_preferences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "A user can view their own notification preferences"
    ON caregiver_notification_preferences FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "A user can set their own notification preferences"
    ON caregiver_notification_preferences FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "A user can update their own notification preferences"
    ON caregiver_notification_preferences FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Delivery visibility is honest, not a guarantee: this table only ever
-- records a PREFERENCE, never a delivery receipt — "avoid
-- guaranteed-delivery claims" is satisfied structurally by this table
-- having no delivered/sent column for the client to misread as proof.

-- ============================================================================
-- W03 — Quick Observation Entry needs hydration/appetite/mobility/sleep
-- captured via care_partner_checkins, which today only an INSERTing
-- caregiver_patients-linked caregiver or the patient themselves may
-- write (023's RESTRICTIVE ownership check; migration 067 only ever
-- extended this table's SELECT for Enterprise staff, never INSERT).
-- Widen the RESTRICTIVE ownership check's OR-condition to also accept
-- an active staff_patient_assignments row, exactly mirroring the
-- caregiver_patients branch already there — and add the matching
-- PERMISSIVE staff INSERT policy (016's entitlement RESTRICTIVE policy
-- already covers Enterprise-covered patients via migration 050's
-- is_patient_enterprise_covered() unification, so no change needed
-- there). care_partner_notes gets the same staff INSERT extension for
-- the same reason (P12/W03 free-text A-G summaries).
-- ============================================================================
DO $$ BEGIN
  DROP POLICY IF EXISTS "Caller must be the check-in's own patient or linked caregiver (FQA-019/SEC-008)" ON care_partner_checkins;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Caller must be the check-in's own patient, linked caregiver, or assigned staff (FQA-019/SEC-008, extended R6)"
    ON care_partner_checkins AS RESTRICTIVE FOR INSERT
    WITH CHECK (
      patient_id = auth.uid()
      OR EXISTS (SELECT 1 FROM caregiver_patients cp WHERE cp.patient_id = care_partner_checkins.patient_id AND cp.caregiver_id = auth.uid())
      OR EXISTS (SELECT 1 FROM staff_patient_assignments spa WHERE spa.patient_id = care_partner_checkins.patient_id AND spa.user_id = auth.uid() AND spa.is_active = true)
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN RAISE NOTICE 'care_partner_checkins does not exist — skipped.';
END $$;

-- DISCOVERED THIS ROUND, FIXED HERE (adjacent to the RLS this migration
-- already touches on this exact table): 016_free_tier_entitlement_
-- backend_enforcement.sql's RESTRICTIVE entitlement check on
-- care_partner_checkins INSERT, and 023's RESTRICTIVE ownership check
-- (the one the DROP above targeted), were BOTH defined before
-- 027_staging_production_table_parity.sql actually creates this table
-- — each one's own `WHEN undefined_table THEN RAISE NOTICE '...
-- skipped'` branch fired silently at migration-run time, so neither
-- policy has ever actually existed on this table in this repo's real
-- migration order, confirmed via a direct `pg_policy` query against a
-- full `supabase db reset` replay this round. This is a pre-existing,
-- previously-undetected gap (Free-tier entitlement was never enforced
-- at the database layer for this specific table), not something this
-- round's own changes caused — recreating 016's policy here, now that
-- the table unambiguously exists at this point in migration order,
-- with zero change to its logic (same patient_has_paid_entitlement()
-- call, which migration 050 already unified with Enterprise coverage).
DO $$ BEGIN
  CREATE POLICY "Free-tier accounts cannot submit new care partner check-ins (REPAIR C, re-applied R6)"
    ON care_partner_checkins
    AS RESTRICTIVE
    FOR INSERT
    WITH CHECK (public.patient_has_paid_entitlement(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Assigned staff can submit check-ins for their patients"
    ON care_partner_checkins FOR INSERT
    WITH CHECK (
      submitted_by = auth.uid()
      AND EXISTS (SELECT 1 FROM staff_patient_assignments spa WHERE spa.patient_id = care_partner_checkins.patient_id AND spa.user_id = auth.uid() AND spa.is_active = true)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Assigned staff can create Care Partner notes for their patients"
    ON care_partner_notes FOR INSERT
    WITH CHECK (
      EXISTS (SELECT 1 FROM staff_patient_assignments spa WHERE spa.patient_id = care_partner_notes.patient_id AND spa.user_id = auth.uid() AND spa.is_active = true)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Assigned staff can update Care Partner notes for their patients"
    ON care_partner_notes FOR UPDATE
    USING (EXISTS (SELECT 1 FROM staff_patient_assignments spa WHERE spa.patient_id = care_partner_notes.patient_id AND spa.user_id = auth.uid() AND spa.is_active = true))
    WITH CHECK (EXISTS (SELECT 1 FROM staff_patient_assignments spa WHERE spa.patient_id = care_partner_notes.patient_id AND spa.user_id = auth.uid() AND spa.is_active = true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- W10 — Care Team Invitations: caregiver_invite_therapist() (THER-01/02
-- hardened, migration 065 is the current version) only recognizes
-- caregiver_patients. Widen its sole authorization check to also accept
-- an active staff_patient_assignments row — every other line (the
-- THER-02 FOR UPDATE row lock, the positive therapist-eligibility
-- check, the reinvite-vs-new-row branch) is preserved byte-for-byte
-- from 065, per this engagement's standing instruction to preserve
-- passing P0/P1 security corrections and never broadly rewrite working
-- security architecture.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.caregiver_invite_therapist(p_patient_id uuid, p_therapist_email text, p_relationship_type text DEFAULT 'consulting'::text)
RETURNS pending_therapist_connections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_therapist_id UUID;
  v_therapist_role TEXT;
  v_existing pending_therapist_connections;
  v_row pending_therapist_connections;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth.uid())
     AND NOT EXISTS (SELECT 1 FROM staff_patient_assignments WHERE patient_id = p_patient_id AND user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'You are not an authorized caregiver for this patient';
  END IF;
  IF p_relationship_type NOT IN ('primary','consulting','supervising','secondary') THEN
    RAISE EXCEPTION 'Invalid relationship type: %', p_relationship_type;
  END IF;

  SELECT id, role INTO v_therapist_id, v_therapist_role FROM profiles WHERE lower(email) = lower(btrim(p_therapist_email));
  IF v_therapist_id IS NULL THEN
    RAISE EXCEPTION 'No account was found for that email. Ask them to create a My Memoria Ally account first, then invite them.';
  END IF;
  IF v_therapist_id = p_patient_id THEN
    RAISE EXCEPTION 'The patient cannot be invited as their own therapist';
  END IF;
  IF v_therapist_role IS DISTINCT FROM 'therapist' THEN
    RAISE EXCEPTION 'This account has not been verified as a therapist and is not eligible to be invited in that capacity';
  END IF;

  IF EXISTS (SELECT 1 FROM therapist_relationships WHERE patient_id = p_patient_id AND therapist_id = v_therapist_id AND is_active = true) THEN
    RAISE EXCEPTION 'This person is already an active therapist for this patient';
  END IF;

  SELECT * INTO v_existing FROM pending_therapist_connections
  WHERE patient_id = p_patient_id AND therapist_id = v_therapist_id
  FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.status = 'pending' THEN
      RETURN v_existing;
    END IF;
    UPDATE pending_therapist_connections SET
      caregiver_id = auth.uid(), relationship_type = p_relationship_type, status = 'pending',
      created_at = now(), responded_at = NULL
    WHERE id = v_existing.id
    RETURNING * INTO v_row;
    RETURN v_row;
  END IF;

  INSERT INTO pending_therapist_connections (patient_id, caregiver_id, therapist_id, relationship_type)
  VALUES (p_patient_id, auth.uid(), v_therapist_id, p_relationship_type)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

-- ============================================================================
-- LIVE VERIFICATION (this round, local isolated Supabase stack): see
-- this round's handoff report for the exact fixture and raw HTTP
-- responses. Summary of what was exercised:
--   - record_patient_provider: positive insert + read by an assigned
--     Enterprise staff caregiver; professional_observation source
--     claim rejected for an ordinary caregiver; cross-tenant read by an
--     unrelated account returned empty.
--   - patient_intake SELECT: an assigned staff caregiver's read of
--     their patient's intake record succeeded; an unrelated account's
--     read returned empty.
--   - caregiver_notification_preferences: self-row set/read succeeded;
--     a second account's attempt to read/update the first account's row
--     returned empty/denied.
--   - care_partner_checkins/notes INSERT: an assigned Enterprise staff
--     caregiver's submission of each now succeeds; an unrelated
--     account's attempt is still denied (both RESTRICTIVE and
--     PERMISSIVE layers).
--   - caregiver_invite_therapist: an Enterprise staff caregiver (no
--     caregiver_patients row at all) successfully invited a real
--     verified therapist account; the THER-01 non-therapist-account
--     rejection and THER-02 reinvite/FOR UPDATE behavior were
--     unaffected (regression-checked against the pre-existing test
--     suite for this function).
