-- CODEX F-09 (P1, partial) — "License and office entitlements are
-- not enforced comprehensively." Independent audit
-- MMA_ENT_SALES_007_CODEX_INDEPENDENT_ACCEPTANCE.md, finding F-09,
-- target commit b362e119. One specific, bounded sub-item: "org_
-- configure_license() checks active before updating without locking
-- the license row, leaving a configure-versus-activation race."
--
-- Confirmed by reading the actual code: activate_enterprise_license_
-- from_quote() takes a row lock on organization_licenses (FOR
-- UPDATE, migration 111/123) before activating -- but org_configure_
-- license()'s own read of the same row never did. A Director calling
-- org_configure_license() at the same moment a webhook-driven
-- activation commits could have its own SELECT observe status still
-- 'proposed' (pre-activation), then its later UPDATE overwrite the
-- just-activated license's real, quote-derived commercial terms with
-- the Director's own self-chosen seats/capacity/fee -- exactly the
-- "active license terms are locked against Director self-editing"
-- guarantee migration 112 was built to provide, defeated by a race
-- rather than a missing check.
--
-- Fix: FOR UPDATE on the read, same pattern as every other
-- read-then-write-one-row function in this schema. The configure
-- call now blocks until any concurrent activation's lock releases,
-- then correctly observes status='active' and rejects.
--
-- Scoped out, not silently claimed fixed: F-09 also names "no office
-- cap/per-role-allowance model" and "legacy admin_set_organization_
-- license_status() bypasses prerequisites" -- both real, larger
-- feature/design gaps, not touched by this narrow concurrency fix.
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

  SELECT * INTO v_existing FROM organization_licenses WHERE organization_id = p_org_id FOR UPDATE;
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
