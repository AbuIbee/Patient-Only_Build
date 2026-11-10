-- HCN-CLINICAL-MASTER-002-CONTINUATION SEC-005 -- the notification
-- Edge Function previously trusted a caller-supplied
-- (requestId, rawToken, recipientEmail) triple as already being a
-- valid, matched combination. This function is the single
-- server-side source of truth it must now consult instead: it
-- independently re-derives and verifies every part of that binding
-- (caller's own authorization over the request's organization, the
-- token's hash actually resolving to a live row, that row belonging
-- to exactly this request, not revoked/expired, still at the
-- not-yet-verified "pending" stage a fresh notification is valid
-- for) and returns the ONLY recipient address the Edge Function is
-- now allowed to use -- the one already stored on the token, never
-- the caller-supplied string. It also reports whether a delivery was
-- already completed for this exact token (the natural idempotency
-- key -- a resend always mints a brand new token, so retrying the
-- SAME token's notification can never double up without this).
CREATE OR REPLACE FUNCTION public.hcn_resolve_notification_target(p_request_id UUID, p_raw_token TEXT)
RETURNS TABLE(token_id UUID, recipient_email TEXT, recipient_label TEXT, already_delivered BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_req hcn_clinical_requests; v_hash TEXT; v_tok hcn_external_access_tokens; v_already BOOLEAN;
BEGIN
  SELECT * INTO v_req FROM hcn_clinical_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'No such request'; END IF;
  IF NOT (is_active_org_director(v_req.organization_id) OR is_organization_owner(v_req.organization_id)) THEN
    RAISE EXCEPTION 'Only an active Director or the Organization Owner may send notifications for this request';
  END IF;

  v_hash := encode(extensions.digest(coalesce(p_raw_token, ''), 'sha256'), 'hex');
  SELECT * INTO v_tok FROM hcn_external_access_tokens WHERE token_hash = v_hash;
  IF v_tok.id IS NULL THEN RAISE EXCEPTION 'This access link does not match any active token.'; END IF;
  IF v_tok.request_id <> p_request_id THEN RAISE EXCEPTION 'This access link does not belong to this request.'; END IF;
  IF v_tok.revoked_at IS NOT NULL OR v_tok.status <> 'pending' THEN
    RAISE EXCEPTION 'This access link is no longer eligible for a new notification (status: %)', v_tok.status;
  END IF;
  IF v_tok.expires_at <= now() THEN RAISE EXCEPTION 'This access link has expired.'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM hcn_clinical_request_events
    WHERE request_id = p_request_id AND event_type = 'send_delivered' AND (details->>'token_id')::uuid = v_tok.id
  ) INTO v_already;

  RETURN QUERY SELECT v_tok.id, v_tok.recipient_email, v_tok.recipient_label, v_already;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_resolve_notification_target(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hcn_resolve_notification_target(UUID, TEXT) TO authenticated;
