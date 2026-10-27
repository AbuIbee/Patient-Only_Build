-- PACKAGE 1 (MMA-P1-FINAL) Priority 2, directive Section 7 — Authorized
-- Patient Representative (APR). Confirmed, by grep of every migration
-- before this one, to be a complete gap: no representative table, no
-- enrollment RPC, no distinct representative identity anywhere in this
-- repository. This is a net-new, additive feature built on the existing
-- patient-access trust boundary (has_patient_access()/
-- is_authorized_for_patient()), not a reconciliation of an existing
-- mechanism.
--
-- KEY DESIGN REUSE: migration 070 (R6) already separates a clinical
-- record's SUBJECT (patient_id, gated by has_patient_access()) from its
-- ACTOR (author_id/created_by, always auth.uid()) on every Enterprise
-- clinical table. This means Section 7.5's "never falsely attribute
-- representative actions directly to the patient" is ALREADY satisfied
-- by the existing schema once a representative is simply granted
-- has_patient_access() for their patient: any write the representative
-- makes still records author_id/created_by = the representative's own
-- auth.uid(), never the patient's id. No new audit mechanism was needed
-- for that specific requirement -- confirmed by inspection, not assumed.
--
-- KNOWN, DOCUMENTED LIMITATION (same shape as invite_org_member()'s own
-- documented constraint, migration 035): the representative must already
-- hold an authenticated account with a known email. This environment has
-- no outbound-email/account-provisioning infrastructure (no SMTP, no
-- service-role admin-API Edge Function) to create a brand-new auth user
-- as part of enrollment. register_patient_representative() therefore
-- resolves an EXISTING account by email, exactly like invite_org_member(),
-- and raises a clear, honest error otherwise rather than silently no-op
-- or fabricating an account-creation path this environment cannot
-- actually deliver.

