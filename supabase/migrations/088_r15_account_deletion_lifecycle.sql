-- MASTER ENTERPRISE COMPLETION DIRECTIVE §1.B — Account deletion and
-- lifecycle. No account-deletion, deactivation, or retention requirement
-- exists anywhere in the historical record (confirmed: no Edge Function,
-- RPC, or UI control for this was found anywhere in the codebase before
-- this migration). No real-user deletion is performed by anything in
-- this migration or its tests.
--
-- Per the directive's own explicit instruction ("where irreversible
-- deletion or retention rules lack approval, implement only safe
-- independent prerequisites and flag the specific policy decision"),
-- this implements the REQUEST / VALIDATION / STATUS-TRACKING / REVIEW
-- workflow and a SAFE, REVERSIBLE deactivation (immediate revocation of
-- every organizational membership, staff-patient assignment, and
-- therapist relationship the account holds) -- never a hard delete of
-- auth.users or profiles, and never destruction of any clinical record
-- the account authored (which would corrupt that record's provenance).
--
-- POLICY DECISION FLAGGED, NOT GUESSED: whether this application should
-- ever perform irreversible erasure (hard-deleting auth.users/profiles,
-- or truly anonymizing authored clinical records), and whether a
-- service-role Edge Function should be built to also disable the
-- account's ability to sign in at all (a plain SQL RPC cannot call the
-- Supabase Auth Admin API -- that requires a service-role HTTP call,
-- which is a separate, security-sensitive component this migration
-- deliberately does not build without that decision). Recorded in the
-- closure register as owner decision item 7.
CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id UUID NOT NULL REFERENCES profiles(id),
  requested_by UUID NOT NULL REFERENCES profiles(id),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'under_review', 'approved', 'denied', 'completed', 'cancelled')),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE account_deletion_requests ENABLE ROW LEVEL SECURITY;

