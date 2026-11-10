-- Current plan membership must remain backed by an ACTIVE org seat,
-- ACTIVE patient assignment, ACTIVE patient coverage, and ACTIVE license.
-- Removal from care team or patient assignment must immediately revoke
-- plan visibility, participant metadata access, and posting rights.
CREATE FUNCTION public.hcn_can_view_current_coordination_plan(p_plan_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_plan public.hcn_coordination_plans;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT * INTO v_plan FROM public.hcn_coordination_plans WHERE id=p_plan_id;
  IF v_plan.id IS NULL OR NOT public.hcn_is_active_covered_patient(v_plan.organization_id,v_plan.patient_id)
    THEN RETURN false; END IF;
  IF public.is_active_org_director(v_plan.organization_id) OR public.is_organization_owner(v_plan.organization_id)
    THEN RETURN true; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.hcn_coordination_plan_participants pp
    JOIN public.organization_memberships m ON m.organization_id=pp.organization_id
      AND m.user_id=pp.participant_user_id AND m.status='active'
    JOIN public.staff_patient_assignments a ON a.organization_id=m.organization_id
      AND a.user_id=m.user_id AND a.org_role=m.org_role
      AND a.patient_id=v_plan.patient_id AND a.is_active=true
    WHERE pp.plan_id=p_plan_id AND pp.organization_id=v_plan.organization_id
      AND pp.participant_user_id=auth.uid() AND pp.removed_at IS NULL
  );
END; $$;
REVOKE ALL ON FUNCTION public.hcn_can_view_current_coordination_plan(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_can_view_current_coordination_plan(uuid) TO authenticated;

DROP POLICY IF EXISTS "A current named participant can view their plan" ON public.hcn_coordination_plans;
CREATE POLICY "A current named participant can view their plan"
ON public.hcn_coordination_plans FOR SELECT TO authenticated
USING (public.hcn_can_view_current_coordination_plan(id));

DROP POLICY IF EXISTS "A named participant can see their own participant row"
ON public.hcn_coordination_plan_participants;
CREATE POLICY "A named participant can see their own participant row"
ON public.hcn_coordination_plan_participants FOR SELECT TO authenticated
USING (participant_user_id=auth.uid() AND removed_at IS NULL
  AND public.hcn_can_view_current_coordination_plan(plan_id));

-- Existing function did not re-check staff_patient_assignments, allowing
-- former Caregivers and clinicians to POST updates after a revoked shift.
CREATE OR REPLACE FUNCTION public.hcn_post_coordination_plan_update(p_plan_id uuid,p_update_text text)
RETURNS public.hcn_coordination_plan_updates
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_plan public.hcn_coordination_plans;
        v_row public.hcn_coordination_plan_updates;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_plan FROM public.hcn_coordination_plans WHERE id=p_plan_id FOR UPDATE;
  IF v_plan.id IS NULL OR v_plan.status<>'active' THEN RAISE EXCEPTION 'Plan must be active'; END IF;
  IF NOT public.hcn_can_view_current_coordination_plan(p_plan_id)
    THEN RAISE EXCEPTION 'No current authorization to this care plan'; END IF;
  IF btrim(coalesce(p_update_text,''))='' OR char_length(p_update_text)>10000
    THEN RAISE EXCEPTION 'Plan update must contain 1-10000 characters'; END IF;
  INSERT INTO public.hcn_coordination_plan_updates(plan_id,author_id,update_text)
    VALUES(p_plan_id,auth.uid(),btrim(p_update_text)) RETURNING * INTO v_row;
  UPDATE public.hcn_coordination_plans SET updated_at=now() WHERE id=p_plan_id;
  RETURN v_row;
END; $$;
REVOKE ALL ON FUNCTION public.hcn_post_coordination_plan_update(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_post_coordination_plan_update(uuid,text) TO authenticated;

DROP POLICY IF EXISTS "Named participants and org directors can view plan updates"
ON public.hcn_coordination_plan_updates;
CREATE POLICY "Named participants and org directors can view plan updates"
ON public.hcn_coordination_plan_updates FOR SELECT TO authenticated
USING(public.hcn_can_view_current_coordination_plan(plan_id));
