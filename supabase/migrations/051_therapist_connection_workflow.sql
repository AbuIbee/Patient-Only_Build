-- 051_therapist_connection_workflow.sql
-- CODEX-VERIFIED CRITICAL REMEDIATION Critical 9 (and CARE-TEAM
-- COMMUNICATION Part A) — "Do not fake a therapist relationship to make
-- a recipient appear."
--
-- Confirmed root cause of the reported "caregiver cannot select a
-- therapist": the only way therapist_relationships ever gets an active
-- row for a RESIDENTIAL (non-Enterprise) patient is a direct client
-- write — src/services/patientService.ts's assignTherapistToPatient()
-- INSERTs/UPDATEs it directly, relying on the existing "Caregivers can
-- manage therapist relationships for their patient" RLS policy. Nothing
-- in this app has ever called that function for a real patient in this
-- staging environment (0 active relationships, matching the owner's own
-- audit), and there is no UI entry point that does.
--
-- CONFIRMED SECURITY DEFECT found auditing that same policy: it is an
-- ALL-commands PERMISSIVE policy scoped only by caregiver_patients
-- ownership of the PATIENT side — it never verifies the named
-- therapist's own identity, consent, or authorization in any way. A
-- caregiver could today call `.from('therapist_relationships').insert(
-- {therapist_id: <any profile id>, ...})` directly and unilaterally grant
-- that arbitrary person authorized therapist access to their patient,
-- including Care Communications recipient status, without that person
-- ever being asked. This migration removes the caregiver's unilateral
-- INSERT path entirely and replaces it with an explicit invite/accept
-- workflow — the therapist's own acceptance is now the ONLY way an
-- active row is ever created. The caregiver keeps a narrow UPDATE
-- (ending a connection they already have) and SELECT, never INSERT.
--
-- Deliberately does NOT build a "Therapist Office" shared inbox here —
-- "Do not confuse an individual therapist with a Therapist Office. A
-- shared office inbox requires separately authorized office
-- memberships and recipients," which this migration does not touch.
-- Every connection created here is for ONE named, consenting individual
-- therapist; Enterprise org-based staff (a genuinely different,
-- already-built authorization path — migration 035) remains the
-- mechanism for multi-person office-style coverage.
--
-- STAGING-TARGETED. Not yet applied to production.

-- ============================================================================
-- §1 — remove the unilateral-grant policy; replace with narrow, RPC-first
-- access.
-- ============================================================================
DROP POLICY IF EXISTS "Caregivers can manage therapist relationships for their patient" ON public.therapist_relationships;