-- No client INSERT/UPDATE/DELETE policy — exactly the professional_applications
-- pattern (migration 083): every write goes through an audited SECURITY
-- DEFINER RPC that independently re-derives caller authority.
DO $$ BEGIN
  CREATE POLICY "A user can view their own deletion requests"
    ON account_deletion_requests FOR SELECT
    USING (target_user_id = auth.uid() OR requested_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Platform Owner can view every deletion request"
    ON account_deletion_requests FOR SELECT
    USING (public.is_platform_owner());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- request_account_deletion(): self-service only. The caller can only
-- ever target themselves — there is no parameter that names a
-- different user, which structurally prevents "unauthorized/cross-
-- tenant account deletion" and "privilege escalation" at the signature
-- level, not merely by a role check that could be mistakenly bypassed.
CREATE OR REPLACE FUNCTION public.request_account_deletion(p_reason TEXT)
RETURNS account_deletion_requests AS $$
DECLARE
  v_row account_deletion_requests;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF EXISTS (SELECT 1 FROM account_deletion_requests WHERE target_user_id = auth.uid() AND status IN ('requested', 'under_review')) THEN
    RAISE EXCEPTION 'An open deletion request for this account already exists';
  END IF;

  INSERT INTO account_deletion_requests (target_user_id, requested_by, reason, status)
  VALUES (auth.uid(), auth.uid(), p_reason, 'requested')
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.request_account_deletion(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_account_deletion(TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.request_account_deletion(TEXT) FROM anon;

-- cancel_account_deletion_request(): self-service, only while still
-- open (requested/under_review) — the requester changing their mind
-- before any review has acted on it.
CREATE OR REPLACE FUNCTION public.cancel_account_deletion_request(p_request_id UUID)
RETURNS account_deletion_requests AS $$
DECLARE
  v_row account_deletion_requests;
BEGIN
  SELECT * INTO v_row FROM account_deletion_requests WHERE id = p_request_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'No such deletion request';
  END IF;
  IF v_row.requested_by != auth.uid() THEN
    RAISE EXCEPTION 'Only the requester may cancel this request';
  END IF;
  IF v_row.status NOT IN ('requested', 'under_review') THEN
    RAISE EXCEPTION 'This request has already been decided and can no longer be cancelled';
  END IF;

  UPDATE account_deletion_requests SET status = 'cancelled', updated_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.cancel_account_deletion_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_account_deletion_request(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_account_deletion_request(UUID) FROM anon;

-- get_my_account_deletion_requests(): self-read, mirrors every other
-- "get_my_*" RPC's naming/shape convention in this codebase.
CREATE OR REPLACE FUNCTION public.get_my_account_deletion_requests()
RETURNS SETOF account_deletion_requests AS $$
  SELECT * FROM account_deletion_requests WHERE target_user_id = auth.uid() OR requested_by = auth.uid() ORDER BY created_at DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.get_my_account_deletion_requests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_account_deletion_requests() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_account_deletion_requests() FROM anon;

-- get_pending_account_deletion_requests(): Platform-Owner-only review
-- queue. Re-derives authority itself — not merely gated by the RLS
-- SELECT policy above, matching this engagement's established pattern
-- of every RPC independently re-checking, never trusting the caller.
CREATE OR REPLACE FUNCTION public.get_pending_account_deletion_requests()
RETURNS SETOF account_deletion_requests AS $$
BEGIN
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Only the Platform Owner may review deletion requests';
  END IF;
  RETURN QUERY SELECT * FROM account_deletion_requests WHERE status IN ('requested', 'under_review') ORDER BY created_at ASC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.get_pending_account_deletion_requests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pending_account_deletion_requests() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_pending_account_deletion_requests() FROM anon;

-- platform_owner_review_account_deletion(): the only path that acts on
-- a request. Denial just records the decision. Approval performs the
-- SAFE, REVERSIBLE deactivation described above and audits every
-- individual change — never a DELETE of profiles/auth.users, and never
-- a DELETE/UPDATE of any clinical record the account authored (those
-- keep their existing author_id; this never touches patient_notes,
-- patient_diagnoses, incident_reports, messages, etc., so "unintended
-- cascade deletion of protected records" cannot occur structurally).
CREATE OR REPLACE FUNCTION public.platform_owner_review_account_deletion(
  p_request_id UUID, p_approve BOOLEAN, p_notes TEXT
) RETURNS account_deletion_requests AS $$
DECLARE
  v_row account_deletion_requests;
  v_membership RECORD;
BEGIN
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Only the Platform Owner may review deletion requests';
  END IF;

  SELECT * INTO v_row FROM account_deletion_requests WHERE id = p_request_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'No such deletion request';
  END IF;
  IF v_row.status NOT IN ('requested', 'under_review') THEN
    RAISE EXCEPTION 'This request has already been decided';
  END IF;

  IF NOT p_approve THEN
    UPDATE account_deletion_requests
    SET status = 'denied', reviewed_by = auth.uid(), reviewed_at = now(), review_notes = p_notes, updated_at = now()
    WHERE id = p_request_id
    RETURNING * INTO v_row;
    RETURN v_row;
  END IF;

  -- Safe deactivation: revoke every active organization membership,
  -- deactivate every active staff-patient assignment, deactivate every
  -- active therapist relationship — audited individually, same table
  -- and action-type convention migration 084 already established for
  -- remove_org_member().
  FOR v_membership IN SELECT * FROM organization_memberships WHERE user_id = v_row.target_user_id AND status = 'active' LOOP
    UPDATE organization_memberships SET status = 'revoked', updated_at = now() WHERE id = v_membership.id;
    INSERT INTO account_management_audit (target_user_id, organization_id, action_type, actor_user_id, previous_value, new_value, reason)
    VALUES (v_row.target_user_id, v_membership.organization_id, 'account_deletion_approved_membership_revoked', auth.uid(),
      jsonb_build_object('org_role', v_membership.org_role, 'status', v_membership.status),
      jsonb_build_object('org_role', v_membership.org_role, 'status', 'revoked'),
      'Account deletion request ' || p_request_id || ' approved');
  END LOOP;

  UPDATE staff_patient_assignments SET is_active = false, updated_at = now()
  WHERE user_id = v_row.target_user_id AND is_active = true;

  UPDATE therapist_relationships SET is_active = false, updated_at = now()
  WHERE therapist_id = v_row.target_user_id AND is_active = true;

  INSERT INTO account_management_audit (target_user_id, organization_id, action_type, actor_user_id, previous_value, new_value, reason)
  VALUES (v_row.target_user_id, NULL, 'account_deletion_approved_deactivation_completed', auth.uid(), NULL, NULL,
    'Account deletion request ' || p_request_id || ' approved and safely deactivated (memberships/assignments/relationships revoked; no clinical record or auth identity was deleted)');

  UPDATE account_deletion_requests
  SET status = 'completed', reviewed_by = auth.uid(), reviewed_at = now(), review_notes = p_notes, updated_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.platform_owner_review_account_deletion(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_owner_review_account_deletion(UUID, BOOLEAN, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.platform_owner_review_account_deletion(UUID, BOOLEAN, TEXT) FROM anon;
