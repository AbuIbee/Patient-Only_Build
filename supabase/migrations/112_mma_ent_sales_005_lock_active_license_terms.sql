-- OWNER DIRECTIVE MMA-ENT-SALES-005 — closes a real gap surfaced while
-- building Phase G (migration 111). org_configure_license()'s own
-- original comment (migration 035) said "Never flips status to
-- 'active' ... stays 'proposed' always" and relied on that to let a
-- Director freely rewrite seats/capacity/fee at any time. That premise
-- is no longer true: migration 111 gives a license a genuine, real
-- 'active' state driven by confirmed Stripe payment against an
-- owner-approved quote. Left unpatched, a Director could call this
-- RPC AFTER real payment to unilaterally inflate capacity or change
-- the fee on an already-paid, already-licensed organization -- exactly
-- the "change amount/seats through browser requests" tampering the
-- Enterprise billing architecture was built to prevent at checkout
-- time, just reachable through a different, older door.
--
-- Fix: once a license is 'active', its seats/capacity/fee are locked;
-- only a NEW commercial process (a Platform-Owner-issued expansion/
-- renewal quote, paid and activated the same way, Phase H) can change
-- them. A Director may still freely propose/adjust these values before
-- activation, and after a cancellation/expiry (there's nothing paid to
-- protect in either of those states) -- this only locks the one state
-- that represents a live, paid commercial agreement.
CREATE OR REPLACE FUNCTION public.org_configure_license(
  p_org_id UUID,
  p_licensed_seats INTEGER,
  p_covered_patient_capacity INTEGER,
  p_annual_license_fee NUMERIC
) RETURNS organization_licenses AS $$
DECLARE
  v_existing organization_licenses;
  v_row organization_licenses;
BEGIN
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an active director of this organization may configure its license';
  END IF;
  IF p_licensed_seats IS NOT NULL AND p_licensed_seats < 0 THEN
    RAISE EXCEPTION 'licensed_seats cannot be negative';
  END IF;
  IF p_covered_patient_capacity IS NOT NULL AND p_covered_patient_capacity < 0 THEN
    RAISE EXCEPTION 'covered_patient_capacity cannot be negative';
  END IF;

  SELECT * INTO v_existing FROM organization_licenses WHERE organization_id = p_org_id;
  IF v_existing.id IS NULL THEN
    RAISE EXCEPTION 'No license configuration found for this organization';
  END IF;
  IF v_existing.status = 'active' THEN
    RAISE EXCEPTION 'This license is active under a confirmed commercial agreement -- seats, capacity, and fee can no longer be self-configured. Contact the Platform Owner for an expansion or renewal quote.';
  END IF;

  UPDATE organization_licenses SET
    licensed_seats = p_licensed_seats,
    covered_patient_capacity = p_covered_patient_capacity,
    annual_license_fee = p_annual_license_fee,
    updated_at = now()
  WHERE organization_id = p_org_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.org_configure_license(UUID, INTEGER, INTEGER, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_configure_license(UUID, INTEGER, INTEGER, NUMERIC) TO authenticated;
