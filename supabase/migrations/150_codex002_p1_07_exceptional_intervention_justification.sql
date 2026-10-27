-- MMA-P1-CODEX-002 P1-07 — "Platform Owner intervention justification."
-- Independent Codex audit: migration 147's audit fix captures actor/
-- before/after but the RPC has no justification input at all, so the
-- resulting audit row's `reason` is always NULL -- accountability remains
-- incomplete despite the new audit insert.
--
-- FIX: add a mandatory, non-empty p_justification parameter. The audit
-- correction explicitly permits "update callers/tests together" -- the
-- one real caller (organizationService.ts's
-- adminSetOrganizationLicenseStatus(), confirmed by grep to have no
-- actual UI call site) and its own unit test are updated in this same
-- commit, not left to silently break.
CREATE OR REPLACE FUNCTION public.admin_set_organization_license_status(
  p_org_id UUID,
  p_status TEXT,
  p_justification TEXT
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
  IF p_justification IS NULL OR char_length(btrim(p_justification)) = 0 THEN
    RAISE EXCEPTION 'A justification is required for this exceptional intervention';
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

  INSERT INTO account_management_audit (organization_id, action_type, actor_user_id, previous_value, new_value, reason)
  VALUES (
    p_org_id, 'platform_owner_exceptional_license_status_change', auth.uid(),
    jsonb_build_object('status', v_before.status), jsonb_build_object('status', v_row.status), btrim(p_justification)
  );

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- The old two-argument signature is dropped (not merely superseded) so
-- there is exactly one callable overload and no silent fallback to the
-- unaudited-justification path.
DROP FUNCTION IF EXISTS public.admin_set_organization_license_status(UUID, TEXT);

REVOKE ALL ON FUNCTION public.admin_set_organization_license_status(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_organization_license_status(UUID, TEXT, TEXT) TO authenticated;
