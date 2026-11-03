-- HCN-ONBOARDING-PRODUCTION-001 Section 5.4 -- "Director 45-day
-- historical-access policy." The owner explicitly approved up to 45
-- days of read-only access to previously assigned historical records
-- after a Director's assignment is revoked, with immediate security
-- override. This is a genuinely new requirement -- no equivalent
-- mechanism exists anywhere in this repository's prior history.
--
-- Scope, honestly stated: this migration builds the core, reusable
-- authorization primitive (is_org_director_for_patient_with_history())
-- with full boundary-condition correctness (exactly 45*24 hours, the
-- record-predates-revocation requirement, the security-override
-- bypass) and wires it into exactly two read-only RPCs
-- (get_my_conversations()/search_my_conversations(), migration 087's
-- own bodies, re-derived verbatim with one substitution each) that
-- were independently confirmed, by reading every call site, to never
-- be reachable from any write path.
--
-- Deliberately NOT extended to is_conversation_participant() (migration
-- 036/043/087/104/120), despite it being the OTHER function
-- is_org_director_for_patient() feeds into: a full call-site audit
-- found it is the SAME shared gate used by resolve_follow_up() (an
-- UPDATE), the message_attachments and storage.objects attachment
-- INSERT policies, and the messages/conversations SELECT policies
-- all at once. Extending it would have silently handed a 45-day-window
-- revoked Director the ability to resolve follow-ups and upload new
-- attachments -- a direct violation of "no post-revocation clinical
-- writes" this session will not risk introducing under time pressure
-- without first splitting that function's read and write callers
-- apart, which this migration does not attempt. Consequence: a
-- revoked Director's historical access via this migration covers the
-- conversation LIST and each conversation's last-message preview
-- (both returned directly by get_my_conversations() itself) but NOT a
-- direct REST read of the full messages table for a given
-- conversation, which remains gated by the unmodified
-- is_conversation_participant() and will correctly deny them.
--
-- Also NOT extended to every other individual clinical table
-- (patient_notes, medications, appointments, etc., each gated by its
-- own table-specific policy, not any function this migration touches).
-- Both narrower-than-ideal scopes are tracked explicitly in
-- audit-output/HCN_ONBOARDING_PRODUCTION_001/FINAL_ACCEPTANCE_REPORT.md
-- rather than silently claimed complete.
--
-- Write paths (create_conversation, add_conversation_participant) are
-- deliberately NOT extended with the historical carve-out -- "No
-- post-revocation clinical writes" and "No new patient assignment
-- privileges" both require this: the 45-day window is read-only and
-- grants no new relationship, so a revoked Director can read an
-- existing conversation's history but can never start a new one or
-- be added to one during the window.
ALTER TABLE organization_memberships
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS historical_access_barred BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN organization_memberships.revoked_at IS
  'Server-recorded moment this membership''s status became ''revoked''. Set exactly once, by the function that performs the revocation (owner_replace_director()) -- never touched again afterward, so it cannot drift forward from an unrelated later update the way updated_at could. NULL for a membership that has never been revoked.';
COMMENT ON COLUMN organization_memberships.historical_access_barred IS
  'Section 5.4: "immediate termination on account suspension, security revocation, or another overriding restriction." When true, a revoked Director''s 45-day historical read-only grace period never applies, regardless of revoked_at -- an explicit, deliberate, auditable action by whoever performs the revocation (e.g. a for-cause removal), never inferred automatically.';

-- owner_replace_director(): re-derives migration 162's exact prior
-- body (per this codebase's own documented lesson -- migration 140's
-- header -- that copying from anything other than the latest prior
-- version silently reverts accumulated fixes), plus revoked_at and an
-- explicit, optional for-cause bar.
--
-- The explicit DROP is required, not cosmetic: CREATE OR REPLACE
-- FUNCTION does not replace a function when the parameter list
-- changes (adding p_bar_historical_access here) -- it creates a
-- SECOND overload instead, leaving the original 3-argument signature
-- in place too. PostgREST then cannot resolve which overload an RPC
-- call means and returns 300 Multiple Choices -- confirmed live, not
-- assumed (this exact migration's own first draft hit it, caught by
-- its own test suite before being left in place).
DROP FUNCTION IF EXISTS owner_replace_director(UUID, TEXT, TEXT);
CREATE OR REPLACE FUNCTION owner_replace_director(p_organization_id UUID, p_new_director_email TEXT, p_reason TEXT, p_bar_historical_access BOOLEAN DEFAULT false)
RETURNS organization_memberships
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_previous_director_id UUID;
  v_new_director_id UUID;
  v_row organization_memberships;