CREATE TABLE IF NOT EXISTS patient_representatives (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id                      UUID NOT NULL REFERENCES patients(id),
  organization_id                 UUID NOT NULL REFERENCES organizations(id),
  representative_user_id          UUID NOT NULL REFERENCES profiles(id),
  legal_first_name                TEXT NOT NULL CHECK (char_length(btrim(legal_first_name)) > 0),
  legal_middle_name               TEXT,
  legal_last_name                 TEXT NOT NULL CHECK (char_length(btrim(legal_last_name)) > 0),
  contact_email                   TEXT NOT NULL,
  contact_phone                   TEXT NOT NULL,
  residential_address              TEXT NOT NULL,
  relationship_to_patient         TEXT NOT NULL,
  authorization_basis             TEXT NOT NULL,
  authorization_evidence_reference TEXT,
  consent_acknowledged            BOOLEAN NOT NULL DEFAULT false,
  verification_status             TEXT NOT NULL DEFAULT 'pending_verification' CHECK (verification_status IN ('pending_verification', 'verified', 'rejected')),
  status                          TEXT NOT NULL DEFAULT 'pending_verification' CHECK (status IN ('pending_verification', 'active', 'revoked', 'replaced')),
  initiated_by                    UUID NOT NULL REFERENCES profiles(id),
  verified_by                     UUID REFERENCES profiles(id),
  verified_at                     TIMESTAMPTZ,
  revoked_by                      UUID REFERENCES profiles(id),
  revocation_reason               TEXT,
  revoked_at                      TIMESTAMPTZ,
  replaced_by_representative_id   UUID REFERENCES patient_representatives(id),
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7.6 "Replacement of a representative" combined with "revoking must not
-- delete the account" implies at most one ACTIVE representative per
-- patient at a time -- enforced structurally, not merely by RPC logic.
CREATE UNIQUE INDEX IF NOT EXISTS patient_representatives_one_active_per_patient
  ON patient_representatives (patient_id) WHERE (status = 'active');

ALTER TABLE patient_representatives ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON patient_representatives FROM PUBLIC, anon, authenticated;
GRANT SELECT ON patient_representatives TO authenticated;
GRANT ALL ON patient_representatives TO service_role;

DO $$ BEGIN
  CREATE POLICY "Representative, their org's active staff, or the Platform Owner can view"
    ON patient_representatives FOR SELECT
    USING (
      representative_user_id = (select auth.uid())
      OR EXISTS (SELECT 1 FROM organization_memberships m WHERE m.organization_id = patient_representatives.organization_id AND m.user_id = (select auth.uid()) AND m.status = 'active')
      OR public.is_platform_owner()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- register_patient_representative(): "An authorized organization employee
-- initiates Enterprise patient enrollment" (7.2 step 1). Caller must be an
-- active director or caregiver of the target organization, which must
-- actively cover the target patient. The representative's basic personal
-- information, relationship, and authorization basis are captured here;
-- the row starts 'pending_verification' -- it grants NO patient access
-- until verify_patient_representative() below explicitly approves it
-- (7.2 step 5: "required verification is completed" happens as a
-- distinct step, not automatically at submission).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.register_patient_representative(
  p_patient_id UUID,
  p_org_id UUID,
  p_representative_email TEXT,
  p_legal_first_name TEXT,
  p_legal_last_name TEXT,
  p_contact_email TEXT,
  p_contact_phone TEXT,
  p_residential_address TEXT,
  p_relationship_to_patient TEXT,
  p_authorization_basis TEXT,
  p_consent_acknowledged BOOLEAN,
  p_legal_middle_name TEXT DEFAULT NULL,
  p_authorization_evidence_reference TEXT DEFAULT NULL
) RETURNS patient_representatives
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_rep_user_id UUID;
  v_row patient_representatives;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id = p_org_id AND user_id = auth.uid() AND status = 'active' AND org_role IN ('director', 'caregiver')
  ) THEN
    RAISE EXCEPTION 'Only an active Director or Caregiver of this organization may initiate representative enrollment';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM covered_patient_memberships c
    JOIN organization_licenses l ON l.organization_id = c.organization_id AND l.status = 'active'
    WHERE c.organization_id = p_org_id AND c.patient_id = p_patient_id AND c.status = 'active'
  ) THEN
    RAISE EXCEPTION 'This organization does not actively cover the specified patient';
  END IF;

  IF NOT p_consent_acknowledged THEN
    RAISE EXCEPTION 'Required consent and acknowledgment was not provided';
  END IF;

  SELECT id INTO v_rep_user_id FROM profiles WHERE lower(email) = lower(btrim(p_representative_email));
  IF v_rep_user_id IS NULL THEN
    RAISE EXCEPTION 'No existing account was found for %. The representative must create an individual authenticated account before enrollment can proceed.', p_representative_email;
  END IF;

  INSERT INTO patient_representatives (
    patient_id, organization_id, representative_user_id, legal_first_name, legal_middle_name, legal_last_name,
    contact_email, contact_phone, residential_address, relationship_to_patient, authorization_basis,
    authorization_evidence_reference, consent_acknowledged, initiated_by
  ) VALUES (
    p_patient_id, p_org_id, v_rep_user_id, btrim(p_legal_first_name), p_legal_middle_name, btrim(p_legal_last_name),
    btrim(p_contact_email), btrim(p_contact_phone), btrim(p_residential_address), btrim(p_relationship_to_patient), btrim(p_authorization_basis),
    p_authorization_evidence_reference, p_consent_acknowledged, auth.uid()
  ) RETURNING * INTO v_row;

  INSERT INTO account_management_audit (target_user_id, organization_id, action_type, actor_user_id, new_value, reason)
  VALUES (p_patient_id, p_org_id, 'patient_representative_registered', auth.uid(), jsonb_build_object('representative_id', v_row.id, 'representative_user_id', v_rep_user_id), 'APR enrollment initiated');

  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.register_patient_representative(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_patient_representative(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated, service_role;

-- ============================================================================
-- verify_patient_representative(): distinct verification step (7.2 step
-- 5). Director-only. Flips the row to 'active' -- this is the ONLY
-- transition that grants real patient access, via the authorization
-- helpers' new OR-branch below.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.verify_patient_representative(p_representative_id UUID)
RETURNS patient_representatives
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_row patient_representatives;
BEGIN
  SELECT * INTO v_row FROM patient_representatives WHERE id = p_representative_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Representative record not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id = v_row.organization_id AND user_id = auth.uid() AND status = 'active' AND org_role = 'director'
  ) THEN
    RAISE EXCEPTION 'Only an active Director of this organization may verify a representative';
  END IF;

  IF v_row.status <> 'pending_verification' THEN
    RAISE EXCEPTION 'Only a pending representative record may be verified';
  END IF;

  UPDATE patient_representatives
  SET verification_status = 'verified', status = 'active', verified_by = auth.uid(), verified_at = now(), updated_at = now()
  WHERE id = p_representative_id
  RETURNING * INTO v_row;

  INSERT INTO account_management_audit (target_user_id, organization_id, action_type, actor_user_id, new_value, reason)
  VALUES (v_row.patient_id, v_row.organization_id, 'patient_representative_verified', auth.uid(), jsonb_build_object('representative_id', v_row.id), 'APR verification approved');

  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.verify_patient_representative(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_patient_representative(UUID) TO authenticated, service_role;

-- ============================================================================
-- revoke_patient_representative(): 7.6 "immediate server-side access
-- denial after revocation... preservation of historical audit records."
-- Mandatory reason -- same pattern this directive requires for patient
-- closure (Section 8.1). Never deletes the row (and never the patient or
-- clinical records) -- only flips status, which has_patient_access()'s
-- new branch below re-checks on every single call.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.revoke_patient_representative(p_representative_id UUID, p_reason TEXT)
RETURNS patient_representatives
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_row patient_representatives;
BEGIN
  IF p_reason IS NULL OR char_length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'A revocation reason is required';
  END IF;

  SELECT * INTO v_row FROM patient_representatives WHERE id = p_representative_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Representative record not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id = v_row.organization_id AND user_id = auth.uid() AND status = 'active' AND org_role = 'director'
  ) THEN
    RAISE EXCEPTION 'Only an active Director of this organization may revoke a representative';
  END IF;

  IF v_row.status <> 'active' THEN
    RAISE EXCEPTION 'Only an active representative record may be revoked';
  END IF;

  UPDATE patient_representatives
  SET status = 'revoked', revoked_by = auth.uid(), revocation_reason = btrim(p_reason), revoked_at = now(), updated_at = now()
  WHERE id = p_representative_id
  RETURNING * INTO v_row;

  INSERT INTO account_management_audit (target_user_id, organization_id, action_type, actor_user_id, new_value, reason)
  VALUES (v_row.patient_id, v_row.organization_id, 'patient_representative_revoked', auth.uid(), jsonb_build_object('representative_id', v_row.id), p_reason);

  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.revoke_patient_representative(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_patient_representative(UUID, TEXT) TO authenticated, service_role;

-- ============================================================================
-- replace_patient_representative(): 7.6 "replacement of a representative"
-- as one atomic operation -- revokes the old record and registers the new
-- one (again starting 'pending_verification', requiring its own
-- verify_patient_representative() call) in a single transaction, so a
-- caller can never observe a state with zero AND the old one simultaneously
-- lacking its revocation record.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.replace_patient_representative(
  p_old_representative_id UUID,
  p_reason TEXT,
  p_representative_email TEXT,
  p_legal_first_name TEXT,
  p_legal_last_name TEXT,
  p_contact_email TEXT,
  p_contact_phone TEXT,
  p_residential_address TEXT,
  p_relationship_to_patient TEXT,
  p_authorization_basis TEXT,
  p_consent_acknowledged BOOLEAN,
  p_legal_middle_name TEXT DEFAULT NULL,
  p_authorization_evidence_reference TEXT DEFAULT NULL
) RETURNS patient_representatives
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_old patient_representatives;
  v_new patient_representatives;
BEGIN
  v_old := public.revoke_patient_representative(p_old_representative_id, p_reason);

  v_new := public.register_patient_representative(
    v_old.patient_id, v_old.organization_id, p_representative_email, p_legal_first_name, p_legal_last_name,
    p_contact_email, p_contact_phone, p_residential_address, p_relationship_to_patient, p_authorization_basis,
    p_consent_acknowledged, p_legal_middle_name, p_authorization_evidence_reference
  );

  UPDATE patient_representatives SET replaced_by_representative_id = v_new.id, updated_at = now() WHERE id = v_old.id;

  RETURN v_new;
END;
$function$;
REVOKE ALL ON FUNCTION public.replace_patient_representative(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_patient_representative(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated, service_role;

-- ── Wire active representation into patient authorization ──────────────────
-- Full ordinary Patient Office access (7.3), gated the same way staff and
-- Owner access are: an active representative relationship AND the
-- patient's own coverage/license must still be active (7.6: coverage
-- lapsing should not leave a stale representative with access either).
-- Deliberately NOT wired into is_medical_professional_for_patient/
-- is_therapist_for_patient -- those represent STAFF clinical-authorship
-- capability, which 7.4 explicitly excludes from the APR's permissions.
CREATE OR REPLACE FUNCTION public.is_authorized_for_patient(p_user_id uuid, p_patient_id uuid)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
SELECT p_user_id IS NOT NULL AND p_patient_id IS NOT NULL AND
(p_user_id=p_patient_id OR EXISTS (SELECT 1 FROM public.caregiver_patients cp WHERE cp.caregiver_id=p_user_id AND cp.patient_id=p_patient_id)
OR EXISTS (SELECT 1 FROM public.staff_patient_assignments a JOIN public.organization_memberships m ON m.organization_id=a.organization_id AND m.user_id=a.user_id AND m.status='active' AND m.org_role=a.org_role JOIN public.covered_patient_memberships c ON c.organization_id=a.organization_id AND c.patient_id=a.patient_id AND c.status='active' JOIN public.organization_licenses l ON l.organization_id=a.organization_id AND l.status='active' WHERE a.user_id=p_user_id AND a.patient_id=p_patient_id AND a.is_active=true)
OR EXISTS (SELECT 1 FROM public.therapist_relationships t JOIN public.profiles p ON p.id=t.therapist_id AND p.role='therapist' WHERE t.therapist_id=p_user_id AND t.patient_id=p_patient_id AND t.is_active=true)
OR EXISTS (SELECT 1 FROM public.organizations o JOIN public.organization_owner_capability_grants g ON g.organization_id=o.id AND g.user_id=p_user_id AND g.capability IN ('caregiver','medical_professional','therapist') AND g.status='active' JOIN public.covered_patient_memberships c ON c.organization_id=o.id AND c.patient_id=p_patient_id AND c.status='active' JOIN public.organization_licenses l ON l.organization_id=o.id AND l.status='active' WHERE o.owner_user_id=p_user_id)
OR EXISTS (SELECT 1 FROM public.patient_representatives r JOIN public.covered_patient_memberships c ON c.organization_id=r.organization_id AND c.patient_id=r.patient_id AND c.status='active' JOIN public.organization_licenses l ON l.organization_id=r.organization_id AND l.status='active' WHERE r.representative_user_id=p_user_id AND r.patient_id=p_patient_id AND r.status='active'));
$function$;
REVOKE ALL ON FUNCTION public.is_authorized_for_patient(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_authorized_for_patient(uuid, uuid) TO service_role;
