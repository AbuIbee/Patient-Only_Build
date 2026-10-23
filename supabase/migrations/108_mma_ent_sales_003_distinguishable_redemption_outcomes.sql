-- OWNER DIRECTIVE MMA-ENT-SALES-003 §1 — finish the Phase C invitation-
-- redemption bridge. The original redeem_quote_invitation() (migration
-- 107) deliberately collapsed every failure into one generic message
-- ("Invalid, expired, or already-used invitation") to avoid acting as
-- an oracle for a caller presenting a GUESSED token. That property is
-- preserved for truly unmatched input here -- "not_found" still reveals
-- nothing about garbage input, and brute-forcing a real 256-bit token
-- remains infeasible regardless. But MMA-ENT-SALES-003 correctly asks
-- for distinguishable outcomes so a legitimate recipient (who, by
-- definition, already possesses a real, once-issued token) can be told
-- WHY it stopped working -- expired vs. revoked vs. already redeemed
-- vs. a genuine recipient-identity mismatch -- rather than one opaque
-- error. Once a token_hash actually matches a real row, the remaining
-- ambiguity is low-sensitivity state, not a new disclosure.
--
-- Returns a single row with an `outcome` column instead of raising an
-- exception for the "not redeemable" cases (still raises for a
-- structurally invalid call, e.g. an empty token). `outcome` is one of:
-- 'redeemed' | 'not_found' | 'expired' | 'revoked' | 'already_used' |
-- 'wrong_recipient'. Only 'redeemed' populates the quote/organization
-- fields; every other outcome returns them NULL. This is a forward-only
-- replacement (CREATE OR REPLACE) of an already-applied function --
-- migration 107's own file is left untouched.
-- The return shape itself changes (an added `outcome` leading column),
-- which Postgres does not allow via CREATE OR REPLACE alone.
DROP FUNCTION IF EXISTS redeem_quote_invitation(TEXT);
CREATE FUNCTION redeem_quote_invitation(p_token TEXT)
RETURNS TABLE(
  outcome TEXT,
  quote_id UUID,
  prospective_organization_name TEXT,
  package_type TEXT,
  proposed_licensed_seats INTEGER,
  proposed_covered_patient_capacity INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_hash TEXT; v_inv sales_quote_invitations; v_caller_email TEXT; v_quote sales_quotes; v_prospect sales_prospects;
BEGIN
  IF btrim(coalesce(p_token,'')) = '' THEN
    RAISE EXCEPTION 'A token is required';
  END IF;
  SELECT email INTO v_caller_email FROM profiles WHERE id = auth.uid();
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  SELECT * INTO v_inv FROM sales_quote_invitations WHERE token_hash = v_hash FOR UPDATE;
  IF v_inv.id IS NULL THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::INTEGER, NULL::INTEGER;
    RETURN;
  END IF;

  -- Lazy-expire bookkeeping: a pending row past its own expires_at is
  -- reported (and recorded) as expired, not "not found".
  IF v_inv.status = 'pending' AND v_inv.expires_at <= now() THEN
    UPDATE sales_quote_invitations SET status = 'expired' WHERE id = v_inv.id;
    v_inv.status := 'expired';
  END IF;

  IF v_inv.status = 'revoked' THEN
    RETURN QUERY SELECT 'revoked'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::INTEGER, NULL::INTEGER;
    RETURN;
  END IF;
  IF v_inv.status = 'accepted' THEN
    RETURN QUERY SELECT 'already_used'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::INTEGER, NULL::INTEGER;
    RETURN;
  END IF;
  IF v_inv.status = 'expired' THEN
    RETURN QUERY SELECT 'expired'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::INTEGER, NULL::INTEGER;
    RETURN;
  END IF;
  -- Only 'pending' remains. Recipient-identity binding: the caller's OWN
  -- profiles.email, never a client-supplied value.
  IF lower(btrim(v_inv.recipient_email)) <> lower(btrim(coalesce(v_caller_email,''))) THEN
    RETURN QUERY SELECT 'wrong_recipient'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::INTEGER, NULL::INTEGER;
    RETURN;
  END IF;

  SELECT * INTO v_quote FROM sales_quotes WHERE id = v_inv.quote_id;
  IF v_quote.id IS NULL OR v_quote.status <> 'sent' THEN
    -- Defensive: every RPC that revokes/supersedes a quote already
    -- cascades to revoke its pending invitations, so this should not
    -- occur in practice. If it ever does, report it as revoked rather
    -- than silently redeeming stale terms.
    RETURN QUERY SELECT 'revoked'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::INTEGER, NULL::INTEGER;
    RETURN;
  END IF;
  SELECT * INTO v_prospect FROM sales_prospects WHERE id = v_quote.prospect_id;

  UPDATE sales_quote_invitations SET status = 'accepted', accepted_by = auth.uid(), accepted_at = now() WHERE id = v_inv.id;

  RETURN QUERY SELECT 'redeemed'::TEXT, v_quote.id, v_prospect.prospective_organization_name, v_quote.package_type, v_quote.proposed_licensed_seats, v_quote.proposed_covered_patient_capacity;
END;
$$;
REVOKE ALL ON FUNCTION redeem_quote_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION redeem_quote_invitation(TEXT) TO authenticated;