BEGIN
  IF NOT is_organization_owner(p_organization_id) THEN
    RAISE EXCEPTION 'Only this organization''s Owner may replace its Director';
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'A reason is required to replace a Director';
  END IF;

  SELECT id INTO v_new_director_id FROM profiles WHERE lower(email) = lower(btrim(p_new_director_email));
  IF v_new_director_id IS NULL THEN
    RAISE EXCEPTION 'No existing account found for %. Ask them to create an account first.', p_new_director_email;
  END IF;

  SELECT user_id INTO v_previous_director_id FROM organization_memberships
    WHERE organization_id = p_organization_id AND org_role = 'director' AND status = 'active' LIMIT 1;

  UPDATE organization_memberships SET status = 'revoked', revoked_at = now(), historical_access_barred = p_bar_historical_access, updated_at = now()
    WHERE organization_id = p_organization_id AND org_role = 'director' AND status = 'active';

  INSERT INTO organization_memberships (organization_id, user_id, org_role, status, invited_by)
  VALUES (p_organization_id, v_new_director_id, 'director', 'invited', auth.uid())
  ON CONFLICT (organization_id, user_id) DO UPDATE SET org_role = 'director', status = 'invited', updated_at = now()
  RETURNING * INTO v_row;

  INSERT INTO organization_ownership_events (organization_id, event_type, actor_user_id, previous_director_id, new_director_id, reason)
  VALUES (p_organization_id, 'director_replaced', auth.uid(), v_previous_director_id, v_new_director_id, p_reason);

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION owner_replace_director(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION owner_replace_director(UUID, TEXT, TEXT, BOOLEAN) TO authenticated;

-- A Platform Owner may also immediately bar historical access for an
-- already-revoked director, independent of the original replacement
-- action -- "another overriding restriction" discovered after the
-- fact (e.g. a security incident identified days later). Fully
-- audited; never silently flips without a recorded reason.
CREATE OR REPLACE FUNCTION platform_owner_bar_director_historical_access(p_organization_id UUID, p_director_user_id UUID, p_reason TEXT)
RETURNS organization_memberships
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_row organization_memberships;
BEGIN
  IF NOT is_platform_owner() THEN
    RAISE EXCEPTION 'Only the Platform Owner may bar a revoked Director''s historical access';
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;

  SELECT * INTO v_row FROM organization_memberships
    WHERE organization_id = p_organization_id AND user_id = p_director_user_id AND org_role = 'director' AND status = 'revoked'
    FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No revoked director membership found for that organization and user'; END IF;

  UPDATE organization_memberships SET historical_access_barred = true, updated_at = now()
    WHERE id = v_row.id RETURNING * INTO v_row;

  INSERT INTO account_management_audit (target_user_id, organization_id, action_type, actor_user_id, previous_value, new_value, reason)
  VALUES (p_director_user_id, p_organization_id, 'director_historical_access_barred', auth.uid(),
    jsonb_build_object('historical_access_barred', false), jsonb_build_object('historical_access_barred', true), p_reason);

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION platform_owner_bar_director_historical_access(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_owner_bar_director_historical_access(UUID, UUID, TEXT) TO authenticated;

-- The core primitive. p_record_created_at is OPTIONAL (NULL means
-- "the record's own creation time is not being checked by this
-- caller" -- used only by callers that have no natural "record was
-- created at X" concept, e.g. a conversation's own existence rather
-- than one specific message). "No access to records created after
-- revocation" is enforced by requiring the record's own timestamp to
-- be <= revoked_at whenever a timestamp is supplied.
--
-- No reliance on stale JWT claims: every input here (status,
-- revoked_at, historical_access_barred) is read fresh from
-- organization_memberships on every call -- auth.uid() only
-- identifies WHO is asking, never what they are authorized for.
CREATE OR REPLACE FUNCTION public.is_org_director_for_patient_with_history(p_user_id UUID, p_patient_id UUID, p_record_created_at TIMESTAMP WITH TIME ZONE DEFAULT NULL)
RETURNS boolean AS $$
  SELECT
    public.is_org_director_for_patient(p_user_id, p_patient_id)
    OR EXISTS (
      SELECT 1
      FROM organization_memberships om
      JOIN covered_patient_memberships cpm ON cpm.organization_id = om.organization_id
      WHERE om.user_id = p_user_id
        AND om.org_role = 'director'
        AND om.status = 'revoked'
        AND om.revoked_at IS NOT NULL
        AND om.historical_access_barred = false
        AND now() <= om.revoked_at + interval '45 days'
        AND cpm.patient_id = p_patient_id
        AND (p_record_created_at IS NULL OR p_record_created_at <= om.revoked_at)
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.is_org_director_for_patient_with_history(UUID, UUID, TIMESTAMP WITH TIME ZONE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_org_director_for_patient_with_history(UUID, UUID, TIMESTAMP WITH TIME ZONE) TO authenticated;

-- Read paths only. get_my_conversations()/search_my_conversations()
-- re-derive migration 087's exact prior bodies verbatim (read
-- directly from that migration file, not reconstructed from memory --
-- an earlier draft of this migration made exactly the mistake its own
-- header warns against and was caught and rewritten before being
-- applied anywhere) with ONE substitution each
-- (is_org_director_for_patient -> ...with_history, passing the
-- conversation's own created_at as the record timestamp -- a
-- conversation created before revocation remains readable; one
-- started after revocation, by someone else, does not become
-- readable merely because it concerns a formerly-assigned patient).
-- create_conversation()/add_conversation_participant()/send_message()
-- are NOT modified -- they remain active-director-only, by design
-- ("no post-revocation clinical writes," "no new patient assignment
-- privileges"). get_patient_care_circle() is also deliberately left
-- untouched: it lists CURRENT care-team membership for composing a
-- NEW message, not a dated historical record, and extending the
-- read-only carve-out to it would blur into the kind of ongoing
-- situational awareness this policy does not grant.
CREATE OR REPLACE FUNCTION public.get_my_conversations(p_patient_id UUID DEFAULT NULL)
RETURNS TABLE (
  conversation_id UUID, patient_id UUID, patient_name TEXT, subject TEXT,
  created_by UUID, created_at TIMESTAMP WITH TIME ZONE, updated_at TIMESTAMP WITH TIME ZONE,
  last_message_body TEXT, last_message_at TIMESTAMP WITH TIME ZONE, last_message_urgent BOOLEAN,
  unread_count BIGINT, has_open_follow_up BOOLEAN
) AS $$
  SELECT
    c.id, c.patient_id,
    COALESCE(p.preferred_name, p.first_name || ' ' || p.last_name),
    c.subject, c.created_by, c.created_at, c.updated_at,
    lm.body, lm.created_at, lm.is_urgent,
    (
      SELECT count(*) FROM messages m2
      WHERE m2.conversation_id = c.id
        AND NOT EXISTS (SELECT 1 FROM message_acknowledgments a WHERE a.message_id = m2.id AND a.user_id = auth.uid() AND a.read_at IS NOT NULL)
    ),
    EXISTS (
      SELECT 1 FROM messages m3
      JOIN message_acknowledgments a3 ON a3.message_id = m3.id
      WHERE m3.conversation_id = c.id AND a3.follow_up_requested = true AND a3.follow_up_resolved = false
    )
  FROM conversations c
  JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = auth.uid()
  JOIN patients p ON p.id = c.patient_id
  LEFT JOIN LATERAL (
    SELECT body, created_at, is_urgent FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
  ) lm ON true
  WHERE (p_patient_id IS NULL OR c.patient_id = p_patient_id)
    AND (public.is_authorized_for_patient(auth.uid(), c.patient_id) OR public.is_org_director_for_patient_with_history(auth.uid(), c.patient_id, c.created_at))
  ORDER BY c.updated_at DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.get_my_conversations(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_conversations(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_conversations(UUID) FROM anon;

CREATE OR REPLACE FUNCTION public.search_my_conversations(p_search_term TEXT)
RETURNS TABLE (conversation_id UUID) AS $$
  SELECT DISTINCT c.id
  FROM conversations c
  JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = auth.uid()
  JOIN messages m ON m.conversation_id = c.id
  WHERE btrim(COALESCE(p_search_term, '')) != '' AND m.body ILIKE '%' || p_search_term || '%'
    AND (public.is_authorized_for_patient(auth.uid(), c.patient_id) OR public.is_org_director_for_patient_with_history(auth.uid(), c.patient_id, c.created_at));
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.search_my_conversations(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_my_conversations(TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.search_my_conversations(TEXT) FROM anon;
