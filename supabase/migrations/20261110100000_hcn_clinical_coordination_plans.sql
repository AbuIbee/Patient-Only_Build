-- HCN-CLINICAL-MASTER-002-CONTINUATION Phase 3 -- Feature 5, Advanced
-- Multi-Provider Coordination. A Coordination Plan is the one shared
-- object a Director explicitly assembles a care team around (e.g. "Mrs.
-- X's post-surgical recovery") -- it names its participants explicitly
-- (R5: no new specialist offices, no parallel registry; participants
-- are always either an existing internal staff member already
-- patient-assigned in their own right, or a reference to an existing
-- hcn_healthcare_providers row for an external provider's own
-- involvement, never a new identity). The plan's own update log is the
-- single shared timeline every named participant posts to and reads --
-- "one authoritative patient record," not per-office silos.

CREATE TABLE IF NOT EXISTS public.hcn_coordination_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  patient_id UUID NOT NULL REFERENCES public.patients(id),
  title TEXT NOT NULL CHECK (char_length(btrim(title)) > 0),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  closed_by UUID REFERENCES public.profiles(id),
  closing_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_hcn_coordination_plans_patient ON public.hcn_coordination_plans(patient_id, status);

ALTER TABLE public.hcn_coordination_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org directors and owners manage coordination plans" ON public.hcn_coordination_plans;
CREATE POLICY "Org directors and owners manage coordination plans" ON public.hcn_coordination_plans
  FOR ALL TO authenticated
  USING (public.is_active_org_director(organization_id) OR public.is_organization_owner(organization_id))
  WITH CHECK (public.is_active_org_director(organization_id) OR public.is_organization_owner(organization_id));
-- (The companion "named participant can view their own plan" policy
-- is added further below, once hcn_coordination_plan_participants
-- actually exists -- this table references it and cannot be created
-- before that table does.)
REVOKE ALL ON public.hcn_coordination_plans FROM PUBLIC, anon;
GRANT SELECT ON public.hcn_coordination_plans TO authenticated;
GRANT ALL ON public.hcn_coordination_plans TO service_role;

-- Named participants -- always a REAL internal user (never a
-- fabricated identity), explicitly added by the Director. An external
-- provider's involvement is recorded by REFERENCING an existing
-- hcn_healthcare_providers row (no login, no seat, no new identity),
-- distinct from an internal participant_user_id row.
CREATE TABLE IF NOT EXISTS public.hcn_coordination_plan_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.hcn_coordination_plans(id),
  -- Denormalized from the plan at insert time (never user-supplied --
  -- always set by hcn_add_coordination_plan_participant from its own
  -- already-validated v_plan.organization_id) SOLELY to avoid a
  -- circular RLS reference: this table's own "Director/Owner manage"
  -- policy would otherwise need to join back to hcn_coordination_plans,
  -- whose own SELECT policy joins to THIS table -- Postgres detects
  -- that as infinite recursion. Breaking the cycle here keeps both
  -- policies simple, independent, single-hop checks.
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  participant_type TEXT NOT NULL CHECK (participant_type IN ('internal_user', 'external_provider')),
  participant_user_id UUID REFERENCES public.profiles(id),
  external_provider_id UUID REFERENCES public.hcn_healthcare_providers(id),
  role_label TEXT NOT NULL,
  added_by UUID NOT NULL REFERENCES public.profiles(id),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at TIMESTAMPTZ,
  removed_by UUID REFERENCES public.profiles(id),
  CONSTRAINT hcn_coordination_plan_participants_type_check CHECK (
    (participant_type = 'internal_user' AND participant_user_id IS NOT NULL AND external_provider_id IS NULL) OR
    (participant_type = 'external_provider' AND participant_user_id IS NULL AND external_provider_id IS NOT NULL)
  ),
  UNIQUE (plan_id, participant_user_id),
  UNIQUE (plan_id, external_provider_id)
);
CREATE INDEX IF NOT EXISTS idx_hcn_coordination_plan_participants_plan ON public.hcn_coordination_plan_participants(plan_id);
CREATE INDEX IF NOT EXISTS idx_hcn_coordination_plan_participants_user ON public.hcn_coordination_plan_participants(participant_user_id);

