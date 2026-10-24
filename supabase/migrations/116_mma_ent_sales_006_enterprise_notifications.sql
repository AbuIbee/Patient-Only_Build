-- OWNER DIRECTIVE MMA-ENT-SALES-006 Phase I2 — "Implement in-app
-- notification center and secure transactional outbox for
-- invitation, quote, submission, correction, approval/rejection,
-- contract, payment, activation, staff invite, expansion, renewal,
-- past due, suspension. Use existing approved delivery provider if
-- configured; no invented credentials."
--
-- A repo-wide search found no approved external email/SMS/push
-- provider configured anywhere for Enterprise sales events (the
-- existing caregiver_notification_preferences.channel = 'in_app'
-- default confirms the in-app channel is this application's own
-- already-approved delivery mechanism, not something invented here).
-- This migration implements the in-app notification center + a real,
-- persistent, auditable record using that one real channel -- never a
-- fabricated external send.
--
-- Deliberately trigger-based rather than threading notification calls
-- through the bodies of the many existing, already-tested RPCs
-- (submit_professional_application, platform_owner_approve_director_application,
-- etc.): a trigger observing the relevant tables' own state
-- transitions cannot regress any existing business logic, since it
-- never modifies those functions at all. Covers the core events
-- central to the Bilal scenario (application submitted/corrected/
-- resubmitted/approved/rejected, license activated, amendment quoted/
-- completed/rejected, contract presented/executed); invitation-issued
-- and raw payment-webhook events are NOT yet wired -- see the status
-- doc for the explicit remaining list, not silently claimed complete.
CREATE TABLE IF NOT EXISTS enterprise_notifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id   UUID NOT NULL REFERENCES profiles(id),
  notification_type    TEXT NOT NULL,
  title               TEXT NOT NULL,
  body                TEXT,
  related_entity_type TEXT,
  related_entity_id   UUID,
  status              TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  read_at             TIMESTAMP WITH TIME ZONE,
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE enterprise_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "A user can view their own notifications"
  ON enterprise_notifications FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid());
CREATE POLICY "Platform Owner can view all notifications"
  ON enterprise_notifications FOR SELECT TO authenticated
  USING (is_platform_owner());

