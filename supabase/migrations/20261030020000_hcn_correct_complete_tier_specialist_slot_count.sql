-- HCN pre-production correction (SEC-13): license_tier_catalog's seed row
-- for 'complete' (migration 161) was inserted with specialist_slot_count
-- = 2. The owner-approved commercial terms, and SEC-13 of the governing
-- directive, require exactly 3 specialist slots for the Complete tier.
-- Migration 165's own comment already asserted "approved tier capacities
-- (0/1/3)" without ever correcting this row, so a fresh environment
-- replaying migrations from scratch would silently publish the wrong
-- capacity even though a live environment's row may have already been
-- hand-corrected via platform_owner_set_license_tier_price().
--
-- Goes through the same history-logging path that RPC uses (migration
-- 161) so this correction is itself auditable, not a silent UPDATE.
-- Idempotent: a no-op wherever the row is already 3.
DO $$
DECLARE
  v_old license_tier_catalog;
BEGIN
  SELECT * INTO v_old FROM license_tier_catalog WHERE tier_code = 'complete' FOR UPDATE;

  IF v_old.tier_code IS NOT NULL AND v_old.specialist_slot_count <> 3 THEN
    INSERT INTO license_tier_catalog_history
      (tier_code, display_name, annual_fee_cents, specialist_slot_count, version, superseded_by)
    VALUES
      (v_old.tier_code, v_old.display_name, v_old.annual_fee_cents, v_old.specialist_slot_count, v_old.version, NULL);

    UPDATE license_tier_catalog SET
      specialist_slot_count = 3,
      version = v_old.version + 1,
      updated_at = now(),
      updated_by = NULL
    WHERE tier_code = 'complete';
  END IF;
END;
$$;