ALTER TABLE public.hcn_coordination_plan_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org directors and owners manage plan participants" ON public.hcn_coordination_plan_participants;
CREATE POLICY "Org directors and owners manage plan participants" ON public.hcn_coordination_plan_participants
  FOR ALL TO authenticated
  USING (public.is_active_org_director(organization_id) OR public.is_organization_owner(organization_id))
  WITH CHECK (public.is_active_org_director(organization_id) OR public.is_organization_owner(organization_id));
DROP POLICY IF EXISTS "A named participant can see their own participant row" ON public.hcn_coordination_plan_participants;
CREATE POLICY "A named participant can see their own participant row" ON public.hcn_coordination_plan_participants
  FOR SELECT TO authenticated
  USING (participant_user_id = auth.uid());
REVOKE ALL ON public.hcn_coordination_plan_participants FROM PUBLIC, anon;
GRANT SELECT ON public.hcn_coordination_plan_participants TO authenticated;
GRANT ALL ON public.hcn_coordination_plan_participants TO service_role;

-- Without this, a named participant (caregiver/medical/therapy) could
-- never even see the hcn_coordination_plans ROW itself -- and since
-- the updates table's own policy below checks participation via a
-- nested lookup into THAT table, a subquery against it still applies
-- its own RLS to the querying user, not just the outer table's, so
-- that nested lookup would silently see nothing for them too without
-- this.
DROP POLICY IF EXISTS "A current named participant can view their plan" ON public.hcn_coordination_plans;
CREATE POLICY "A current named participant can view their plan" ON public.hcn_coordination_plans
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM hcn_coordination_plan_participants pp
    WHERE pp.plan_id = hcn_coordination_plans.id AND pp.participant_user_id = auth.uid() AND pp.removed_at IS NULL
  ));