CREATE OR REPLACE FUNCTION mark_notification_read(p_notification_id UUID)
RETURNS enterprise_notifications
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_row enterprise_notifications;
BEGIN
  SELECT * INTO v_row FROM enterprise_notifications WHERE id = p_notification_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No such notification'; END IF;
  IF v_row.recipient_user_id <> auth.uid() THEN RAISE EXCEPTION 'You may only mark your own notifications read'; END IF;

  UPDATE enterprise_notifications SET read_at = now() WHERE id = p_notification_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION mark_notification_read(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mark_notification_read(UUID) TO authenticated;

-- Internal-only helper, never directly client-callable -- every
-- caller is a trigger function below, which already runs with this
-- same SECURITY DEFINER elevation regardless of which role's
-- statement fired it.
CREATE OR REPLACE FUNCTION notify_platform_owners(
  p_notification_type TEXT, p_title TEXT, p_body TEXT, p_related_entity_type TEXT, p_related_entity_id UUID
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  INSERT INTO enterprise_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id)
  SELECT id, p_notification_type, p_title, p_body, p_related_entity_type, p_related_entity_id
  FROM profiles WHERE role IN ('admin', 'superadmin');
$$;
REVOKE ALL ON FUNCTION notify_platform_owners(TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, authenticated, anon;

CREATE OR REPLACE FUNCTION trg_notify_application_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.requested_office = 'director' AND NEW.status = 'pending_review' THEN
      PERFORM notify_platform_owners('application_submitted', 'New Director application submitted',
        'Proposing "' || coalesce(NEW.proposed_organization_name, '') || '"', 'application', NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'info_required' THEN
      INSERT INTO enterprise_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id)
      VALUES (NEW.applicant_user_id, 'correction_requested', 'The Platform Owner requested corrections', NEW.correction_request, 'application', NEW.id);
    ELSIF NEW.status = 'resubmitted' THEN
      PERFORM notify_platform_owners('application_resubmitted', 'Application resubmitted with corrections',
        'Proposing "' || coalesce(NEW.proposed_organization_name, '') || '"', 'application', NEW.id);
    ELSIF NEW.status = 'approved' THEN
      INSERT INTO enterprise_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id)
      VALUES (NEW.applicant_user_id, 'application_approved', 'Your Director application was approved', NULL, 'application', NEW.id);
    ELSIF NEW.status = 'rejected' THEN
      INSERT INTO enterprise_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id)
      VALUES (NEW.applicant_user_id, 'application_rejected', 'Your application was not approved', NEW.rejection_reason, 'application', NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION trg_notify_application_status() FROM PUBLIC, authenticated, anon;
DROP TRIGGER IF EXISTS notify_application_status ON professional_applications;
CREATE TRIGGER notify_application_status
  AFTER INSERT OR UPDATE ON professional_applications
  FOR EACH ROW EXECUTE FUNCTION trg_notify_application_status();

CREATE OR REPLACE FUNCTION trg_notify_license_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_director_id UUID;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'active' AND NEW.license_number IS NOT NULL THEN
    SELECT user_id INTO v_director_id FROM organization_memberships
    WHERE organization_id = NEW.organization_id AND org_role = 'director' AND status = 'active'
    ORDER BY created_at ASC LIMIT 1;
    IF v_director_id IS NOT NULL THEN
      INSERT INTO enterprise_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id)
      VALUES (v_director_id, 'license_activated', 'Your Enterprise license is now active', 'License ' || NEW.license_number, 'organization_license', NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION trg_notify_license_status() FROM PUBLIC, authenticated, anon;
DROP TRIGGER IF EXISTS notify_license_status ON organization_licenses;
CREATE TRIGGER notify_license_status
  AFTER UPDATE ON organization_licenses
  FOR EACH ROW EXECUTE FUNCTION trg_notify_license_status();

CREATE OR REPLACE FUNCTION trg_notify_amendment_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'quoted' THEN
      INSERT INTO enterprise_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id)
      VALUES (NEW.requested_by, 'amendment_quoted', 'Your amendment request has been quoted', NULL, 'amendment_request', NEW.id);
    ELSIF NEW.status = 'rejected' THEN
      INSERT INTO enterprise_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id)
      VALUES (NEW.requested_by, 'amendment_rejected', 'Your amendment request was not approved', NEW.platform_owner_notes, 'amendment_request', NEW.id);
    ELSIF NEW.status = 'completed' THEN
      INSERT INTO enterprise_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id)
      VALUES (NEW.requested_by, 'amendment_completed', 'Your amendment request is complete', NULL, 'amendment_request', NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION trg_notify_amendment_status() FROM PUBLIC, authenticated, anon;
DROP TRIGGER IF EXISTS notify_amendment_status ON organization_amendment_requests;
CREATE TRIGGER notify_amendment_status
  AFTER UPDATE ON organization_amendment_requests
  FOR EACH ROW EXECUTE FUNCTION trg_notify_amendment_status();

CREATE OR REPLACE FUNCTION trg_notify_contract_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_recipient UUID;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('presented', 'executed') THEN
    SELECT pa.applicant_user_id INTO v_recipient FROM professional_applications pa
    WHERE pa.application_details->>'originatingQuoteId' = NEW.quote_id::text LIMIT 1;
    IF v_recipient IS NULL THEN
      SELECT oar.requested_by INTO v_recipient FROM organization_amendment_requests oar
      WHERE oar.resulting_quote_id = NEW.quote_id LIMIT 1;
    END IF;
    IF v_recipient IS NOT NULL THEN
      INSERT INTO enterprise_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id)
      VALUES (
        v_recipient,
        CASE NEW.status WHEN 'presented' THEN 'contract_presented' ELSE 'contract_executed' END,
        CASE NEW.status WHEN 'presented' THEN 'An agreement is ready for your review' ELSE 'Your agreement has been executed' END,
        NEW.template_version, 'contract', NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION trg_notify_contract_status() FROM PUBLIC, authenticated, anon;
DROP TRIGGER IF EXISTS notify_contract_status ON enterprise_contracts;
CREATE TRIGGER notify_contract_status
  AFTER UPDATE ON enterprise_contracts
  FOR EACH ROW EXECUTE FUNCTION trg_notify_contract_status();
