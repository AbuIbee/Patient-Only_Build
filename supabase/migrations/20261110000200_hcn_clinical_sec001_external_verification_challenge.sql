-- HCN-CLINICAL-MASTER-002-CONTINUATION SEC-001 -- a browser-supplied
-- email string matching the stored recipient_email never proved
-- control of that inbox. This migration replaces that check with a
-- real second factor: a short-lived, server-generated verification
-- code, delivered ONLY to the token's own stored recipient_email
-- (never a client-supplied address), required before any protected
-- operation. None of the four functions this replaces
-- (hcn_verify_external_access / hcn_list_external_shared_documents /
-- hcn_record_external_document_upload / hcn_submit_external_response)
-- were ever deployed to production (confirmed in the prior
-- completion report) -- dropped and replaced outright, not versioned
-- alongside, avoiding the overload-ambiguity class of bug this
-- engagement has hit before when a parameter list changes.

CREATE TABLE IF NOT EXISTS public.hcn_external_verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID NOT NULL REFERENCES public.hcn_external_access_tokens(id),
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hcn_external_verification_codes_token ON public.hcn_external_verification_codes(token_id, created_at DESC);
ALTER TABLE public.hcn_external_verification_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hcn_external_verification_codes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.hcn_external_verification_codes TO service_role;

CREATE TABLE IF NOT EXISTS public.hcn_external_verified_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID NOT NULL REFERENCES public.hcn_external_access_tokens(id),
  session_token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_hcn_external_verified_sessions_token ON public.hcn_external_verified_sessions(token_id);
ALTER TABLE public.hcn_external_verified_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hcn_external_verified_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.hcn_external_verified_sessions TO service_role;

