-- 076_r7_mastercorrective_sec01-06_func01.sql
-- MASTER CORRECTIVE ENGINEERING ORDER — Phase A (SEC-01..SEC-06) + FUNC-01.
-- Every fix below was root-caused against a real, independently
-- reproduced Codex finding (codex_round7_independent_audit/, baseline
-- label codex-round7-b7352408). Each defect's exact mechanism and the
-- live evidence that confirmed it are recorded inline. See
-- 37_MASTERCORRECTIVE_FINDING_REGISTER.md for the consolidated register.

-- ============================================================================
-- SEC-01 — CONFIRMED DEFECT (DEFECT-THER-ACCEPT-REVOKE-RACE /
-- DEFECT-THER-RACE-RETAINS-WRITE, concurrency_test.py): a concurrent
-- accept (holding FOR UPDATE on the pending_therapist_connections row
-- for the full duration of its transaction) racing a revoke left the
-- connection row 'revoked' but therapist_relationships.is_active
-- permanently 'true' -- the revoked therapist could still write a
-- professional note afterwards (HTTP 201, 1 persisted row).
--
-- ROOT CAUSE: migration 065/074's revoke_therapist_connection() ran its
-- `UPDATE therapist_relationships SET is_active = false ...` BEFORE
-- locking (FOR UPDATE) the pending_therapist_connections row. When a
-- concurrent accept is mid-flight, that UPDATE finds no relationship
-- row yet (the accept hasn't created/reactivated it) and is a no-op.
-- Only the SECOND statement (the connection lock) actually serializes
-- against the accept, but by then the relationship-deactivation
-- statement has already run and will never run again -- the lock
-- establishes the correct ordering too late to matter.
--
-- FIX: acquire the serializing lock on pending_therapist_connections
-- FIRST. Only once that lock resolves (i.e. after any concurrent
-- accept has fully committed, or found no row to block on) do we
-- deactivate therapist_relationships -- so a relationship created or
-- reactivated by a concurrent accept is always visible to, and
-- deactivated by, a revoke that is still in flight when the accept
-- commits.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.revoke_therapist_connection(p_patient_id uuid, p_therapist_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_conn pending_therapist_connections;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth.uid())
     AND NOT EXISTS (SELECT 1 FROM staff_patient_assignments WHERE patient_id = p_patient_id AND user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'You are not an authorized caregiver for this patient';
  END IF;

  -- SEC-01: lock the connection row FIRST -- this is the single
  -- serialization point against a concurrent respond_to_therapist_invite().
  SELECT * INTO v_conn FROM pending_therapist_connections
  WHERE patient_id = p_patient_id AND therapist_id = p_therapist_id
  FOR UPDATE;

  IF v_conn.id IS NOT NULL AND v_conn.status IN ('pending', 'accepted') THEN
    UPDATE pending_therapist_connections SET status = 'revoked', responded_at = now()
    WHERE id = v_conn.id;
  END IF;

  -- Only after the lock above has resolved -- so a relationship a
  -- concurrent accept just created/reactivated is always caught here.
  UPDATE therapist_relationships SET is_active = false, updated_at = now()
  WHERE patient_id = p_patient_id AND therapist_id = p_therapist_id;

  RETURN true;
END;
$function$;

-- ============================================================================
-- SEC-02 (part 1 of 3) — CONFIRMED DEFECT (DEFECT-AMENDMENT-AFTER-REVOCATION,
-- security_tests.py): after an Enterprise caregiver's staff_patient_
-- assignments row was deactivated, that same caregiver's call to
-- record_note_amendment() on their own prior 'general' note still
-- succeeded and persisted a new row.
--
-- ROOT CAUSE: migration 075's record_note_amendment() only re-checked
-- authorship (author_id = auth.uid()) and, for the two professional
-- note types, a professional-tier eligibility helper. For every other
-- note_type (general/medical/behavior/mood/activity) there was no
-- re-check of the author's CURRENT access to the patient at all --
-- amendment never re-validated what the original note's own INSERT
-- policy already required.
--
-- FIX: require public.has_patient_access() for every note type, not
-- only the two professional ones, before an amendment may be authored.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_note_amendment(
  p_original_note_id UUID, p_corrected_note TEXT
) RETURNS patient_notes AS $$
DECLARE
  v_original patient_notes;
  v_row patient_notes;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_original FROM patient_notes WHERE id = p_original_note_id;
  IF v_original.id IS NULL THEN RAISE EXCEPTION 'No such note'; END IF;
  IF v_original.author_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the original author may amend this note';
  END IF;
  IF NOT public.has_patient_access(v_original.patient_id) THEN
    RAISE EXCEPTION 'Your authorization for this patient has ended';
  END IF;
  IF v_original.note_type = 'therapist_session' AND NOT public.is_therapist_for_patient(v_original.patient_id) THEN
    RAISE EXCEPTION 'Not authorized to amend this therapist session note';
  ELSIF v_original.note_type = 'clinical_observation' AND NOT public.is_medical_professional_for_patient(v_original.patient_id) THEN
    RAISE EXCEPTION 'Not authorized to amend this clinical observation note';
  END IF;

  INSERT INTO patient_notes (patient_id, author_id, caregiver_id, note, note_type, amends_note_id)
  VALUES (v_original.patient_id, auth.uid(), v_original.caregiver_id, p_corrected_note, v_original.note_type, p_original_note_id)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- SEC-02 (part 2 of 3) + FUNC-01 — CONFIRMED DEFECTS (DEFECT-VISIT-
-- START-AFTER-REVOCATION, DEFECT-VISIT-END-AFTER-REVOCATION,
-- DEFECT-VISIT-NOTES-NOT-REQUIRED, security_tests.py): a caregiver
-- whose staff_patient_assignments row had been deactivated could still
-- start and end a visit for that patient; a visit could be completed
-- with NULL visit_notes.
--
-- ROOT CAUSE: start_caregiver_visit()/end_caregiver_visit() (migration
-- 068) only ever checked `caregiver_id = auth.uid()` -- ownership of
-- the visit row itself, which never changes -- never re-checking
-- whether that caregiver's authorization over the PATIENT is still
-- active. end_caregiver_visit() also accepted a NULL p_visit_notes
-- despite the locked requirement (W01): "capture start/end times and
-- required visit notes."
--
-- FIX: both functions now re-verify current authorization
-- (staff_patient_assignments.is_active OR caregiver_patients) at the
-- mutation boundary, not just historical visit ownership. Completion
-- now requires non-empty visit_notes -- no payer-specific EVV rule
-- invented, exactly the locked requirement's own words.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.start_caregiver_visit(p_visit_id UUID, p_latitude DOUBLE PRECISION DEFAULT NULL, p_longitude DOUBLE PRECISION DEFAULT NULL)
RETURNS caregiver_visits
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_row caregiver_visits;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_row FROM caregiver_visits WHERE id = p_visit_id AND caregiver_id = auth.uid() FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No such visit for this caregiver'; END IF;
  IF NOT EXISTS (SELECT 1 FROM staff_patient_assignments WHERE patient_id = v_row.patient_id AND user_id = auth.uid() AND is_active = true)
     AND NOT EXISTS (SELECT 1 FROM caregiver_patients WHERE patient_id = v_row.patient_id AND caregiver_id = auth.uid()) THEN
    RAISE EXCEPTION 'Your authorization for this patient has ended';
  END IF;
  IF v_row.status NOT IN ('scheduled', 'missed') THEN RAISE EXCEPTION 'This visit cannot be started from its current status'; END IF;
  UPDATE caregiver_visits SET status = 'in_progress', actual_start = now(), evv_latitude = p_latitude, evv_longitude = p_longitude, updated_at = now()
  WHERE id = p_visit_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.end_caregiver_visit(p_visit_id UUID, p_visit_notes TEXT DEFAULT NULL)
RETURNS caregiver_visits
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_row caregiver_visits;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_row FROM caregiver_visits WHERE id = p_visit_id AND caregiver_id = auth.uid() FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No such visit for this caregiver'; END IF;
  IF NOT EXISTS (SELECT 1 FROM staff_patient_assignments WHERE patient_id = v_row.patient_id AND user_id = auth.uid() AND is_active = true)
     AND NOT EXISTS (SELECT 1 FROM caregiver_patients WHERE patient_id = v_row.patient_id AND caregiver_id = auth.uid()) THEN
    RAISE EXCEPTION 'Your authorization for this patient has ended';
  END IF;
  IF v_row.status != 'in_progress' THEN RAISE EXCEPTION 'This visit is not currently in progress'; END IF;
  IF btrim(COALESCE(p_visit_notes, '')) = '' THEN
    RAISE EXCEPTION 'Visit notes are required to complete this visit';
  END IF;
  UPDATE caregiver_visits SET status = 'completed', actual_end = now(), visit_notes = p_visit_notes, updated_at = now()
  WHERE id = p_visit_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

-- ============================================================================
-- SEC-02 (part 3 of 3) is the revocation re-check already present in
-- is_therapist_for_patient()/is_medical_professional_for_patient()
-- (migration 044/064) -- both already re-check is_active at call time,
-- so no change is needed there; SEC-01's fix above is what makes that
-- re-check see the correct state during a race.
-- ============================================================================

-- ============================================================================
-- SEC-03 (part 1 of 2) — CONFIRMED DEFECT (DEFECT-DIRECT-VERIFIED-CODE-STATUS,
-- security_tests.py): a direct `PATCH /rest/v1/patients` as the PATIENT
-- themselves set code_status='dnr', code_status_source='verified_source'
-- and it persisted -- completely bypassing record_patient_safety_plan()'s
-- professional gate.
--
-- ROOT CAUSE: migration 004's "Patients can update their own patient
-- record" policy (USING/WITH CHECK id = auth.uid()) is row-scoped, not
-- column-scoped -- it was written for ordinary profile fields and never
-- excluded the later-added provenance-sensitive columns. The RPC-level
-- gate in record_patient_safety_plan()/record_communication_needs() is
-- not an independent invariant: any other UPDATE path (direct REST,
-- a future RPC, an admin tool) can set these columns to any value with
-- no re-validation at all.
--
-- FIX: a BEFORE INSERT OR UPDATE trigger on patients re-validates the
-- professional-tier gate for code_status/code_status_source and
-- communication_needs_source on every write, through every path, and
-- forces the *_updated_by actor columns to the authenticated caller --
-- never a client-supplied value. This is the same invariant the RPCs
-- already enforce, now made structural rather than only RPC-level.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_patient_safety_plan_provenance()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.code_status IS DISTINCT FROM OLD.code_status OR NEW.code_status_source IS DISTINCT FROM OLD.code_status_source THEN
    IF NEW.code_status_source IN ('verified_source', 'professional_observation') AND NOT public.is_professional_staff_for_patient(NEW.id) THEN
      RAISE EXCEPTION 'Only an assigned therapist or medical professional may verify a code status';
    END IF;
    IF TG_OP = 'UPDATE' THEN
      NEW.code_status_updated_by := auth.uid();
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.communication_needs_source IS DISTINCT FROM OLD.communication_needs_source THEN
    IF NEW.communication_needs_source = 'professional_observation' AND NOT public.is_professional_staff_for_patient(NEW.id) THEN
      RAISE EXCEPTION 'Only an assigned therapist or medical professional may record this as a professional observation';
    END IF;
    NEW.communication_needs_updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_patients_safety_plan_provenance ON patients;
CREATE TRIGGER trg_patients_safety_plan_provenance
BEFORE INSERT OR UPDATE ON patients
FOR EACH ROW EXECUTE FUNCTION public.enforce_patient_safety_plan_provenance();

-- ============================================================================
-- SEC-03 (part 2 of 2) — CONFIRMED DEFECT (DEFECT-DIRECT-PROFESSIONAL-
-- patient_diagnoses/patient_allergies/patient_vitals, [script not
-- preserved; reproduced independently below from the documented
-- preconditions in seed_fixture.py/executed_results.jsonl -- an
-- ordinary caregiver with has_patient_access() but no professional
-- staff_patient_assignments row directly POSTed to these three tables
-- with source='professional_observation' and it persisted, HTTP 201]).
--
-- ROOT CAUSE: migration 070's own comment claims "the RLS WITH CHECK
-- alone cannot see the `source` value cleanly" -- this is incorrect;
-- a WITH CHECK expression can reference any column of the row being
-- written directly. The INSERT policies only ever checked
-- author_id/has_patient_access(), never the source column's claimed
-- provenance tier, so the professional-tier gate lived ONLY inside the
-- record_patient_*() RPCs and was trivially bypassed by direct REST.
--
-- FIX: a RESTRICTIVE INSERT policy per table, ANDed with the existing
-- permissive policy, enforcing the identical tier check the RPCs
-- already perform -- now a durable table-level invariant.
-- ============================================================================
DO $$ BEGIN
  CREATE POLICY "Only professional staff may claim a verified or professional_observation source"
    ON patient_diagnoses AS RESTRICTIVE FOR INSERT
    WITH CHECK (source NOT IN ('verified_source', 'professional_observation') OR public.is_professional_staff_for_patient(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Only professional staff may claim a verified or professional_observation source"
    ON patient_allergies AS RESTRICTIVE FOR INSERT
    WITH CHECK (source NOT IN ('verified_source', 'professional_observation') OR public.is_professional_staff_for_patient(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Only professional staff may claim a verified or professional_observation source"
    ON patient_vitals AS RESTRICTIVE FOR INSERT
    WITH CHECK (source NOT IN ('verified_source', 'professional_observation') OR public.is_professional_staff_for_patient(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- SEC-04 — CONFIRMED DEFECT (DEFECT-ORDINARY-CAREGIVER-SUPERSEDES-
-- CAREPLAN, [script not preserved; reproduced independently below] --
-- an ordinary caregiver, authorized for the patient but holding no
-- therapist/medical_professional staff_patient_assignments role,
-- called record_patient_care_plan() and successfully superseded an
-- existing current care plan: the prior row's is_current flipped to
-- false and a new row was inserted under the ordinary caregiver's own
-- author_id).
--
-- ROOT CAUSE: record_patient_care_plan() only required
-- has_patient_access() -- the same bar as reading the chart -- never a
-- clinical-authority check, despite P08's "distinguish orders from
-- patient preferences" and the supersession being an irreversible,
-- auditable clinical transition (migration 070's INSERT policy was
-- equally unrestricted).
--
-- FIX: require public.is_professional_staff_for_patient() to author or
-- supersede a care plan, both in the RPC and as a RESTRICTIVE
-- table-level invariant -- the same pattern already proven for therapy
-- goals.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_patient_care_plan(
  p_patient_id UUID, p_goals TEXT, p_permitted_tasks TEXT DEFAULT NULL, p_effective_date DATE DEFAULT CURRENT_DATE
) RETURNS patient_care_plans
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_row patient_care_plans; v_next_version INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_professional_staff_for_patient(p_patient_id) THEN
    RAISE EXCEPTION 'Only an assigned therapist or medical professional may author or supersede a care plan';
  END IF;
  IF btrim(COALESCE(p_goals, '')) = '' THEN RAISE EXCEPTION 'Care plan goals are required'; END IF;
  SELECT COALESCE(max(version), 0) + 1 INTO v_next_version FROM patient_care_plans WHERE patient_id = p_patient_id;
  UPDATE patient_care_plans SET is_current = false WHERE patient_id = p_patient_id AND is_current = true;
  INSERT INTO patient_care_plans (patient_id, goals, permitted_tasks, effective_date, version, author_id, is_current)
  VALUES (p_patient_id, p_goals, p_permitted_tasks, p_effective_date, v_next_version, auth.uid(), true)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

DO $$ BEGIN
  CREATE POLICY "Only professional staff may author or supersede a care plan"
    ON patient_care_plans AS RESTRICTIVE FOR INSERT
    WITH CHECK (public.is_professional_staff_for_patient(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- SEC-05 — CONFIRMED DEFECT (DEFECT-TASK-AUDIT-IDENTITY-FORGERY,
-- [script not preserved; reproduced independently below] -- a direct
-- PATCH to /rest/v1/tasks setting status_updated_by to an arbitrary
-- OTHER user's id persisted successfully).
--
-- ROOT CAUSE: migration 071 added status_updated_by/status_updated_at
-- as plain client-settable columns with no trigger forcing them to
-- reflect the true caller -- any caller permitted to UPDATE the row at
-- all (residential caregiver_patients or staff_patient_assignments
-- policies) could set this audit column to literally anyone's id.
--
-- FIX: a BEFORE UPDATE trigger forces status_updated_by/at to the
-- authenticated caller/now() whenever status changes, and preserves
-- the existing values otherwise -- a client-supplied value for this
-- column can never reach storage, regardless of future call sites.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_task_status_actor()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_updated_by := auth.uid();
    NEW.status_updated_at := now();
  ELSE
    NEW.status_updated_by := OLD.status_updated_by;
    NEW.status_updated_at := OLD.status_updated_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_tasks_status_actor ON tasks;
CREATE TRIGGER trg_tasks_status_actor
BEFORE UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION public.enforce_task_status_actor();

-- ============================================================================
-- SEC-06 — CONFIRMED DEFECT (DEFECT-CAREGIVER-BILLING-READ,
-- [script not preserved; reproduced independently below] -- an
-- ordinary (non-director) caregiver's direct GET of organization_
-- licenses returned annual_license_fee, licensed_seats and
-- covered_patient_capacity).
--
-- ROOT CAUSE: migration 035's "Active org members can view their own
-- organization's license" policy conflates two different needs: (a)
-- any member's OPERATIONAL need to know whether coverage is currently
-- active (used by the F01 coverage banner), and (b) a director's
-- COMMERCIAL need to see billing terms. RLS is row-scoped, not
-- column-scoped, so one permissive policy exposed both to anyone.
--
-- FIX: restrict the base table's SELECT policy to directors only, and
-- add a narrow RPC exposing just the two operational fields
-- (status, covered_patient_capacity -- no financial figures) to any
-- active member. EnterpriseStaffPatientView.tsx is updated in the same
-- commit to call the new RPC instead of reading the table directly.
-- ============================================================================
DROP POLICY IF EXISTS "Active org members can view their own organization's license" ON organization_licenses;

DO $$ BEGIN
  CREATE POLICY "Only organization directors can view their organization's license and billing terms"
    ON organization_licenses FOR SELECT
    USING (public.is_active_org_director(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.get_organization_coverage_status(p_org_id UUID)
RETURNS TABLE(status TEXT, covered_patient_capacity INTEGER)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT ol.status, ol.covered_patient_capacity FROM organization_licenses ol
  WHERE ol.organization_id = p_org_id AND public.is_active_org_member(p_org_id);
$function$;
REVOKE ALL ON FUNCTION public.get_organization_coverage_status(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_organization_coverage_status(UUID) TO authenticated;
