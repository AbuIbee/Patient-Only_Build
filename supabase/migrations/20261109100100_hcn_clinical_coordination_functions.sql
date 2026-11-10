-- HCN-CLINICAL-MASTER-002 -- server-side functions for the Haneen
-- Clinical Coordination Center. Every state transition is enforced
-- here, never trusted from the client (directive 4.3/6.1). External
-- provider access reuses sales_quote_invitations' own hashed-token
-- pattern (migration 107/platform_owner_issue_quote_invitation /
-- redeem_quote_invitation) -- same extensions.gen_random_bytes(32) +
-- extensions.digest(...,'sha256') construction, same lazy-expire
-- bookkeeping, same "report precisely why access was refused" style.

-- ---------------------------------------------------------------------
-- Internal helper: append one event row. Not granted to authenticated
-- directly (no GRANT EXECUTE below) -- only callable from another
-- SECURITY DEFINER function running as this same definer, keeping the
-- event log genuinely append-only for ordinary callers.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hcn_record_request_event(
  p_request_id UUID, p_event_type TEXT, p_actor_user_id UUID, p_actor_external_label TEXT, p_details JSONB DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO hcn_clinical_request_events (request_id, event_type, actor_user_id, actor_external_label, details)
  VALUES (p_request_id, p_event_type, p_actor_user_id, p_actor_external_label, p_details);
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_record_request_event(UUID, TEXT, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hcn_record_request_event(UUID, TEXT, UUID, TEXT, JSONB) TO service_role;

-- =====================================================================
-- Healthcare Provider Directory (Feature 1)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.hcn_upsert_healthcare_provider(
  p_organization_id UUID, p_provider_id UUID, p_display_name TEXT, p_professional_title TEXT, p_specialty TEXT,
  p_specialty_other_label TEXT, p_practice_name TEXT, p_office_phone TEXT, p_fax_number TEXT, p_secure_contact_email TEXT,
  p_office_address TEXT, p_professional_identifier TEXT, p_credentials TEXT, p_expected_version INTEGER DEFAULT NULL
) RETURNS public.hcn_healthcare_providers
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row hcn_healthcare_providers;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT (is_active_org_director(p_organization_id) OR is_organization_owner(p_organization_id)) THEN
    RAISE EXCEPTION 'Only an active Director or the Organization Owner may manage the healthcare provider directory';
  END IF;
  IF btrim(coalesce(p_display_name, '')) = '' THEN RAISE EXCEPTION 'A provider name is required'; END IF;

  IF p_provider_id IS NULL THEN
    INSERT INTO hcn_healthcare_providers (
      organization_id, display_name, professional_title, specialty, specialty_other_label, practice_name,
      office_phone, fax_number, secure_contact_email, office_address, professional_identifier, credentials, created_by
    ) VALUES (
      p_organization_id, btrim(p_display_name), p_professional_title, p_specialty, p_specialty_other_label, p_practice_name,
      p_office_phone, p_fax_number, p_secure_contact_email, p_office_address, p_professional_identifier, p_credentials, auth.uid()
    ) RETURNING * INTO v_row;
    RETURN v_row;
  END IF;

  SELECT * INTO v_row FROM hcn_healthcare_providers WHERE id = p_provider_id AND organization_id = p_organization_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No such provider in this organization'; END IF;
  IF p_expected_version IS NOT NULL AND v_row.version <> p_expected_version THEN
    RAISE EXCEPTION 'This provider record was changed by someone else -- reload and try again (expected version %, found %)', p_expected_version, v_row.version;
  END IF;

  UPDATE hcn_healthcare_providers SET
    display_name = btrim(p_display_name), professional_title = p_professional_title, specialty = p_specialty,
    specialty_other_label = p_specialty_other_label, practice_name = p_practice_name, office_phone = p_office_phone,
    fax_number = p_fax_number, secure_contact_email = p_secure_contact_email, office_address = p_office_address,
    professional_identifier = p_professional_identifier, credentials = p_credentials,
    updated_by = auth.uid(), updated_at = now(), version = version + 1
  WHERE id = p_provider_id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_upsert_healthcare_provider(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hcn_upsert_healthcare_provider(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.hcn_set_provider_active(p_provider_id UUID, p_is_active BOOLEAN)
RETURNS public.hcn_healthcare_providers
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row hcn_healthcare_providers;
BEGIN
  SELECT * INTO v_row FROM hcn_healthcare_providers WHERE id = p_provider_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No such provider'; END IF;
  IF NOT (is_active_org_director(v_row.organization_id) OR is_organization_owner(v_row.organization_id)) THEN
    RAISE EXCEPTION 'Only an active Director or the Organization Owner may change this provider''s active status';
  END IF;
  UPDATE hcn_healthcare_providers SET is_active = p_is_active, updated_by = auth.uid(), updated_at = now(), version = version + 1
  WHERE id = p_provider_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_set_provider_active(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hcn_set_provider_active(UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.hcn_associate_provider_with_patient(p_patient_id UUID, p_provider_id UUID, p_relationship_note TEXT DEFAULT NULL)
RETURNS public.hcn_patient_provider_associations
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_provider hcn_healthcare_providers; v_row hcn_patient_provider_associations;
BEGIN
  SELECT * INTO v_provider FROM hcn_healthcare_providers WHERE id = p_provider_id;
  IF v_provider.id IS NULL THEN RAISE EXCEPTION 'No such provider'; END IF;
  IF NOT (is_active_org_director(v_provider.organization_id) OR is_organization_owner(v_provider.organization_id)) THEN
    RAISE EXCEPTION 'Only an active Director or the Organization Owner may associate a provider with a patient';
  END IF;
  -- Not has_patient_access(): that check establishes an INDIVIDUAL
  -- user's own authorization to a patient (self/assignment/
  -- representative) and has no "is a director of this patient's
  -- covering org" branch at all -- the caller's authority was already
  -- established above via is_active_org_director/is_organization_owner;
  -- what remains to verify is simply that the PATIENT is actually
  -- covered by THIS SAME organization, not a different one.
  IF NOT EXISTS (
    SELECT 1 FROM covered_patient_memberships c WHERE c.organization_id = v_provider.organization_id AND c.patient_id = p_patient_id AND c.status = 'active'
  ) THEN
    RAISE EXCEPTION 'This patient is not covered by the provider''s own organization';
  END IF;

  INSERT INTO hcn_patient_provider_associations (organization_id, patient_id, provider_id, relationship_note, created_by)
  VALUES (v_provider.organization_id, p_patient_id, p_provider_id, p_relationship_note, auth.uid())
  ON CONFLICT (patient_id, provider_id) DO UPDATE SET is_active = true, relationship_note = EXCLUDED.relationship_note, updated_at = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_associate_provider_with_patient(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hcn_associate_provider_with_patient(UUID, UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.hcn_dissociate_provider_from_patient(p_association_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row hcn_patient_provider_associations;
BEGIN
  SELECT * INTO v_row FROM hcn_patient_provider_associations WHERE id = p_association_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No such association'; END IF;
  IF NOT (is_active_org_director(v_row.organization_id) OR is_organization_owner(v_row.organization_id)) THEN
    RAISE EXCEPTION 'Only an active Director or the Organization Owner may remove this association';
  END IF;
  UPDATE hcn_patient_provider_associations SET is_active = false, updated_at = now() WHERE id = p_association_id;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_dissociate_provider_from_patient(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hcn_dissociate_provider_from_patient(UUID) TO authenticated;

-- =====================================================================
-- Clinical Requests (Features 2 & 4)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.hcn_create_clinical_request(
  p_organization_id UUID, p_patient_id UUID, p_provider_id UUID, p_request_type TEXT, p_title TEXT,
  p_description TEXT, p_requested_items JSONB, p_deadline_at TIMESTAMPTZ, p_follow_up_owner_id UUID
) RETURNS public.hcn_clinical_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_provider hcn_healthcare_providers; v_row hcn_clinical_requests;
BEGIN
  IF NOT (is_active_org_director(p_organization_id) OR is_organization_owner(p_organization_id)) THEN
    RAISE EXCEPTION 'Only an active Director or the Organization Owner may create a clinical request';
  END IF;
  SELECT * INTO v_provider FROM hcn_healthcare_providers WHERE id = p_provider_id AND organization_id = p_organization_id AND is_active = true;
  IF v_provider.id IS NULL THEN RAISE EXCEPTION 'No such active provider in this organization'; END IF;
  IF NOT EXISTS (SELECT 1 FROM covered_patient_memberships c WHERE c.organization_id = p_organization_id AND c.patient_id = p_patient_id AND c.status = 'active') THEN
    RAISE EXCEPTION 'This patient is not actively covered by this organization';
  END IF;
  IF btrim(coalesce(p_title, '')) = '' THEN RAISE EXCEPTION 'A request title is required'; END IF;

  INSERT INTO hcn_clinical_requests (
    organization_id, patient_id, provider_id, request_type, title, description, requested_items,
    deadline_at, follow_up_owner_id, created_by
  ) VALUES (
    p_organization_id, p_patient_id, p_provider_id, p_request_type, btrim(p_title), p_description,
    coalesce(p_requested_items, '[]'::jsonb), p_deadline_at, p_follow_up_owner_id, auth.uid()
  ) RETURNING * INTO v_row;

  PERFORM hcn_record_request_event(v_row.id, 'created', auth.uid(), NULL, jsonb_build_object('request_type', p_request_type));
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_create_clinical_request(UUID, UUID, UUID, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hcn_create_clinical_request(UUID, UUID, UUID, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.hcn_update_clinical_request_draft(
  p_request_id UUID, p_title TEXT, p_description TEXT, p_requested_items JSONB, p_deadline_at TIMESTAMPTZ,
  p_follow_up_owner_id UUID, p_expected_version INTEGER
) RETURNS public.hcn_clinical_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row hcn_clinical_requests;
BEGIN
  SELECT * INTO v_row FROM hcn_clinical_requests WHERE id = p_request_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No such request'; END IF;
  IF NOT (is_active_org_director(v_row.organization_id) OR is_organization_owner(v_row.organization_id)) THEN
    RAISE EXCEPTION 'Only an active Director or the Organization Owner may edit this request';
  END IF;
  IF v_row.status <> 'draft' THEN RAISE EXCEPTION 'Only a draft request may be edited this way (current status: %)', v_row.status; END IF;
  IF v_row.version <> p_expected_version THEN
    RAISE EXCEPTION 'This request was changed by someone else -- reload and try again';
  END IF;

  UPDATE hcn_clinical_requests SET
    title = coalesce(btrim(p_title), title), description = p_description, requested_items = coalesce(p_requested_items, requested_items),
    deadline_at = p_deadline_at, follow_up_owner_id = p_follow_up_owner_id, updated_at = now(), version = version + 1
  WHERE id = p_request_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_update_clinical_request_draft(UUID, TEXT, TEXT, JSONB, TIMESTAMPTZ, UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hcn_update_clinical_request_draft(UUID, TEXT, TEXT, JSONB, TIMESTAMPTZ, UUID, INTEGER) TO authenticated;

-- Sends the request: generates the external provider's single-use
-- access token (same construction as platform_owner_issue_quote_invitation),
-- returning the raw token exactly once for the caller to pass to the
-- notification Edge Function -- never persisted anywhere but its hash.
CREATE OR REPLACE FUNCTION public.hcn_send_clinical_request(p_request_id UUID, p_expires_in_days INTEGER DEFAULT 14)
RETURNS TABLE(request public.hcn_clinical_requests, raw_token TEXT, token_expires_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row hcn_clinical_requests; v_provider hcn_healthcare_providers; v_raw_token TEXT; v_hash TEXT; v_expires TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_row FROM hcn_clinical_requests WHERE id = p_request_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No such request'; END IF;
  IF NOT (is_active_org_director(v_row.organization_id) OR is_organization_owner(v_row.organization_id)) THEN
    RAISE EXCEPTION 'Only an active Director or the Organization Owner may send this request';
  END IF;
  IF v_row.status NOT IN ('draft', 'send_pending') THEN RAISE EXCEPTION 'This request has already been sent (status: %)', v_row.status; END IF;
  IF p_expires_in_days IS NULL OR p_expires_in_days <= 0 OR p_expires_in_days > 60 THEN
    RAISE EXCEPTION 'expires_in_days must be between 1 and 60';
  END IF;
  SELECT * INTO v_provider FROM hcn_healthcare_providers WHERE id = v_row.provider_id;
  IF v_provider.secure_contact_email IS NULL OR btrim(v_provider.secure_contact_email) = '' THEN
    RAISE EXCEPTION 'This provider has no contact email on file -- add one before sending';
  END IF;

  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_raw_token, 'sha256'), 'hex');
  v_expires := now() + (p_expires_in_days || ' days')::interval;

  INSERT INTO hcn_external_access_tokens (request_id, token_hash, recipient_email, recipient_label, expires_at, created_by)
  VALUES (p_request_id, v_hash, lower(btrim(v_provider.secure_contact_email)), v_provider.display_name, v_expires, auth.uid());

  UPDATE hcn_clinical_requests SET status = 'sent', sent_at = now(), updated_at = now(), version = version + 1
  WHERE id = p_request_id RETURNING * INTO v_row;

  PERFORM hcn_record_request_event(p_request_id, 'recipient_selected', auth.uid(), NULL, jsonb_build_object('provider_id', v_row.provider_id));
  PERFORM hcn_record_request_event(p_request_id, 'send_attempted', auth.uid(), NULL, '{}'::jsonb);

  RETURN QUERY SELECT v_row, v_raw_token, v_expires;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_send_clinical_request(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hcn_send_clinical_request(UUID, INTEGER) TO authenticated;

-- Resend: revokes any still-pending prior token for this SAME request
-- and issues a new one -- never creates a second request (directive
-- 4.1's "resend an invitation without duplicating the request").
CREATE OR REPLACE FUNCTION public.hcn_resend_clinical_request_invitation(p_request_id UUID, p_expires_in_days INTEGER DEFAULT 14)
RETURNS TABLE(raw_token TEXT, token_expires_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row hcn_clinical_requests; v_provider hcn_healthcare_providers; v_raw_token TEXT; v_hash TEXT; v_expires TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_row FROM hcn_clinical_requests WHERE id = p_request_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No such request'; END IF;
  IF NOT (is_active_org_director(v_row.organization_id) OR is_organization_owner(v_row.organization_id)) THEN
    RAISE EXCEPTION 'Only an active Director or the Organization Owner may resend this invitation';
  END IF;
  IF v_row.status NOT IN ('sent', 'response_received') THEN
    RAISE EXCEPTION 'Only a sent, outstanding request may have its invitation resent (status: %)', v_row.status;
  END IF;
  SELECT * INTO v_provider FROM hcn_healthcare_providers WHERE id = v_row.provider_id;

  UPDATE hcn_external_access_tokens SET revoked_at = now(), revoked_by = auth.uid()
  WHERE request_id = p_request_id AND status = 'pending' AND revoked_at IS NULL;

  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_raw_token, 'sha256'), 'hex');
  v_expires := now() + (coalesce(p_expires_in_days, 14) || ' days')::interval;
  INSERT INTO hcn_external_access_tokens (request_id, token_hash, recipient_email, recipient_label, expires_at, created_by)
  VALUES (p_request_id, v_hash, lower(btrim(v_provider.secure_contact_email)), v_provider.display_name, v_expires, auth.uid());

  PERFORM hcn_record_request_event(p_request_id, 'send_attempted', auth.uid(), NULL, jsonb_build_object('resend', true));
  RETURN QUERY SELECT v_raw_token, v_expires;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_resend_clinical_request_invitation(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hcn_resend_clinical_request_invitation(UUID, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.hcn_cancel_clinical_request(p_request_id UUID, p_reason TEXT)
RETURNS public.hcn_clinical_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row hcn_clinical_requests;
BEGIN
  SELECT * INTO v_row FROM hcn_clinical_requests WHERE id = p_request_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No such request'; END IF;
  IF NOT (is_active_org_director(v_row.organization_id) OR is_organization_owner(v_row.organization_id)) THEN
    RAISE EXCEPTION 'Only an active Director or the Organization Owner may cancel this request';
  END IF;
  IF v_row.status IN ('closed', 'cancelled', 'accepted', 'rejected') THEN
    RAISE EXCEPTION 'This request is already final (status: %)', v_row.status;
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN RAISE EXCEPTION 'A cancellation reason is required'; END IF;

  UPDATE hcn_external_access_tokens SET revoked_at = now(), revoked_by = auth.uid()
  WHERE request_id = p_request_id AND status IN ('pending', 'verified') AND revoked_at IS NULL;

  UPDATE hcn_clinical_requests SET status = 'cancelled', cancelled_at = now(), cancellation_reason = btrim(p_reason), updated_at = now(), version = version + 1
  WHERE id = p_request_id RETURNING * INTO v_row;

  PERFORM hcn_record_request_event(p_request_id, 'cancelled', auth.uid(), NULL, jsonb_build_object('reason', p_reason));
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_cancel_clinical_request(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hcn_cancel_clinical_request(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.hcn_revoke_clinical_request_access(p_request_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row hcn_clinical_requests;
BEGIN
  SELECT * INTO v_row FROM hcn_clinical_requests WHERE id = p_request_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No such request'; END IF;
  IF NOT (is_active_org_director(v_row.organization_id) OR is_organization_owner(v_row.organization_id)) THEN
    RAISE EXCEPTION 'Only an active Director or the Organization Owner may revoke access to this request';
  END IF;
  UPDATE hcn_external_access_tokens SET revoked_at = now(), revoked_by = auth.uid(), status = 'revoked'
  WHERE request_id = p_request_id AND revoked_at IS NULL;
  PERFORM hcn_record_request_event(p_request_id, 'revoked', auth.uid(), NULL, '{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_revoke_clinical_request_access(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hcn_revoke_clinical_request_access(UUID) TO authenticated;

-- =====================================================================
-- Document review (Feature 3.5) -- administrative review vs. clinical
-- approval are two DISTINCT authorities, never conflated (directive
-- 5.5/7.5): administrative review is Director/Owner; clinical approval
-- requires an org_role of medical_professional, therapist, or
-- clinical_supervisor among this organization's EXISTING, already-
-- reviewed role vocabulary -- never granted merely for holding the
-- Director/Owner role.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.hcn_review_clinical_document(
  p_document_id UUID, p_decision TEXT, p_notes TEXT
) RETURNS public.hcn_clinical_documents
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row hcn_clinical_documents; v_new_status TEXT;
BEGIN
  IF p_decision NOT IN ('accepted', 'revision_required', 'rejected', 'forwarded_for_clinical_review') THEN
    RAISE EXCEPTION 'Invalid administrative review decision: %', p_decision;
  END IF;
  SELECT * INTO v_row FROM hcn_clinical_documents WHERE id = p_document_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No such document'; END IF;
  IF NOT (is_active_org_director(v_row.organization_id) OR is_organization_owner(v_row.organization_id)) THEN
    RAISE EXCEPTION 'Only an active Director or the Organization Owner may perform administrative document review';
  END IF;
  IF v_row.review_status NOT IN ('received_unreviewed', 'revision_required') THEN
    RAISE EXCEPTION 'This document has already progressed past administrative review (status: %)', v_row.review_status;
  END IF;

  UPDATE hcn_clinical_documents SET review_status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(),
    review_notes = p_notes, updated_at = now()
  WHERE id = p_document_id RETURNING * INTO v_row;

  PERFORM hcn_record_request_event(r.id, 'administrative_review', auth.uid(), NULL, jsonb_build_object('document_id', p_document_id, 'decision', p_decision))
  FROM hcn_clinical_request_documents rd JOIN hcn_clinical_requests r ON r.id = rd.request_id WHERE rd.document_id = p_document_id;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_review_clinical_document(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hcn_review_clinical_document(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.hcn_clinical_approve_document(p_document_id UUID, p_notes TEXT)
RETURNS public.hcn_clinical_documents
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row hcn_clinical_documents; v_is_qualified BOOLEAN;
BEGIN
  SELECT * INTO v_row FROM hcn_clinical_documents WHERE id = p_document_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No such document'; END IF;
  IF v_row.review_status <> 'forwarded_for_clinical_review' THEN
    RAISE EXCEPTION 'This document has not been forwarded for clinical review (status: %)', v_row.review_status;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM organization_memberships m
    WHERE m.organization_id = v_row.organization_id AND m.user_id = auth.uid() AND m.status = 'active'
      AND m.org_role IN ('medical_professional', 'therapist', 'clinical_supervisor')
  ) INTO v_is_qualified;
  IF NOT v_is_qualified THEN
    RAISE EXCEPTION 'Only an active Medical Professional, Therapist, or Clinical Supervisor in this organization may approve clinical content';
  END IF;

  UPDATE hcn_clinical_documents SET review_status = 'clinical_approved', reviewed_by = auth.uid(), reviewed_at = now(),
    review_notes = p_notes, updated_at = now()
  WHERE id = p_document_id RETURNING * INTO v_row;

  PERFORM hcn_record_request_event(r.id, 'clinical_review', auth.uid(), NULL, jsonb_build_object('document_id', p_document_id))
  FROM hcn_clinical_request_documents rd JOIN hcn_clinical_requests r ON r.id = rd.request_id WHERE rd.document_id = p_document_id;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_clinical_approve_document(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hcn_clinical_approve_document(UUID, TEXT) TO authenticated;

-- =====================================================================
-- Document sharing grants
-- =====================================================================
CREATE OR REPLACE FUNCTION public.hcn_share_document_with_request(p_document_id UUID, p_request_id UUID, p_expires_at TIMESTAMPTZ DEFAULT NULL)
RETURNS public.hcn_document_grants
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_doc hcn_clinical_documents; v_req hcn_clinical_requests; v_row hcn_document_grants;
BEGIN
  SELECT * INTO v_doc FROM hcn_clinical_documents WHERE id = p_document_id;
  IF v_doc.id IS NULL THEN RAISE EXCEPTION 'No such document'; END IF;
  SELECT * INTO v_req FROM hcn_clinical_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'No such request'; END IF;
  IF v_doc.organization_id <> v_req.organization_id OR v_doc.patient_id <> v_req.patient_id THEN
    RAISE EXCEPTION 'This document does not belong to the same organization and patient as the request';
  END IF;
  IF NOT (is_active_org_director(v_doc.organization_id) OR is_organization_owner(v_doc.organization_id)) THEN
    RAISE EXCEPTION 'Only an active Director or the Organization Owner may share a document with a request';
  END IF;

  INSERT INTO hcn_document_grants (document_id, grantee_type, request_id, granted_by, expires_at)
  VALUES (p_document_id, 'external_request', p_request_id, auth.uid(), p_expires_at)
  RETURNING * INTO v_row;
  INSERT INTO hcn_clinical_request_documents (request_id, document_id, direction) VALUES (p_request_id, p_document_id, 'shared_with_recipient')
  ON CONFLICT (request_id, document_id) DO NOTHING;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_share_document_with_request(UUID, UUID, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hcn_share_document_with_request(UUID, UUID, TIMESTAMPTZ) TO authenticated;

CREATE OR REPLACE FUNCTION public.hcn_revoke_document_grant(p_grant_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row hcn_document_grants; v_doc hcn_clinical_documents;
BEGIN
  SELECT * INTO v_row FROM hcn_document_grants WHERE id = p_grant_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No such grant'; END IF;
  SELECT * INTO v_doc FROM hcn_clinical_documents WHERE id = v_row.document_id;
  IF NOT (is_active_org_director(v_doc.organization_id) OR is_organization_owner(v_doc.organization_id)) THEN
    RAISE EXCEPTION 'Only an active Director or the Organization Owner may revoke this share';
  END IF;
  UPDATE hcn_document_grants SET revoked_at = now(), revoked_by = auth.uid() WHERE id = p_grant_id;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_revoke_document_grant(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hcn_revoke_document_grant(UUID) TO authenticated;

-- =====================================================================
-- External provider verified access (Feature 2.3 / Feature 3's
-- external half) -- service_role only. The Edge Function layer is the
-- only caller; a raw token plus a confirmed recipient email are
-- required on every single call, never cached as a session (directive:
-- "Account and patient identifiers must never be accepted from the
-- browser as independent proof of authorization").
-- =====================================================================
CREATE OR REPLACE FUNCTION public.hcn_verify_external_access(p_raw_token TEXT, p_confirmed_email TEXT)
RETURNS TABLE(
  outcome TEXT, request_id UUID, request_title TEXT, request_type TEXT, request_description TEXT,
  requested_items JSONB, patient_label TEXT, provider_display_name TEXT, deadline_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_hash TEXT; v_tok hcn_external_access_tokens; v_req hcn_clinical_requests; v_patient patients;
BEGIN
  IF btrim(coalesce(p_raw_token, '')) = '' OR btrim(coalesce(p_confirmed_email, '')) = '' THEN
    RETURN QUERY SELECT 'invalid_input'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::JSONB, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;
  v_hash := encode(extensions.digest(p_raw_token, 'sha256'), 'hex');
  SELECT * INTO v_tok FROM hcn_external_access_tokens WHERE token_hash = v_hash FOR UPDATE;
  IF v_tok.id IS NULL THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::JSONB, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  IF v_tok.status IN ('pending', 'verified') AND v_tok.expires_at <= now() THEN
    UPDATE hcn_external_access_tokens SET status = 'expired' WHERE id = v_tok.id;
    v_tok.status := 'expired';
  END IF;
  IF v_tok.revoked_at IS NOT NULL OR v_tok.status = 'revoked' THEN
    RETURN QUERY SELECT 'revoked'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::JSONB, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;
  IF v_tok.status = 'expired' THEN
    RETURN QUERY SELECT 'expired'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::JSONB, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;
  IF lower(btrim(v_tok.recipient_email)) <> lower(btrim(p_confirmed_email)) THEN
    RETURN QUERY SELECT 'wrong_recipient'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::JSONB, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  SELECT * INTO v_req FROM hcn_clinical_requests WHERE id = v_tok.request_id;
  IF v_req.id IS NULL OR v_req.status NOT IN ('sent', 'response_received') THEN
    RETURN QUERY SELECT 'request_no_longer_open'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::JSONB, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;
  SELECT * INTO v_patient FROM patients WHERE id = v_req.patient_id;

  UPDATE hcn_external_access_tokens SET
    status = 'verified', first_verified_at = coalesce(first_verified_at, now()), last_accessed_at = now()
  WHERE id = v_tok.id;

  PERFORM hcn_record_request_event(v_req.id, 'recipient_verified', NULL, v_tok.recipient_label, jsonb_build_object('email', p_confirmed_email));
  PERFORM hcn_record_request_event(v_req.id, 'request_accessed', NULL, v_tok.recipient_label, '{}'::jsonb);

  RETURN QUERY SELECT
    'verified'::TEXT, v_req.id, v_req.title, v_req.request_type, v_req.description, v_req.requested_items,
    coalesce(v_patient.preferred_name, v_patient.first_name || ' ' || v_patient.last_name),
    (SELECT p.display_name FROM hcn_healthcare_providers p WHERE p.id = v_req.provider_id), v_req.deadline_at;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_verify_external_access(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hcn_verify_external_access(TEXT, TEXT) TO service_role;

-- Documents explicitly shared with a verified token's own request --
-- never any other document, never any other request.
CREATE OR REPLACE FUNCTION public.hcn_list_external_shared_documents(p_raw_token TEXT, p_confirmed_email TEXT)
RETURNS TABLE(document_id UUID, original_filename TEXT, category TEXT, version_number INTEGER, created_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_hash TEXT; v_tok hcn_external_access_tokens;
BEGIN
  v_hash := encode(extensions.digest(coalesce(p_raw_token, ''), 'sha256'), 'hex');
  SELECT * INTO v_tok FROM hcn_external_access_tokens WHERE token_hash = v_hash;
  IF v_tok.id IS NULL OR v_tok.revoked_at IS NOT NULL OR v_tok.status NOT IN ('pending', 'verified') OR v_tok.expires_at <= now()
     OR lower(btrim(v_tok.recipient_email)) <> lower(btrim(coalesce(p_confirmed_email, ''))) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT d.id, d.original_filename, d.category, d.version_number, d.created_at
    FROM hcn_clinical_request_documents rd
    JOIN hcn_clinical_documents d ON d.id = rd.document_id
    JOIN hcn_document_grants g ON g.document_id = d.id AND g.request_id = v_tok.request_id AND g.revoked_at IS NULL
      AND (g.expires_at IS NULL OR g.expires_at > now())
    WHERE rd.request_id = v_tok.request_id AND rd.direction = 'shared_with_recipient';
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_list_external_shared_documents(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hcn_list_external_shared_documents(TEXT, TEXT) TO service_role;

-- Records an external upload's metadata (the Edge Function itself
-- performs the actual Storage write using the service-role client,
-- then calls this to register it, same compensating-delete-on-failure
-- discipline as every other upload path in this codebase).
CREATE OR REPLACE FUNCTION public.hcn_record_external_document_upload(
  p_raw_token TEXT, p_confirmed_email TEXT, p_storage_path TEXT, p_original_filename TEXT, p_mime_type TEXT,
  p_file_size_bytes BIGINT, p_checksum_sha256 TEXT, p_category TEXT
) RETURNS public.hcn_clinical_documents
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_hash TEXT; v_tok hcn_external_access_tokens; v_req hcn_clinical_requests; v_doc hcn_clinical_documents;
BEGIN
  v_hash := encode(extensions.digest(coalesce(p_raw_token, ''), 'sha256'), 'hex');
  SELECT * INTO v_tok FROM hcn_external_access_tokens WHERE token_hash = v_hash;
  IF v_tok.id IS NULL OR v_tok.revoked_at IS NOT NULL OR v_tok.status NOT IN ('pending', 'verified') OR v_tok.expires_at <= now()
     OR lower(btrim(v_tok.recipient_email)) <> lower(btrim(coalesce(p_confirmed_email, ''))) THEN
    RAISE EXCEPTION 'Access denied or expired';
  END IF;
  SELECT * INTO v_req FROM hcn_clinical_requests WHERE id = v_tok.request_id;
  IF v_req.id IS NULL OR v_req.status NOT IN ('sent', 'response_received') THEN
    RAISE EXCEPTION 'This request is no longer open for responses';
  END IF;

  INSERT INTO hcn_clinical_documents (
    organization_id, patient_id, category, storage_path, original_filename, mime_type, file_size_bytes,
    checksum_sha256, uploader_external_label
  ) VALUES (
    v_req.organization_id, v_req.patient_id, p_category, p_storage_path, p_original_filename, p_mime_type,
    p_file_size_bytes, p_checksum_sha256, v_tok.recipient_label || ' <' || v_tok.recipient_email || '>'
  ) RETURNING * INTO v_doc;

  INSERT INTO hcn_clinical_request_documents (request_id, document_id, direction) VALUES (v_req.id, v_doc.id, 'received_from_recipient');
  UPDATE hcn_clinical_requests SET status = 'response_received', updated_at = now(), version = version + 1 WHERE id = v_req.id;
  UPDATE hcn_external_access_tokens SET last_accessed_at = now() WHERE id = v_tok.id;

  PERFORM hcn_record_request_event(v_req.id, 'document_uploaded', NULL, v_tok.recipient_label, jsonb_build_object('document_id', v_doc.id));
  RETURN v_doc;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_record_external_document_upload(TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hcn_record_external_document_upload(TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.hcn_submit_external_response(p_raw_token TEXT, p_confirmed_email TEXT, p_response_text TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_hash TEXT; v_tok hcn_external_access_tokens; v_req hcn_clinical_requests;
BEGIN
  v_hash := encode(extensions.digest(coalesce(p_raw_token, ''), 'sha256'), 'hex');
  SELECT * INTO v_tok FROM hcn_external_access_tokens WHERE token_hash = v_hash;
  IF v_tok.id IS NULL OR v_tok.revoked_at IS NOT NULL OR v_tok.status NOT IN ('pending', 'verified') OR v_tok.expires_at <= now()
     OR lower(btrim(v_tok.recipient_email)) <> lower(btrim(coalesce(p_confirmed_email, ''))) THEN
    RAISE EXCEPTION 'Access denied or expired';
  END IF;
  SELECT * INTO v_req FROM hcn_clinical_requests WHERE id = v_tok.request_id;
  IF v_req.id IS NULL OR v_req.status NOT IN ('sent', 'response_received') THEN
    RAISE EXCEPTION 'This request is no longer open for responses';
  END IF;

  UPDATE hcn_clinical_requests SET status = 'pending_review', updated_at = now(), version = version + 1 WHERE id = v_req.id;
  UPDATE hcn_external_access_tokens SET last_accessed_at = now() WHERE id = v_tok.id;
  PERFORM hcn_record_request_event(v_req.id, 'response_submitted', NULL, v_tok.recipient_label, jsonb_build_object('response_text', coalesce(p_response_text, '')));
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_submit_external_response(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hcn_submit_external_response(TEXT, TEXT, TEXT) TO service_role;
