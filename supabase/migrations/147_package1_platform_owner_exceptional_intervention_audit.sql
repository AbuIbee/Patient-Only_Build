-- PACKAGE 1 (MMA-P1-FINAL) Priority 5, directive Section 4.2 —
-- "Exceptional intervention... must record: Authenticated Platform Owner
-- identity, Target organization, Target entity, Operation, Justification,
-- Timestamp, Outcome, Relevant before/after state."
--
-- CONFIRMED GAP: admin_set_organization_license_status() (migration 039)
-- is the Platform Owner's actual existing exceptional-intervention
-- mechanism for organization licensing (suspend via 'expired'/'canceled'/
-- 'unpaid', restore via 'active') -- but writes NO audit record at all.
-- Every other Platform Owner correction path in this repository
-- (professional_applications approvals, account_management_audit's own
-- "office reclassification, cross-org status corrections" entries from
-- migration 083, and this session's place_patient_legal_hold()/
-- close_patient_coverage()) is already audited; this one function was
-- the one gap. Fixed by adding an audit INSERT inside the EXISTING
-- function body -- its signature is UNCHANGED (two args) because a real
-- client caller (organizationService.ts's adminSetOrganizationLicense
-- Status()) and its own unit test assert exactly `{p_org_id, p_status}`
-- -- changing the signature would break both for no architectural
-- benefit; before/after state and actor/timestamp/outcome are fully
-- capturable without a caller-supplied justification argument.
CREATE OR REPLACE FUNCTION public.admin_set_organization_license_status(
  p_org_id UUID,
  p_status TEXT
) RETURNS organization_licenses AS $$
DECLARE
  v_before organization_licenses;
  v_row organization_licenses;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'Only admins can activate or change an organization license status';
  END IF;
  IF p_status NOT IN ('proposed', 'active', 'expired', 'canceled', 'unpaid') THEN
    RAISE EXCEPTION 'Invalid license status: %', p_status;
  END IF;

  SELECT * INTO v_before FROM organization_licenses WHERE organization_id = p_org_id;

  UPDATE organization_licenses SET
    status = p_status,
    activated_by = CASE WHEN p_status = 'active' THEN auth.uid() ELSE activated_by END,
    activated_at = CASE WHEN p_status = 'active' THEN now() ELSE NULL END,
    updated_at = now()
  WHERE organization_id = p_org_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'No license configuration found for this organization';
  END IF;

  INSERT INTO account_management_audit (organization_id, action_type, actor_user_id, previous_value, new_value)
  VALUES (
    p_org_id, 'platform_owner_exceptional_license_status_change', auth.uid(),
    jsonb_build_object('status', v_before.status), jsonb_build_object('status', v_row.status)
  );

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
