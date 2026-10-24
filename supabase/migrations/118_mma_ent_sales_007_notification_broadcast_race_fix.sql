-- OWNER DIRECTIVE MMA-ENT-SALES-007-FINAL — P0 data-integrity fix.
--
-- Found while regression-testing migration 117: running the full
-- integration suite (many test files' transactions interleaving
-- against the same local DB) intermittently failed
-- submit_professional_application itself with:
--   "insert or update on table enterprise_notifications violates
--    foreign key constraint enterprise_notifications_recipient_user_id_fkey"
-- raised from inside trg_notify_application_status ->
-- notify_platform_owners.
--
-- Root cause: notify_platform_owners (migration 116) is a single
-- INSERT ... SELECT id FROM profiles WHERE role IN ('admin',
-- 'superadmin') statement. Postgres foreign-key triggers always check
-- the referenced row against the *current* committed state, not the
-- inserting statement's own snapshot -- by design, so a FK can never
-- reference a row that turns out not to exist. If a profile with
-- role='admin' is deleted (or its role changed away) by a concurrent,
-- already-committed transaction in the narrow window between this
-- statement's internal SELECT and its FK check, the INSERT raises an
-- FK violation. Because this function is called from inside the
-- *same transaction* as the real business action (e.g. a Director's
-- professional_applications INSERT), that violation aborts the whole
-- business transaction -- so a stale/removed Platform Owner elsewhere
-- in the system can make an unrelated application submission fail
-- with an opaque Postgres error. Notification delivery is explicitly
-- a side effect per migration 116's own design intent ("never modifies
-- any existing tested RPC") and must never be able to fail the real
-- action it is merely observing.
--
-- Fix: deliver to each recipient individually inside its own
-- exception-isolated sub-block, so one vanished/invalid recipient
-- degrades to a skipped notification (silently, since there is no
-- external audit channel for this -- the recipient no longer exists
-- to care) rather than rolling back the triggering business
-- transaction.
CREATE OR REPLACE FUNCTION notify_platform_owners(
  p_notification_type TEXT, p_title TEXT, p_body TEXT, p_related_entity_type TEXT, p_related_entity_id UUID
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_recipient_id UUID;
BEGIN
  FOR v_recipient_id IN SELECT id FROM profiles WHERE role IN ('admin', 'superadmin') LOOP
    BEGIN
      INSERT INTO enterprise_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id)
      VALUES (v_recipient_id, p_notification_type, p_title, p_body, p_related_entity_type, p_related_entity_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION notify_platform_owners(TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, authenticated, anon;
