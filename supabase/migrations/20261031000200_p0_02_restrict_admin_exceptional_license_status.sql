-- Issue #3 P0-02 — "Exceptional license activation bypass." Owner-
-- approved corrective directive, 2026-10-31.
--
-- DEFECT: admin_set_organization_license_status(uuid,text,text)
-- (migration 150) let any admin/superadmin set status='active'
-- directly -- completely bypassing annual billing, monthly
-- authorization, and executed-agreement verification -- and accepted
-- p_status='unpaid', which is not, and never has been, a value the
-- real organization_licenses_status_check constraint allows
-- ('proposed','active','expired','suspended','canceled' as of
-- migration 162). The function's own allowed-status list had silently
-- drifted out of sync with the real constraint in both directions.
--
-- FIX: this exceptional RPC can no longer set 'active' at all -- real
-- activation must go through activate_enterprise_license_from_quote(),
-- the one place that independently re-verifies payment and
-- agreements. Allowed exceptional transitions are restricted to
-- 'suspended', 'canceled', and 'expired' (matching the real
-- constraint, minus 'proposed' -- an initial state, not something an
-- exceptional intervention should manually restore to -- and minus
-- the invalid 'unpaid'). Restoration from 'suspended' back to active
-- is explicitly NOT available through this RPC; it must go through
-- the verified activation path, as directed. Adds the row lock
-- (FOR UPDATE) the directive calls out as missing; the mandatory
-- justification/audit trail from migration 150 is preserved unchanged.
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
    RAISE EXCEPTION 'Only admins can change an organization license status';
  END IF;

  IF p_status = 'active' THEN
    RAISE EXCEPTION 'This exceptional intervention RPC cannot activate a license directly. Use the verified payment/agreement activation path (activate_enterprise_license_from_quote) instead.';
  END IF;
  IF p_status NOT IN ('suspended', 'canceled', 'expired') THEN
    RAISE EXCEPTION 'Invalid or unsupported exceptional license status: %. Allowed: suspended, canceled, expired.', p_status;
  END IF;
  IF p_justification IS NULL OR char_length(btrim(p_justification)) = 0 THEN
    RAISE EXCEPTION 'A justification is required for this exceptional intervention';
  END IF;

  SELECT * INTO v_before FROM organization_licenses WHERE organization_id = p_org_id FOR UPDATE;
  IF v_before.id IS NULL THEN
    RAISE EXCEPTION 'No license configuration found for this organization';
  END IF;

  UPDATE organization_licenses SET
    status = p_status,
    updated_at = now()
  WHERE organization_id = p_org_id
  RETURNING * INTO v_row;

  INSERT INTO account_management_audit (organization_id, action_type, actor_user_id, previous_value, new_value, reason)
  VALUES (
    p_org_id, 'platform_owner_exceptional_license_status_change', auth.uid(),
    jsonb_build_object('status', v_before.status), jsonb_build_object('status', v_row.status), btrim(p_justification)
  );

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.admin_set_organization_license_status(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_organization_license_status(UUID, TEXT, TEXT) TO authenticated;