-- Internal: resolves a raw token to its live row, applying the same
-- lazy-expire bookkeeping hcn_verify_external_access used to do.
-- Not granted to anyone -- only called from the functions below,
-- running as the same definer.
CREATE OR REPLACE FUNCTION public.hcn_lookup_external_token(p_raw_token TEXT)
RETURNS public.hcn_external_access_tokens
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_hash TEXT; v_tok hcn_external_access_tokens;
BEGIN
  v_hash := encode(extensions.digest(coalesce(p_raw_token, ''), 'sha256'), 'hex');
  SELECT * INTO v_tok FROM hcn_external_access_tokens WHERE token_hash = v_hash FOR UPDATE;
  IF v_tok.id IS NULL THEN RETURN NULL; END IF;
  IF v_tok.status IN ('pending', 'verified') AND v_tok.expires_at <= now() THEN
    UPDATE hcn_external_access_tokens SET status = 'expired' WHERE id = v_tok.id;
    v_tok.status := 'expired';
  END IF;
  RETURN v_tok;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_lookup_external_token(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hcn_lookup_external_token(TEXT) TO service_role;

DROP FUNCTION IF EXISTS public.hcn_verify_external_access(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.hcn_list_external_shared_documents(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.hcn_record_external_document_upload(TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.hcn_submit_external_response(TEXT, TEXT, TEXT);

-- Step 1: request a code. Returns only a coarse outcome -- never the
-- recipient email, never whether one was "just sent" vs "already
-- pending" in a way that would let an attacker distinguish a real
-- token from a guessed one beyond what 'not_found' already reveals
-- (which the token's own existence-or-not already does; this is no
-- worse than the prior design's 'not_found' outcome).
CREATE OR REPLACE FUNCTION public.hcn_request_external_verification_code(p_raw_token TEXT)
RETURNS TABLE(outcome TEXT, code TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tok hcn_external_access_tokens; v_recent_count INTEGER; v_total_count INTEGER; v_code TEXT; v_hash TEXT;
BEGIN
  v_tok := hcn_lookup_external_token(p_raw_token);
  IF v_tok.id IS NULL THEN RETURN QUERY SELECT 'not_found'::TEXT, NULL::TEXT; RETURN; END IF;
  IF v_tok.revoked_at IS NOT NULL OR v_tok.status = 'revoked' THEN RETURN QUERY SELECT 'revoked'::TEXT, NULL::TEXT; RETURN; END IF;
  IF v_tok.status = 'expired' THEN RETURN QUERY SELECT 'expired'::TEXT, NULL::TEXT; RETURN; END IF;

  -- Cooldown: at most one new code per 60 seconds for this token.
  SELECT count(*) INTO v_recent_count FROM hcn_external_verification_codes
  WHERE token_id = v_tok.id AND created_at > now() - interval '60 seconds';
  IF v_recent_count > 0 THEN RETURN QUERY SELECT 'rate_limited'::TEXT, NULL::TEXT; RETURN; END IF;

  -- Hard cap: at most 10 code requests total per token (prevents
  -- indefinite inbox-flooding of the real recipient via a single
  -- leaked/guessed link).
  SELECT count(*) INTO v_total_count FROM hcn_external_verification_codes WHERE token_id = v_tok.id;
  IF v_total_count >= 10 THEN RETURN QUERY SELECT 'too_many_requests'::TEXT, NULL::TEXT; RETURN; END IF;

  v_code := lpad(floor(random() * 1000000)::TEXT, 6, '0');
  v_hash := encode(extensions.digest(v_code, 'sha256'), 'hex');
  INSERT INTO hcn_external_verification_codes (token_id, code_hash, expires_at)
  VALUES (v_tok.id, v_hash, now() + interval '10 minutes');

  -- The plaintext code is returned ONLY to this SECURITY DEFINER
  -- function's own caller (the service-role Edge Function), which
  -- sends it exclusively to v_tok.recipient_email (never a
  -- client-supplied address) and then discards it -- only the hash
  -- is ever persisted.
  PERFORM hcn_record_request_event(v_tok.request_id, 'recipient_verified', NULL, v_tok.recipient_label, jsonb_build_object('action', 'code_requested'));
  RETURN QUERY SELECT 'ok'::TEXT, v_code;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_request_external_verification_code(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hcn_request_external_verification_code(TEXT) TO service_role;

-- The Edge Function needs to know WHERE to send the code -- but must
-- never trust a client-supplied address. This is the one place that
-- address is exposed, and only to the service-role caller, derived
-- solely from the token's own stored row.
CREATE OR REPLACE FUNCTION public.hcn_get_external_recipient_contact(p_raw_token TEXT)
RETURNS TABLE(recipient_email TEXT, recipient_label TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tok hcn_external_access_tokens;
BEGIN
  v_tok := hcn_lookup_external_token(p_raw_token);
  IF v_tok.id IS NULL OR v_tok.revoked_at IS NOT NULL OR v_tok.status = 'revoked' OR v_tok.status = 'expired' THEN RETURN; END IF;
  RETURN QUERY SELECT v_tok.recipient_email, v_tok.recipient_label;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_get_external_recipient_contact(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hcn_get_external_recipient_contact(TEXT) TO service_role;

-- Step 2: verify the code, issue a session token bound to this exact
-- external_access_tokens row. Max 5 failed attempts per issued code;
-- exceeding it permanently retires that code (a fresh one must be
-- requested, subject to the same cooldown/cap above).
CREATE OR REPLACE FUNCTION public.hcn_verify_external_code(p_raw_token TEXT, p_code TEXT)
RETURNS TABLE(outcome TEXT, session_token TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tok hcn_external_access_tokens; v_code_row hcn_external_verification_codes; v_hash TEXT; v_session_raw TEXT; v_session_hash TEXT;
BEGIN
  v_tok := hcn_lookup_external_token(p_raw_token);
  IF v_tok.id IS NULL THEN RETURN QUERY SELECT 'not_found'::TEXT, NULL::TEXT; RETURN; END IF;
  IF v_tok.revoked_at IS NOT NULL OR v_tok.status = 'revoked' THEN RETURN QUERY SELECT 'revoked'::TEXT, NULL::TEXT; RETURN; END IF;
  IF v_tok.status = 'expired' THEN RETURN QUERY SELECT 'expired'::TEXT, NULL::TEXT; RETURN; END IF;

  SELECT * INTO v_code_row FROM hcn_external_verification_codes
  WHERE token_id = v_tok.id AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF v_code_row.id IS NULL THEN RETURN QUERY SELECT 'no_pending_code'::TEXT, NULL::TEXT; RETURN; END IF;
  IF v_code_row.expires_at <= now() THEN RETURN QUERY SELECT 'code_expired'::TEXT, NULL::TEXT; RETURN; END IF;
  IF v_code_row.attempt_count >= 5 THEN RETURN QUERY SELECT 'too_many_attempts'::TEXT, NULL::TEXT; RETURN; END IF;

  v_hash := encode(extensions.digest(coalesce(p_code, ''), 'sha256'), 'hex');
  IF v_hash <> v_code_row.code_hash THEN
    UPDATE hcn_external_verification_codes SET attempt_count = attempt_count + 1 WHERE id = v_code_row.id;
    IF v_code_row.attempt_count + 1 >= 5 THEN RETURN QUERY SELECT 'too_many_attempts'::TEXT, NULL::TEXT; RETURN; END IF;
    RETURN QUERY SELECT 'wrong_code'::TEXT, NULL::TEXT; RETURN;
  END IF;

  UPDATE hcn_external_verification_codes SET consumed_at = now() WHERE id = v_code_row.id;

  v_session_raw := encode(extensions.gen_random_bytes(32), 'hex');
  v_session_hash := encode(extensions.digest(v_session_raw, 'sha256'), 'hex');
  INSERT INTO hcn_external_verified_sessions (token_id, session_token_hash, expires_at, last_used_at)
  VALUES (v_tok.id, v_session_hash, now() + interval '60 minutes', now());

  UPDATE hcn_external_access_tokens SET status = 'verified', first_verified_at = coalesce(first_verified_at, now()), last_accessed_at = now() WHERE id = v_tok.id;
  PERFORM hcn_record_request_event(v_tok.request_id, 'recipient_verified', NULL, v_tok.recipient_label, jsonb_build_object('action', 'code_confirmed'));

  RETURN QUERY SELECT 'verified'::TEXT, v_session_raw;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_verify_external_code(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hcn_verify_external_code(TEXT, TEXT) TO service_role;

-- Internal: resolves a session token to its live, non-expired,
-- non-revoked token row, re-validating the UNDERLYING access token's
-- own status too (a session must never outlive what it's derived
-- from). Bumps last_used_at. Not granted directly -- used by every
-- protected operation below.
CREATE OR REPLACE FUNCTION public.hcn_resolve_external_session(p_session_token TEXT)
RETURNS public.hcn_external_access_tokens
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_hash TEXT; v_session hcn_external_verified_sessions; v_tok hcn_external_access_tokens;
BEGIN
  v_hash := encode(extensions.digest(coalesce(p_session_token, ''), 'sha256'), 'hex');
  SELECT * INTO v_session FROM hcn_external_verified_sessions WHERE session_token_hash = v_hash;
  IF v_session.id IS NULL OR v_session.revoked_at IS NOT NULL OR v_session.expires_at <= now() THEN RETURN NULL; END IF;

  v_tok := hcn_lookup_external_token_by_id(v_session.token_id);
  IF v_tok.id IS NULL OR v_tok.revoked_at IS NOT NULL OR v_tok.status NOT IN ('verified') THEN RETURN NULL; END IF;

  UPDATE hcn_external_verified_sessions SET last_used_at = now() WHERE id = v_session.id;
  RETURN v_tok;
END;
$$;

CREATE OR REPLACE FUNCTION public.hcn_lookup_external_token_by_id(p_token_id UUID)
RETURNS public.hcn_external_access_tokens
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tok hcn_external_access_tokens;
BEGIN
  SELECT * INTO v_tok FROM hcn_external_access_tokens WHERE id = p_token_id;
  IF v_tok.id IS NULL THEN RETURN NULL; END IF;
  IF v_tok.status IN ('pending', 'verified') AND v_tok.expires_at <= now() THEN
    UPDATE hcn_external_access_tokens SET status = 'expired' WHERE id = p_token_id;
    v_tok.status := 'expired';
  END IF;
  RETURN v_tok;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_resolve_external_session(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hcn_resolve_external_session(TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.hcn_lookup_external_token_by_id(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hcn_lookup_external_token_by_id(UUID) TO service_role;

-- Protected operations -- all now session-token-based, no email
-- parameter anywhere, re-validating the session (and transitively the
-- underlying token/request) on every single call.
CREATE OR REPLACE FUNCTION public.hcn_external_session_request_info(p_session_token TEXT)
RETURNS TABLE(
  outcome TEXT, request_id UUID, request_title TEXT, request_type TEXT, request_description TEXT,
  requested_items JSONB, patient_label TEXT, provider_display_name TEXT, deadline_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tok hcn_external_access_tokens; v_req hcn_clinical_requests; v_patient patients;
BEGIN
  v_tok := hcn_resolve_external_session(p_session_token);
  IF v_tok.id IS NULL THEN RETURN QUERY SELECT 'invalid_session'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::JSONB, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ; RETURN; END IF;
  SELECT * INTO v_req FROM hcn_clinical_requests WHERE id = v_tok.request_id;
  IF v_req.id IS NULL OR v_req.status NOT IN ('sent', 'response_received') THEN
    RETURN QUERY SELECT 'request_no_longer_open'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::JSONB, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ; RETURN;
  END IF;
  SELECT * INTO v_patient FROM patients WHERE id = v_req.patient_id;
  PERFORM hcn_record_request_event(v_req.id, 'request_accessed', NULL, v_tok.recipient_label, '{}'::jsonb);
  RETURN QUERY SELECT 'ok'::TEXT, v_req.id, v_req.title, v_req.request_type, v_req.description, v_req.requested_items,
    coalesce(v_patient.preferred_name, v_patient.first_name || ' ' || v_patient.last_name),
    (SELECT p.display_name FROM hcn_healthcare_providers p WHERE p.id = v_req.provider_id), v_req.deadline_at;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_external_session_request_info(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hcn_external_session_request_info(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.hcn_list_external_shared_documents(p_session_token TEXT)
RETURNS TABLE(document_id UUID, original_filename TEXT, category TEXT, version_number INTEGER, created_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tok hcn_external_access_tokens;
BEGIN
  v_tok := hcn_resolve_external_session(p_session_token);
  IF v_tok.id IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT d.id, d.original_filename, d.category, d.version_number, d.created_at
    FROM hcn_clinical_request_documents rd
    JOIN hcn_clinical_documents d ON d.id = rd.document_id
    JOIN hcn_document_grants g ON g.document_id = d.id AND g.request_id = v_tok.request_id AND g.revoked_at IS NULL
      AND (g.expires_at IS NULL OR g.expires_at > now())
    WHERE rd.request_id = v_tok.request_id AND rd.direction = 'shared_with_recipient';
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_list_external_shared_documents(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hcn_list_external_shared_documents(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.hcn_record_external_document_upload(
  p_session_token TEXT, p_storage_path TEXT, p_original_filename TEXT, p_mime_type TEXT,
  p_file_size_bytes BIGINT, p_checksum_sha256 TEXT, p_category TEXT
) RETURNS public.hcn_clinical_documents
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tok hcn_external_access_tokens; v_req hcn_clinical_requests; v_doc hcn_clinical_documents;
BEGIN
  v_tok := hcn_resolve_external_session(p_session_token);
  IF v_tok.id IS NULL THEN RAISE EXCEPTION 'Access denied or expired'; END IF;
  SELECT * INTO v_req FROM hcn_clinical_requests WHERE id = v_tok.request_id;
  IF v_req.id IS NULL OR v_req.status NOT IN ('sent', 'response_received') THEN RAISE EXCEPTION 'This request is no longer open for responses'; END IF;

  -- SEC-003: a document arriving from an external, not-yet-reviewed
  -- provider is classified as restricted clinical documentation by
  -- default -- NOT general_care_coordination -- so it is not broadly
  -- visible to every patient-assigned caregiver until a qualified
  -- clinician or Director has actually reviewed it.
  INSERT INTO hcn_clinical_documents (
    organization_id, patient_id, category, classification, storage_path, original_filename, mime_type, file_size_bytes,
    checksum_sha256, uploader_external_label
  ) VALUES (
    v_req.organization_id, v_req.patient_id, p_category, 'restricted_clinical_documentation', p_storage_path, p_original_filename, p_mime_type,
    p_file_size_bytes, p_checksum_sha256, v_tok.recipient_label || ' <' || v_tok.recipient_email || '>'
  ) RETURNING * INTO v_doc;

  INSERT INTO hcn_clinical_request_documents (request_id, document_id, direction) VALUES (v_req.id, v_doc.id, 'received_from_recipient');
  UPDATE hcn_clinical_requests SET status = 'response_received', updated_at = now(), version = version + 1 WHERE id = v_req.id;
  UPDATE hcn_external_access_tokens SET last_accessed_at = now() WHERE id = v_tok.id;

  PERFORM hcn_record_request_event(v_req.id, 'document_uploaded', NULL, v_tok.recipient_label, jsonb_build_object('document_id', v_doc.id));
  RETURN v_doc;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_record_external_document_upload(TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hcn_record_external_document_upload(TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.hcn_submit_external_response(p_session_token TEXT, p_response_text TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tok hcn_external_access_tokens; v_req hcn_clinical_requests;
BEGIN
  v_tok := hcn_resolve_external_session(p_session_token);
  IF v_tok.id IS NULL THEN RAISE EXCEPTION 'Access denied or expired'; END IF;
  SELECT * INTO v_req FROM hcn_clinical_requests WHERE id = v_tok.request_id;
  IF v_req.id IS NULL OR v_req.status NOT IN ('sent', 'response_received') THEN RAISE EXCEPTION 'This request is no longer open for responses'; END IF;

  UPDATE hcn_clinical_requests SET status = 'pending_review', updated_at = now(), version = version + 1 WHERE id = v_req.id;
  UPDATE hcn_external_access_tokens SET last_accessed_at = now() WHERE id = v_tok.id;
  PERFORM hcn_record_request_event(v_req.id, 'response_submitted', NULL, v_tok.recipient_label, jsonb_build_object('response_text', coalesce(p_response_text, '')));
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_submit_external_response(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hcn_submit_external_response(TEXT, TEXT) TO service_role;

-- Revocation must immediately invalidate any already-issued session
-- too, not just future verification attempts (SEC-004's "revoked
-- grants cannot issue fresh download access" applies equally here).
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
  UPDATE hcn_external_verified_sessions SET revoked_at = now()
  WHERE token_id IN (SELECT id FROM hcn_external_access_tokens WHERE request_id = p_request_id) AND revoked_at IS NULL;
  PERFORM hcn_record_request_event(p_request_id, 'revoked', auth.uid(), NULL, '{}'::jsonb);
END;
$$;