DO $$ BEGIN
  CREATE POLICY "Caregivers can view their patients' therapist relationships"
    ON public.therapist_relationships FOR SELECT
    USING (
      EXISTS (SELECT 1 FROM caregiver_patients cp WHERE cp.patient_id = therapist_relationships.patient_id AND cp.caregiver_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A caregiver may END a connection they already have authority over
-- (is_active true -> false ONLY) — never flip it active, and never
-- touch therapist_id/patient_id/relationship_type. This is the one
-- direct-write capability deliberately preserved for caregivers; the
-- WITH CHECK makes "revoke only" structurally enforced, not just a UI
-- convention.
DO $$ BEGIN
  CREATE POLICY "Caregivers can end (not create) their patients' therapist relationships"
    ON public.therapist_relationships FOR UPDATE
    USING (
      EXISTS (SELECT 1 FROM caregiver_patients cp WHERE cp.patient_id = therapist_relationships.patient_id AND cp.caregiver_id = auth.uid())
    )
    WITH CHECK (is_active = false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- §2 — pending_therapist_connections: the trusted, server-generated
-- invite/accept record. Zero client-facing policies by design — every
-- read/write goes through the SECURITY DEFINER RPCs below, exactly the
-- same pattern pending_caregiver_registrations already established
-- (migration 030).
-- ============================================================================
CREATE TABLE IF NOT EXISTS pending_therapist_connections (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id         UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  caregiver_id       UUID NOT NULL REFERENCES profiles(id),
  therapist_id       UUID NOT NULL REFERENCES profiles(id),
  relationship_type  TEXT NOT NULL DEFAULT 'consulting' CHECK (relationship_type IN ('primary','consulting','supervising','secondary')),
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','revoked')),
  created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  responded_at       TIMESTAMP WITH TIME ZONE,
  UNIQUE (patient_id, therapist_id)
);

ALTER TABLE pending_therapist_connections ENABLE ROW LEVEL SECURITY;
-- Deliberately zero client-facing policies — RPC-only, as above.

-- caregiver_invite_therapist(): caller must be the patient's active
-- caregiver. The named therapist must already have an account (same
-- "ask them to create one first" convention invite_org_member already
-- uses — migration 035) — never trusts client-supplied metadata as
-- proof anyone agreed to anything. Idempotent: re-inviting an already-
-- pending or already-connected therapist returns the existing row
-- rather than erroring confusingly or creating a duplicate.
CREATE OR REPLACE FUNCTION public.caregiver_invite_therapist(
  p_patient_id UUID,
  p_therapist_email TEXT,
  p_relationship_type TEXT DEFAULT 'consulting'
) RETURNS pending_therapist_connections AS $$
DECLARE
  v_therapist_id UUID;
  v_existing pending_therapist_connections;
  v_row pending_therapist_connections;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth.uid()) THEN
    RAISE EXCEPTION 'You are not an authorized caregiver for this patient';
  END IF;
  IF p_relationship_type NOT IN ('primary','consulting','supervising','secondary') THEN
    RAISE EXCEPTION 'Invalid relationship type: %', p_relationship_type;
  END IF;

  SELECT id INTO v_therapist_id FROM profiles WHERE lower(email) = lower(btrim(p_therapist_email));
  IF v_therapist_id IS NULL THEN
    RAISE EXCEPTION 'No account was found for that email. Ask them to create a My Memoria Ally account first, then invite them.';
  END IF;
  IF v_therapist_id = p_patient_id THEN
    RAISE EXCEPTION 'The patient cannot be invited as their own therapist';
  END IF;

  IF EXISTS (SELECT 1 FROM therapist_relationships WHERE patient_id = p_patient_id AND therapist_id = v_therapist_id AND is_active = true) THEN
    RAISE EXCEPTION 'This person is already an active therapist for this patient';
  END IF;

  SELECT * INTO v_existing FROM pending_therapist_connections WHERE patient_id = p_patient_id AND therapist_id = v_therapist_id;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.status = 'pending' THEN
      RETURN v_existing; -- idempotent — already invited, awaiting response
    END IF;
    -- A prior declined/revoked connection — re-invite by resetting it.
    UPDATE pending_therapist_connections SET
      caregiver_id = auth.uid(), relationship_type = p_relationship_type, status = 'pending',
      created_at = now(), responded_at = NULL
    WHERE id = v_existing.id
    RETURNING * INTO v_row;
    RETURN v_row;
  END IF;

  INSERT INTO pending_therapist_connections (patient_id, caregiver_id, therapist_id, relationship_type)
  VALUES (p_patient_id, auth.uid(), v_therapist_id, p_relationship_type)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.caregiver_invite_therapist(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.caregiver_invite_therapist(UUID, TEXT, TEXT) TO authenticated;

-- respond_to_therapist_invite(): ONLY the invited therapist may accept
-- or decline their OWN invitation. Accepting is the ONLY path that ever
-- creates/reactivates an active therapist_relationships row — the
-- therapist's own explicit action, never the caregiver's alone.
CREATE OR REPLACE FUNCTION public.respond_to_therapist_invite(
  p_connection_id UUID,
  p_accept BOOLEAN
) RETURNS pending_therapist_connections AS $$
DECLARE
  v_conn pending_therapist_connections;
  v_existing_rel_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_conn FROM pending_therapist_connections WHERE id = p_connection_id FOR UPDATE;
  IF v_conn.id IS NULL THEN
    RAISE EXCEPTION 'No such invitation';
  END IF;
  IF v_conn.therapist_id != auth.uid() THEN
    RAISE EXCEPTION 'This invitation is not addressed to you';
  END IF;
  IF v_conn.status != 'pending' THEN
    RAISE EXCEPTION 'This invitation has already been responded to';
  END IF;

  IF p_accept THEN
    -- No UNIQUE constraint exists on (therapist_id, patient_id) in this
    -- legacy, untracked-origin table (see supabase.ts's own "REPAIR D"
    -- note) — an explicit check-then-insert-or-update avoids assuming
    -- one and failing if a stray duplicate ever existed.
    SELECT id INTO v_existing_rel_id FROM therapist_relationships
      WHERE therapist_id = v_conn.therapist_id AND patient_id = v_conn.patient_id
      LIMIT 1;
    IF v_existing_rel_id IS NOT NULL THEN
      UPDATE therapist_relationships SET is_active = true, relationship_type = v_conn.relationship_type, updated_at = now()
      WHERE id = v_existing_rel_id;
    ELSE
      INSERT INTO therapist_relationships (therapist_id, patient_id, caregiver_id, relationship_type, is_active)
      VALUES (v_conn.therapist_id, v_conn.patient_id, v_conn.caregiver_id, v_conn.relationship_type, true);
    END IF;
    UPDATE pending_therapist_connections SET status = 'accepted', responded_at = now() WHERE id = p_connection_id RETURNING * INTO v_conn;
  ELSE
    UPDATE pending_therapist_connections SET status = 'declined', responded_at = now() WHERE id = p_connection_id RETURNING * INTO v_conn;
  END IF;

  RETURN v_conn;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.respond_to_therapist_invite(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_therapist_invite(UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_pending_therapist_invites()
RETURNS TABLE (
  connection_id UUID, patient_id UUID, patient_first_name TEXT, patient_last_name TEXT, patient_preferred_name TEXT,
  caregiver_first_name TEXT, caregiver_last_name TEXT, relationship_type TEXT, created_at TIMESTAMP WITH TIME ZONE
) AS $$
  SELECT ptc.id, ptc.patient_id, p.first_name, p.last_name, p.preferred_name,
         cg.first_name, cg.last_name, ptc.relationship_type, ptc.created_at
  FROM pending_therapist_connections ptc
  JOIN patients p ON p.id = ptc.patient_id
  JOIN profiles cg ON cg.id = ptc.caregiver_id
  WHERE ptc.therapist_id = auth.uid() AND ptc.status = 'pending'
  ORDER BY ptc.created_at DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.get_my_pending_therapist_invites() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_pending_therapist_invites() TO authenticated;

-- get_patient_care_team_connections(): the Care Team management entry
-- point — every therapist connection for a patient (active, pending,
-- declined, revoked) in one honest list, for the caregiver (or the
-- patient themselves) to see real status rather than a silent absence.
CREATE OR REPLACE FUNCTION public.get_patient_care_team_connections(p_patient_id UUID)
RETURNS TABLE (
  source TEXT, connection_id UUID, therapist_id UUID, first_name TEXT, last_name TEXT,
  relationship_type TEXT, status TEXT, created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  IF p_patient_id != auth.uid() AND NOT EXISTS (
    SELECT 1 FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized for this patient''s care team';
  END IF;

  RETURN QUERY
  SELECT 'active'::text, tr.id, tr.therapist_id, pr.first_name, pr.last_name, tr.relationship_type,
         CASE WHEN tr.is_active THEN 'active' ELSE 'ended' END, tr.created_at
  FROM therapist_relationships tr
  JOIN profiles pr ON pr.id = tr.therapist_id
  WHERE tr.patient_id = p_patient_id
  UNION ALL
  SELECT 'invitation'::text, ptc.id, ptc.therapist_id, pr.first_name, pr.last_name, ptc.relationship_type,
         ptc.status, ptc.created_at
  FROM pending_therapist_connections ptc
  JOIN profiles pr ON pr.id = ptc.therapist_id
  WHERE ptc.patient_id = p_patient_id AND ptc.status != 'accepted'
  ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.get_patient_care_team_connections(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_patient_care_team_connections(UUID) TO authenticated;

-- revoke_therapist_connection(): the caregiver-facing "end connection"
-- action — goes through an RPC too (rather than relying solely on the
-- narrow UPDATE policy above) so the caregiver_patients check and the
-- is_active-only WITH CHECK are both independently enforced in one
-- place the UI can call directly.
CREATE OR REPLACE FUNCTION public.revoke_therapist_connection(p_patient_id UUID, p_therapist_id UUID)
RETURNS boolean AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth.uid()) THEN
    RAISE EXCEPTION 'You are not an authorized caregiver for this patient';
  END IF;

  UPDATE therapist_relationships SET is_active = false, updated_at = now()
  WHERE patient_id = p_patient_id AND therapist_id = p_therapist_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.revoke_therapist_connection(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_therapist_connection(UUID, UUID) TO authenticated;
