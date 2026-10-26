-- MMA-CODEX-011 finding 011-11 (F-19, P2): independent audit reproduced
-- "Invite synthetic staff via UI; membership invited persists, recipient
-- enterprise_notifications empty; no outbox table found." Migration
-- 116's own comment already disclosed this honestly: "invitation-issued
-- ... events are NOT yet wired." This is that deferred event family,
-- closed the same way the other four are built -- a trigger observing
-- organization_memberships' own state, never modifying
-- invite_org_member() itself.
--
-- Also addresses the corrective backlog's "durable retry/dedup
-- delivery" half:
--
-- (1) DEDUP: a new nullable dedup_key column + a partial UNIQUE index
-- on (recipient_user_id, dedup_key), with every notification-producing
-- INSERT now supplying a stable key derived from the source event
-- (e.g. 'membership_invited:<membership id>') and using ON CONFLICT DO
-- NOTHING. A trigger that somehow fires twice for the same underlying
-- event (a retried statement, a future bug) can no longer create a
-- duplicate notification.
--
-- (2) ISOLATION: migration 118 already fixed exactly one of these five
-- INSERT sites (notify_platform_owners' broadcast loop) to isolate a
-- failed/vanished-recipient insert in its own exception block so it
-- degrades to a skipped notification rather than aborting the real
-- business transaction it is merely observing. The other four direct,
-- single-recipient INSERTs in this file never got that same treatment.
-- All of them (plus the new membership-invited trigger) now use the
-- identical BEGIN/EXCEPTION WHEN OTHERS THEN NULL pattern migration 118
-- established -- notification delivery can never fail the triggering
-- transaction, consistently, everywhere.
--
-- Scoped out, not silently claimed fixed: migration 116's own
-- disclosure also named "raw payment-webhook events" as unwired -- a
-- separate, materially larger piece (touching supabase/functions/
-- stripe-webhook/index.ts, not a trigger) not attempted here. No
-- background retry WORKER or external delivery queue exists anywhere
-- in this stack (confirmed: in-app notifications are this app's one
-- real, already-approved channel) -- "durable" here means "a failed
-- write never silently vanishes AND never blocks the real action,"
-- not "an external queue retries delivery later."

ALTER TABLE enterprise_notifications ADD COLUMN IF NOT EXISTS dedup_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS enterprise_notifications_recipient_dedup_key_idx
  ON enterprise_notifications (recipient_user_id, dedup_key) WHERE dedup_key IS NOT NULL;

CREATE OR REPLACE FUNCTION notify_platform_owners(
  p_notification_type TEXT, p_title TEXT, p_body TEXT, p_related_entity_type TEXT, p_related_entity_id UUID, p_dedup_key TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_recipient_id UUID;
BEGIN
  FOR v_recipient_id IN SELECT id FROM profiles WHERE role IN ('admin', 'superadmin') LOOP
    BEGIN
      INSERT INTO enterprise_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id, dedup_key)
      VALUES (v_recipient_id, p_notification_type, p_title, p_body, p_related_entity_type, p_related_entity_id, p_dedup_key)
      ON CONFLICT (recipient_user_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION notify_platform_owners(TEXT, TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, authenticated, anon;
DROP FUNCTION IF EXISTS notify_platform_owners(TEXT, TEXT, TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION trg_notify_application_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.requested_office = 'director' AND NEW.status = 'pending_review' THEN
      PERFORM notify_platform_owners('application_submitted', 'New Director application submitted',
        'Proposing "' || coalesce(NEW.proposed_organization_name, '') || '"', 'application', NEW.id, 'application_submitted:' || NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    BEGIN
      IF NEW.status = 'info_required' THEN
        INSERT INTO enterprise_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id, dedup_key)
        VALUES (NEW.applicant_user_id, 'correction_requested', 'The Platform Owner requested corrections', NEW.correction_request, 'application', NEW.id, 'correction_requested:' || NEW.id || ':' || NEW.updated_at)
        ON CONFLICT (recipient_user_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
      ELSIF NEW.status = 'resubmitted' THEN
        PERFORM notify_platform_owners('application_resubmitted', 'Application resubmitted with corrections',
          'Proposing "' || coalesce(NEW.proposed_organization_name, '') || '"', 'application', NEW.id, 'application_resubmitted:' || NEW.id || ':' || NEW.updated_at);
      ELSIF NEW.status = 'approved' THEN
        INSERT INTO enterprise_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id, dedup_key)
        VALUES (NEW.applicant_user_id, 'application_approved', 'Your Director application was approved', NULL, 'application', NEW.id, 'application_approved:' || NEW.id)
        ON CONFLICT (recipient_user_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
      ELSIF NEW.status = 'rejected' THEN
        INSERT INTO enterprise_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id, dedup_key)
        VALUES (NEW.applicant_user_id, 'application_rejected', 'Your application was not approved', NEW.rejection_reason, 'application', NEW.id, 'application_rejected:' || NEW.id)
        ON CONFLICT (recipient_user_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
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
      BEGIN
        INSERT INTO enterprise_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id, dedup_key)
        VALUES (v_director_id, 'license_activated', 'Your Enterprise license is now active', 'License ' || NEW.license_number, 'organization_license', NEW.id, 'license_activated:' || NEW.id)
        ON CONFLICT (recipient_user_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
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
    BEGIN
      IF NEW.status = 'quoted' THEN
        INSERT INTO enterprise_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id, dedup_key)
        VALUES (NEW.requested_by, 'amendment_quoted', 'Your amendment request has been quoted', NULL, 'amendment_request', NEW.id, 'amendment_quoted:' || NEW.id)
        ON CONFLICT (recipient_user_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
      ELSIF NEW.status = 'rejected' THEN
        INSERT INTO enterprise_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id, dedup_key)
        VALUES (NEW.requested_by, 'amendment_rejected', 'Your amendment request was not approved', NEW.platform_owner_notes, 'amendment_request', NEW.id, 'amendment_rejected:' || NEW.id)
        ON CONFLICT (recipient_user_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
      ELSIF NEW.status = 'completed' THEN
        INSERT INTO enterprise_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id, dedup_key)
        VALUES (NEW.requested_by, 'amendment_completed', 'Your amendment request is complete', NULL, 'amendment_request', NEW.id, 'amendment_completed:' || NEW.id)
        ON CONFLICT (recipient_user_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
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
      BEGIN
        INSERT INTO enterprise_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id, dedup_key)
        VALUES (
          v_recipient,
          CASE NEW.status WHEN 'presented' THEN 'contract_presented' ELSE 'contract_executed' END,
          CASE NEW.status WHEN 'presented' THEN 'An agreement is ready for your review' ELSE 'Your agreement has been executed' END,
          NEW.template_version, 'contract', NEW.id,
          (CASE NEW.status WHEN 'presented' THEN 'contract_presented:' ELSE 'contract_executed:' END) || NEW.id
        )
        ON CONFLICT (recipient_user_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
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

-- NEW: trg_notify_membership_invited -- the previously-missing
-- "invitation-issued" event. Fires only on the genuine transition INTO
-- 'invited' (a fresh INSERT with status='invited', or an UPDATE whose
-- OLD status was NOT already 'invited' -- e.g. a prior 'revoked'
-- membership being re-invited via invite_org_member()'s own ON
-- CONFLICT path) -- never re-notifies on every unrelated membership
-- update (role change while still invited, acceptance, etc).
CREATE OR REPLACE FUNCTION trg_notify_membership_invited() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_org_name TEXT;
BEGIN
  IF NEW.status = 'invited' AND NEW.org_role != 'director' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'invited') THEN
    SELECT name INTO v_org_name FROM organizations WHERE id = NEW.organization_id;
    BEGIN
      INSERT INTO enterprise_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id, dedup_key)
      VALUES (NEW.user_id, 'membership_invited', 'You''ve been invited to join ' || coalesce(v_org_name, 'an organization'),
        'Role: ' || NEW.org_role, 'organization_membership', NEW.id, 'membership_invited:' || NEW.id || ':' || NEW.updated_at)
      ON CONFLICT (recipient_user_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION trg_notify_membership_invited() FROM PUBLIC, authenticated, anon;
DROP TRIGGER IF EXISTS notify_membership_invited ON organization_memberships;
CREATE TRIGGER notify_membership_invited
  AFTER INSERT OR UPDATE ON organization_memberships
  FOR EACH ROW EXECUTE FUNCTION trg_notify_membership_invited();
