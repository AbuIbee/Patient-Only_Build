-- MMA-P1-CODEX-002 P1-05 — "Exceptional Platform Owner deletion."
-- Independent Codex audit: "No compliant exceptional patient-deletion
-- mechanism exists. Licensing intervention and hold RPCs are not a
-- deletion mechanism." Confirmed by inventory: no function anywhere in
-- this repository performs an authorized, auditable deletion of a
-- patient's record.
--
-- APPROVED AUTHORITY (directive Section 8): the Platform Owner may
-- initiate this without a separate business-eligibility screening
-- process -- no Director approval or committee is required or added
-- here. Mandatory protections instead: trusted Platform Owner identity
-- (is_platform_owner(), the same column-write-locked profiles.role
-- check used everywhere else in this repository), required
-- justification, audit logging, legal-hold enforcement, and explicit
-- cross-tenant effects.
--
-- FOREIGN-KEY INTERACTION, discovered and handled explicitly: patient_
-- representatives and patient_legal_holds both reference patients(id)
-- with ON DELETE NO ACTION (deliberately, by migrations 145/146, so a
-- revoked representative's or a released hold's historical row is never
-- silently lost to an unrelated cascade). This means a plain `DELETE FROM
-- patients` would fail outright for any patient who ever had ANY
-- representative or hold, even a long-revoked/released one -- this
-- function explicitly snapshots both into the audit row's new_value
-- (which has no FK into patients at all, and is therefore unaffected by
-- the deletion below) and then removes those specific historical rows as
-- part of the SAME transaction as the patient deletion itself, not
-- silently or separately.
--
-- Every other patients(id) foreign key in this schema is ON DELETE
-- CASCADE (verified: caregiver_patients, patient_notes, medications,
-- medication_logs, tasks, appointments, covered_patient_memberships,
-- staff_patient_assignments, patient_diagnoses, patient_care_plans, and
-- others) and is left to cascade normally -- deleting those rows without
-- a separate snapshot is accepted as the intended effect of "legally
-- permitted deletion" of the patient's clinical record; the one
-- governing snapshot (the patient row itself, plus representative/hold
-- history) is what the audit captures.
--
-- This function does NOT delete the underlying auth/profiles identity --
-- that is the separate, already-existing account-deletion request flow
-- (requestAccountDeletion()/admin_reconcile_stuck_registration_deletion()).
-- This is scoped to the patient CLINICAL record only, matching the
-- directive's own "patient records" framing (Section 8.4), not an
-- account-termination mechanism.
CREATE OR REPLACE FUNCTION public.platform_owner_delete_patient_exceptionally(
  p_patient_id UUID,
  p_justification TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_patient_snapshot JSONB;
  v_representatives_snapshot JSONB;
  v_holds_snapshot JSONB;
  v_affected_orgs UUID[];
BEGIN
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Only the Platform Owner may perform this exceptional deletion';
  END IF;
  IF p_justification IS NULL OR char_length(btrim(p_justification)) = 0 THEN
    RAISE EXCEPTION 'A justification is required for this exceptional deletion';
  END IF;
  IF EXISTS (SELECT 1 FROM patient_legal_holds h WHERE h.patient_id = p_patient_id AND h.status = 'active') THEN
    RAISE EXCEPTION 'An active legal hold prevents deletion of this patient''s records';
  END IF;

  SELECT to_jsonb(p.*) INTO v_patient_snapshot FROM patients p WHERE p.id = p_patient_id;
  IF v_patient_snapshot IS NULL THEN
    RAISE EXCEPTION 'Patient record not found';
  END IF;

  SELECT array_agg(DISTINCT organization_id) INTO v_affected_orgs FROM covered_patient_memberships WHERE patient_id = p_patient_id;
  SELECT coalesce(jsonb_agg(to_jsonb(r.*)), '[]'::jsonb) INTO v_representatives_snapshot FROM patient_representatives r WHERE r.patient_id = p_patient_id;
  SELECT coalesce(jsonb_agg(to_jsonb(h.*)), '[]'::jsonb) INTO v_holds_snapshot FROM patient_legal_holds h WHERE h.patient_id = p_patient_id;

  -- Written BEFORE the destructive action, into a table with no FK into
  -- patients/patient_representatives/patient_legal_holds at all -- this
  -- record survives everything deleted below. "Audit evidence must
  -- remain available after the target records are deleted."
  INSERT INTO account_management_audit (target_user_id, action_type, actor_user_id, previous_value, new_value, reason)
  VALUES (
    p_patient_id, 'platform_owner_exceptional_patient_deletion', auth.uid(), v_patient_snapshot,
    jsonb_build_object('affected_organizations', v_affected_orgs, 'deleted_representatives', v_representatives_snapshot, 'deleted_legal_holds', v_holds_snapshot),
    p_justification
  );

  DELETE FROM patient_representatives WHERE patient_id = p_patient_id;
  DELETE FROM patient_legal_holds WHERE patient_id = p_patient_id;
  DELETE FROM patients WHERE id = p_patient_id;

  RETURN jsonb_build_object('deleted_patient_id', p_patient_id, 'affected_organizations', v_affected_orgs);
END;
$function$;

-- Same grant pattern as place_patient_legal_hold()/release_patient_legal_
-- hold(): EXECUTE granted to authenticated (so a real Platform Owner's
-- own session can call it), with is_platform_owner() as the actual
-- internal gate -- not service_role-only, since this is meant to be
-- invoked directly by a signed-in Platform Owner, not only by backend
-- automation. An ordinary authenticated user, Organization Owner (by
-- ownership alone), or Director is rejected by the internal check, never
-- by the grant alone -- consistent with how every other admin-gated RPC
-- in this repository works, and independently testable at the RPC layer
-- regardless of the grant.
REVOKE ALL ON FUNCTION public.platform_owner_delete_patient_exceptionally(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_owner_delete_patient_exceptionally(UUID, TEXT) TO authenticated, service_role;