-- The shared timeline. Any CURRENT (not removed) named participant may
-- post; visibility mirrors participation, not a broader org-wide
-- grant -- a Coordination Plan is scoped to who was actually named
-- onto it, which is the entire point of the feature (R5: not "anyone
-- in the organization," a deliberately assembled team).
CREATE TABLE IF NOT EXISTS public.hcn_coordination_plan_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.hcn_coordination_plans(id),
  author_id UUID NOT NULL REFERENCES public.profiles(id),
  update_text TEXT NOT NULL CHECK (char_length(btrim(update_text)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hcn_coordination_plan_updates_plan ON public.hcn_coordination_plan_updates(plan_id, created_at);

ALTER TABLE public.hcn_coordination_plan_updates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Named participants and org directors can view plan updates" ON public.hcn_coordination_plan_updates;
CREATE POLICY "Named participants and org directors can view plan updates" ON public.hcn_coordination_plan_updates
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM hcn_coordination_plans p
    WHERE p.id = plan_id AND (
      public.is_active_org_director(p.organization_id) OR public.is_organization_owner(p.organization_id)
      OR EXISTS (SELECT 1 FROM hcn_coordination_plan_participants pp WHERE pp.plan_id = p.id AND pp.participant_user_id = auth.uid() AND pp.removed_at IS NULL)
    )
  ));
-- SELECT is granted (gated by the RLS policy above); no INSERT grant
-- at all -- posting goes through hcn_post_coordination_plan_update()
-- only, so "is a current named participant" is re-checked server-side
-- on every post, not merely at SELECT time.
REVOKE ALL ON public.hcn_coordination_plan_updates FROM PUBLIC, anon;
GRANT SELECT ON public.hcn_coordination_plan_updates TO authenticated;
GRANT ALL ON public.hcn_coordination_plan_updates TO service_role;

-- =====================================================================
-- Functions
-- =====================================================================
CREATE OR REPLACE FUNCTION public.hcn_create_coordination_plan(p_organization_id UUID, p_patient_id UUID, p_title TEXT, p_description TEXT)
RETURNS public.hcn_coordination_plans
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row hcn_coordination_plans;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT (is_active_org_director(p_organization_id) OR is_organization_owner(p_organization_id)) THEN
    RAISE EXCEPTION 'Only an active Director or the Organization Owner may create a coordination plan';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM covered_patient_memberships c WHERE c.organization_id = p_organization_id AND c.patient_id = p_patient_id AND c.status = 'active') THEN
    RAISE EXCEPTION 'This patient is not covered by this organization';
  END IF;
  IF btrim(coalesce(p_title, '')) = '' THEN RAISE EXCEPTION 'A title is required'; END IF;

  INSERT INTO hcn_coordination_plans (organization_id, patient_id, title, description, created_by)
  VALUES (p_organization_id, p_patient_id, p_title, p_description, auth.uid())
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_create_coordination_plan(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hcn_create_coordination_plan(UUID, UUID, TEXT, TEXT) TO authenticated;

-- Adding a participant re-verifies, server-side, that they are
-- actually a real, currently-assigned member of this patient's care
-- team in their own right (or, for an external provider, that the
-- provider row is genuinely associated with this patient) -- a
-- Director cannot name someone onto a plan who has no legitimate
-- connection to the patient at all.
CREATE OR REPLACE FUNCTION public.hcn_add_coordination_plan_participant(
  p_plan_id UUID, p_participant_type TEXT, p_participant_user_id UUID, p_external_provider_id UUID, p_role_label TEXT
) RETURNS public.hcn_coordination_plan_participants
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_plan hcn_coordination_plans; v_row hcn_coordination_plan_participants;
BEGIN
  SELECT * INTO v_plan FROM hcn_coordination_plans WHERE id = p_plan_id;
  IF v_plan.id IS NULL THEN RAISE EXCEPTION 'No such coordination plan'; END IF;
  IF NOT (is_active_org_director(v_plan.organization_id) OR is_organization_owner(v_plan.organization_id)) THEN
    RAISE EXCEPTION 'Only an active Director or the Organization Owner may add participants to a coordination plan';
  END IF;
  IF v_plan.status <> 'active' THEN RAISE EXCEPTION 'This coordination plan is not active'; END IF;

  IF p_participant_type = 'internal_user' THEN
    -- A genuine, currently-active assignment to THIS patient is
    -- required for anyone being named onto the plan -- EXCEPT a
    -- Director/Owner being named for their own oversight role, since
    -- Directors are never recorded in staff_patient_assignments at all
    -- (they get patient access org-wide, via is_active_org_director,
    -- a separate authorization pattern this codebase already
    -- establishes elsewhere).
    IF NOT EXISTS (
      SELECT 1 FROM staff_patient_assignments a
      WHERE a.organization_id = v_plan.organization_id AND a.patient_id = v_plan.patient_id
        AND a.user_id = p_participant_user_id AND a.is_active = true
    ) AND NOT EXISTS (
      SELECT 1 FROM organization_memberships m
      WHERE m.organization_id = v_plan.organization_id AND m.user_id = p_participant_user_id AND m.status = 'active' AND m.org_role = 'director'
    ) THEN
      RAISE EXCEPTION 'This user has no current assignment to this patient and cannot be added to the plan';
    END IF;
    INSERT INTO hcn_coordination_plan_participants (plan_id, organization_id, participant_type, participant_user_id, role_label, added_by)
    VALUES (p_plan_id, v_plan.organization_id, 'internal_user', p_participant_user_id, p_role_label, auth.uid())
    RETURNING * INTO v_row;
  ELSIF p_participant_type = 'external_provider' THEN
    IF NOT EXISTS (
      SELECT 1 FROM hcn_patient_provider_associations assoc
      WHERE assoc.organization_id = v_plan.organization_id AND assoc.patient_id = v_plan.patient_id
        AND assoc.provider_id = p_external_provider_id AND assoc.is_active = true
    ) THEN
      RAISE EXCEPTION 'This provider is not associated with this patient and cannot be added to the plan';
    END IF;
    INSERT INTO hcn_coordination_plan_participants (plan_id, organization_id, participant_type, external_provider_id, role_label, added_by)
    VALUES (p_plan_id, v_plan.organization_id, 'external_provider', p_external_provider_id, p_role_label, auth.uid())
    RETURNING * INTO v_row;
  ELSE
    RAISE EXCEPTION 'Invalid participant type';
  END IF;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_add_coordination_plan_participant(UUID, TEXT, UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hcn_add_coordination_plan_participant(UUID, TEXT, UUID, UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.hcn_remove_coordination_plan_participant(p_participant_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_participant hcn_coordination_plan_participants; v_plan hcn_coordination_plans;
BEGIN
  SELECT * INTO v_participant FROM hcn_coordination_plan_participants WHERE id = p_participant_id;
  IF v_participant.id IS NULL THEN RAISE EXCEPTION 'No such participant'; END IF;
  SELECT * INTO v_plan FROM hcn_coordination_plans WHERE id = v_participant.plan_id;
  IF NOT (is_active_org_director(v_plan.organization_id) OR is_organization_owner(v_plan.organization_id)) THEN
    RAISE EXCEPTION 'Only an active Director or the Organization Owner may remove participants';
  END IF;
  UPDATE hcn_coordination_plan_participants SET removed_at = now(), removed_by = auth.uid() WHERE id = p_participant_id;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_remove_coordination_plan_participant(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hcn_remove_coordination_plan_participant(UUID) TO authenticated;

-- Posting re-checks CURRENT participation server-side on every call --
-- being removed from the plan immediately revokes posting rights, not
-- merely future visibility.
CREATE OR REPLACE FUNCTION public.hcn_post_coordination_plan_update(p_plan_id UUID, p_update_text TEXT)
RETURNS public.hcn_coordination_plan_updates
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_plan hcn_coordination_plans; v_authorized BOOLEAN; v_row hcn_coordination_plan_updates;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_plan FROM hcn_coordination_plans WHERE id = p_plan_id;
  IF v_plan.id IS NULL THEN RAISE EXCEPTION 'No such coordination plan'; END IF;
  IF v_plan.status <> 'active' THEN RAISE EXCEPTION 'This coordination plan is not active'; END IF;

  SELECT
    is_active_org_director(v_plan.organization_id) OR is_organization_owner(v_plan.organization_id)
    OR EXISTS (SELECT 1 FROM hcn_coordination_plan_participants pp WHERE pp.plan_id = p_plan_id AND pp.participant_user_id = auth.uid() AND pp.removed_at IS NULL)
  INTO v_authorized;
  IF NOT v_authorized THEN RAISE EXCEPTION 'You are not a current participant on this coordination plan'; END IF;
  IF btrim(coalesce(p_update_text, '')) = '' THEN RAISE EXCEPTION 'An update cannot be empty'; END IF;

  INSERT INTO hcn_coordination_plan_updates (plan_id, author_id, update_text) VALUES (p_plan_id, auth.uid(), p_update_text)
  RETURNING * INTO v_row;
  UPDATE hcn_coordination_plans SET updated_at = now() WHERE id = p_plan_id;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_post_coordination_plan_update(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hcn_post_coordination_plan_update(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.hcn_close_coordination_plan(p_plan_id UUID, p_closing_summary TEXT)
RETURNS public.hcn_coordination_plans
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_plan hcn_coordination_plans; v_row hcn_coordination_plans;
BEGIN
  SELECT * INTO v_plan FROM hcn_coordination_plans WHERE id = p_plan_id;
  IF v_plan.id IS NULL THEN RAISE EXCEPTION 'No such coordination plan'; END IF;
  IF NOT (is_active_org_director(v_plan.organization_id) OR is_organization_owner(v_plan.organization_id)) THEN
    RAISE EXCEPTION 'Only an active Director or the Organization Owner may close a coordination plan';
  END IF;
  UPDATE hcn_coordination_plans SET status = 'completed', closed_by = auth.uid(), closed_at = now(),
    closing_summary = p_closing_summary, updated_at = now(), version = version + 1
  WHERE id = p_plan_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_close_coordination_plan(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hcn_close_coordination_plan(UUID, TEXT) TO authenticated;
