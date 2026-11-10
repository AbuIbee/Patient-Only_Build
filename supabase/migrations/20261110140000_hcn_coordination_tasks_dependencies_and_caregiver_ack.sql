-- HCN-CLINICAL-MASTER-002: phase B1, auditable coordination task workflow.
-- Existing plans, offices, patients, users, clinical approvals and
-- external-request model remain authoritative. No extra offices/seats.
CREATE TABLE public.hcn_coordination_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.hcn_coordination_plans(id),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  kind text NOT NULL CHECK (kind IN ('medical_review','therapy_review','care_instruction','general')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  details text NOT NULL DEFAULT '',
  assigned_user_id uuid NOT NULL REFERENCES public.profiles(id),
  source_document_id uuid REFERENCES public.hcn_clinical_documents(id),
  due_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','submitted','approved','cancelled')),
  result_note text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  submitted_by uuid REFERENCES public.profiles(id),
  reviewed_by uuid REFERENCES public.profiles(id),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hcn_task_results_controlled CHECK (
    (status <> 'approved' OR reviewed_by IS NOT NULL)
    AND (status <> 'submitted' OR submitted_by IS NOT NULL)
  )
);
CREATE INDEX hcn_coordination_tasks_plan_idx ON public.hcn_coordination_tasks(plan_id,due_at);
CREATE INDEX hcn_coordination_tasks_assignee_idx ON public.hcn_coordination_tasks(assigned_user_id,status);

CREATE TABLE public.hcn_coordination_task_dependencies (
  task_id uuid NOT NULL REFERENCES public.hcn_coordination_tasks(id),
  prerequisite_task_id uuid NOT NULL REFERENCES public.hcn_coordination_tasks(id),
  PRIMARY KEY (task_id,prerequisite_task_id),
  CHECK (task_id <> prerequisite_task_id)
);
CREATE TABLE public.hcn_coordination_task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.hcn_coordination_tasks(id),
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  event text NOT NULL CHECK (event IN ('created','started','submitted','approved','revision_requested','released','acknowledged')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hcn_coordination_task_events_task_idx ON public.hcn_coordination_task_events(task_id,created_at);
CREATE TABLE public.hcn_coordination_instruction_acks (
  task_id uuid NOT NULL REFERENCES public.hcn_coordination_tasks(id),
  caregiver_user_id uuid NOT NULL REFERENCES public.profiles(id),
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, caregiver_user_id)
);

ALTER TABLE public.hcn_coordination_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hcn_coordination_task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hcn_coordination_task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hcn_coordination_instruction_acks ENABLE ROW LEVEL SECURITY;

-- Returns FALSE on revocation of either org license, patient coverage,
-- organization membership, patient assignment, or plan participation.
-- SECURITY DEFINER allows the check to access protected membership
-- tables without granting raw membership SELECT to other staff.
CREATE FUNCTION public.hcn_can_view_coordination_task(p_task uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
DECLARE v_task public.hcn_coordination_tasks;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT * INTO v_task FROM public.hcn_coordination_tasks WHERE id=p_task;
  IF v_task.id IS NULL THEN RETURN false; END IF;
  IF NOT public.hcn_is_active_covered_patient(v_task.organization_id,v_task.patient_id) THEN RETURN false; END IF;
  IF public.is_active_org_director(v_task.organization_id) OR public.is_organization_owner(v_task.organization_id) THEN
    RETURN true;
  END IF;
  RETURN v_task.assigned_user_id=auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.hcn_coordination_plan_participants pp
      JOIN public.organization_memberships m ON m.organization_id=pp.organization_id AND m.user_id=pp.participant_user_id
      JOIN public.staff_patient_assignments a ON a.organization_id=pp.organization_id AND a.user_id=pp.participant_user_id
      WHERE pp.plan_id=v_task.plan_id AND pp.participant_user_id=auth.uid()
        AND pp.removed_at IS NULL AND m.status='active'
        AND a.patient_id=v_task.patient_id AND a.is_active=true
    );
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_can_view_coordination_task(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hcn_can_view_coordination_task(uuid) TO authenticated;

CREATE POLICY "Scope task rows to current assigned staff and directors" ON public.hcn_coordination_tasks
  FOR SELECT TO authenticated USING(public.hcn_can_view_coordination_task(id));
CREATE POLICY "Scope task dependency rows" ON public.hcn_coordination_task_dependencies
  FOR SELECT TO authenticated USING(public.hcn_can_view_coordination_task(task_id));
CREATE POLICY "Scope task events" ON public.hcn_coordination_task_events
  FOR SELECT TO authenticated USING(public.hcn_can_view_coordination_task(task_id));
CREATE POLICY "Scope caregiver acknowledgement reads" ON public.hcn_coordination_instruction_acks
  FOR SELECT TO authenticated USING(public.hcn_can_view_coordination_task(task_id));

REVOKE ALL ON public.hcn_coordination_tasks,public.hcn_coordination_task_dependencies,
  public.hcn_coordination_task_events,public.hcn_coordination_instruction_acks FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.hcn_coordination_tasks,public.hcn_coordination_task_dependencies,
  public.hcn_coordination_task_events,public.hcn_coordination_instruction_acks TO authenticated;
GRANT ALL ON public.hcn_coordination_tasks,public.hcn_coordination_task_dependencies,
  public.hcn_coordination_task_events,public.hcn_coordination_instruction_acks TO service_role;

-- Client never gains direct write access. This function rejects
-- arbitrary staff UUIDs by checking active plan membership + patient
-- assignment and appropriate specialty for clinical work.
CREATE FUNCTION public.hcn_create_coordination_task(
  p_plan_id uuid,p_title text,p_details text,p_kind text,p_assignee_id uuid,
  p_due_at timestamptz DEFAULT NULL,p_source_document_id uuid DEFAULT NULL,
  p_dependency_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS public.hcn_coordination_tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_plan public.hcn_coordination_plans; v_task public.hcn_coordination_tasks; v_dep uuid; v_type text;
BEGIN
  SELECT * INTO v_plan FROM public.hcn_coordination_plans WHERE id=p_plan_id FOR UPDATE;
  IF v_plan.id IS NULL OR v_plan.status <> 'active' THEN RAISE EXCEPTION 'Plan must be active'; END IF;
  IF NOT (public.is_active_org_director(v_plan.organization_id) OR public.is_organization_owner(v_plan.organization_id))
    THEN RAISE EXCEPTION 'Director/Owner permission required'; END IF;
  IF NOT public.hcn_is_active_covered_patient(v_plan.organization_id,v_plan.patient_id)
    THEN RAISE EXCEPTION 'Patient is not actively covered'; END IF;
  IF btrim(coalesce(p_title,''))='' OR char_length(p_title)>200 THEN RAISE EXCEPTION 'Task title must be 1-200 characters'; END IF;
  IF p_kind NOT IN ('medical_review','therapy_review','care_instruction','general')
    THEN RAISE EXCEPTION 'Invalid task kind'; END IF;
  IF char_length(coalesce(p_details,''))>10000 THEN RAISE EXCEPTION 'Task details too long'; END IF;
  SELECT m.org_role INTO v_type FROM public.hcn_coordination_plan_participants pp
    JOIN public.organization_memberships m ON m.organization_id=pp.organization_id
      AND m.user_id=pp.participant_user_id AND m.status='active'
    JOIN public.staff_patient_assignments a ON a.organization_id=pp.organization_id
      AND a.user_id=pp.participant_user_id AND a.patient_id=v_plan.patient_id AND a.is_active=true
    WHERE pp.plan_id=p_plan_id AND pp.participant_user_id=p_assignee_id AND pp.removed_at IS NULL LIMIT 1;
  IF v_type IS NULL THEN RAISE EXCEPTION 'Assignee must be an active assigned plan participant'; END IF;
  IF p_kind='medical_review' AND v_type NOT IN ('medical_professional','clinical_supervisor')
    THEN RAISE EXCEPTION 'Medical review requires an assigned medical specialist'; END IF;
  IF p_kind='therapy_review' AND v_type NOT IN ('therapist','clinical_supervisor')
    THEN RAISE EXCEPTION 'Therapy review requires an assigned therapy specialist'; END IF;
  IF p_kind='care_instruction' AND v_type<>'caregiver'
    THEN RAISE EXCEPTION 'Care instructions must target an assigned Caregiver'; END IF;
  IF p_source_document_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.hcn_clinical_documents d
    WHERE d.id=p_source_document_id AND d.patient_id=v_plan.patient_id AND d.organization_id=v_plan.organization_id
  ) THEN RAISE EXCEPTION 'Source document does not belong to this plan patient'; END IF;
  IF cardinality(coalesce(p_dependency_ids,'{}'::uuid[]))>12 THEN RAISE EXCEPTION 'No more than 12 prerequisites per task'; END IF;
  IF cardinality(coalesce(p_dependency_ids,'{}'::uuid[]))<>(
    SELECT count(DISTINCT d.id) FROM public.hcn_coordination_tasks d
    WHERE d.plan_id=p_plan_id AND d.id=ANY(coalesce(p_dependency_ids,'{}'::uuid[]))
  ) THEN RAISE EXCEPTION 'Every prerequisite must be unique and belong to the same plan'; END IF;
  INSERT INTO public.hcn_coordination_tasks(plan_id,organization_id,patient_id,kind,title,details,
      assigned_user_id,source_document_id,due_at,created_by)
  VALUES(p_plan_id,v_plan.organization_id,v_plan.patient_id,p_kind,btrim(p_title),coalesce(p_details,''),
      p_assignee_id,p_source_document_id,p_due_at,auth.uid())
  RETURNING * INTO v_task;
  FOREACH v_dep IN ARRAY coalesce(p_dependency_ids,'{}'::uuid[]) LOOP
    INSERT INTO public.hcn_coordination_task_dependencies(task_id,prerequisite_task_id) VALUES(v_task.id,v_dep);
  END LOOP;
  INSERT INTO public.hcn_coordination_task_events(task_id,actor_id,event)
    VALUES(v_task.id,auth.uid(),'created');
  RETURN v_task;
END; $$;
REVOKE ALL ON FUNCTION public.hcn_create_coordination_task(uuid,text,text,text,uuid,timestamptz,uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_create_coordination_task(uuid,text,text,text,uuid,timestamptz,uuid,uuid[]) TO authenticated;

CREATE FUNCTION public.hcn_set_coordination_task_status(p_task_id uuid,p_action text,p_result_note text DEFAULT NULL)
RETURNS public.hcn_coordination_tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_task public.hcn_coordination_tasks;
BEGIN
  SELECT * INTO v_task FROM public.hcn_coordination_tasks WHERE id=p_task_id FOR UPDATE;
  IF v_task.id IS NULL OR v_task.assigned_user_id IS DISTINCT FROM auth.uid() OR
     NOT public.hcn_can_view_coordination_task(p_task_id) THEN RAISE EXCEPTION 'Current task assignee required'; END IF;
  IF v_task.kind='care_instruction' THEN RAISE EXCEPTION 'Care instructions require Director release and Caregiver acknowledgement'; END IF;
  IF v_task.status NOT IN ('pending','in_progress') THEN RAISE EXCEPTION 'This task cannot be updated'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.hcn_coordination_task_dependencies dep
    JOIN public.hcn_coordination_tasks prev ON prev.id=dep.prerequisite_task_id
    WHERE dep.task_id=p_task_id AND prev.status<>'approved'
  ) THEN RAISE EXCEPTION 'Prerequisite tasks must be approved first'; END IF;
  IF p_action='start' AND v_task.status='pending' THEN
    UPDATE public.hcn_coordination_tasks SET status='in_progress',updated_at=now() WHERE id=p_task_id RETURNING * INTO v_task;
    INSERT INTO public.hcn_coordination_task_events(task_id,actor_id,event) VALUES(p_task_id,auth.uid(),'started');
  ELSIF p_action='submit' AND v_task.status='in_progress' THEN
    IF btrim(coalesce(p_result_note,''))='' THEN RAISE EXCEPTION 'Submission requires a result summary'; END IF;
    UPDATE public.hcn_coordination_tasks SET status='submitted',submitted_by=auth.uid(),
       submitted_at=now(),result_note=p_result_note,updated_at=now() WHERE id=p_task_id RETURNING * INTO v_task;
    INSERT INTO public.hcn_coordination_task_events(task_id,actor_id,event)
       VALUES(p_task_id,auth.uid(),'submitted');
  ELSE RAISE EXCEPTION 'Invalid task transition'; END IF;
  RETURN v_task;
END; $$;
REVOKE ALL ON FUNCTION public.hcn_set_coordination_task_status(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_set_coordination_task_status(uuid,text,text) TO authenticated;

-- Administrative coordination acceptance is NOT clinical approval.
-- A clinical instruction cannot be released to a caregiver unless its
-- SOURCE DOCUMENT has been independently clinically approved.
CREATE FUNCTION public.hcn_review_coordination_task(p_task_id uuid,p_decision text,p_note text DEFAULT NULL)
RETURNS public.hcn_coordination_tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_task public.hcn_coordination_tasks; v_plan public.hcn_coordination_plans;
BEGIN
  SELECT * INTO v_task FROM public.hcn_coordination_tasks WHERE id=p_task_id FOR UPDATE;
  IF v_task.id IS NULL THEN RAISE EXCEPTION 'No such task'; END IF;
  SELECT * INTO v_plan FROM public.hcn_coordination_plans WHERE id=v_task.plan_id;
  IF v_plan.status<>'active' OR NOT public.hcn_is_active_covered_patient(v_task.organization_id,v_task.patient_id)
    OR NOT (public.is_active_org_director(v_task.organization_id) OR public.is_organization_owner(v_task.organization_id))
    THEN RAISE EXCEPTION 'Active plan and Director/Owner authorization required'; END IF;
  IF EXISTS (SELECT 1 FROM public.hcn_coordination_task_dependencies dep
    JOIN public.hcn_coordination_tasks d ON d.id=dep.prerequisite_task_id
    WHERE dep.task_id=p_task_id AND d.status<>'approved')
    THEN RAISE EXCEPTION 'Prerequisites are not yet approved'; END IF;
  IF v_task.kind='care_instruction' THEN
    IF p_decision<>'release' OR v_task.status<>'pending'
      THEN RAISE EXCEPTION 'Care instructions may only be released once'; END IF;
    IF v_task.source_document_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.hcn_clinical_documents d
      WHERE d.id=v_task.source_document_id
        AND d.classification='caregiver_approved_instructions'
        AND d.review_status='clinical_approved'
        AND d.organization_id=v_task.organization_id AND d.patient_id=v_task.patient_id
    ) THEN RAISE EXCEPTION 'Caregiver instructions require a clinically approved source document'; END IF;
    UPDATE public.hcn_coordination_tasks SET status='approved',reviewed_by=auth.uid(),
      reviewed_at=now(),updated_at=now() WHERE id=p_task_id RETURNING * INTO v_task;
    INSERT INTO public.hcn_coordination_task_events(task_id,actor_id,event)
      VALUES(p_task_id,auth.uid(),'released');
  ELSIF p_decision='accept' AND v_task.status='submitted' THEN
    UPDATE public.hcn_coordination_tasks SET status='approved',reviewed_by=auth.uid(),
      reviewed_at=now(),updated_at=now() WHERE id=p_task_id RETURNING * INTO v_task;
    INSERT INTO public.hcn_coordination_task_events(task_id,actor_id,event)
      VALUES(p_task_id,auth.uid(),'approved');
  ELSIF p_decision='revision' AND v_task.status='submitted' THEN
    IF btrim(coalesce(p_note,''))='' THEN RAISE EXCEPTION 'Revision requires a reason'; END IF;
    UPDATE public.hcn_coordination_tasks SET status='in_progress',reviewed_by=auth.uid(),
      reviewed_at=now(),updated_at=now() WHERE id=p_task_id RETURNING * INTO v_task;
    INSERT INTO public.hcn_coordination_task_events(task_id,actor_id,event,details)
      VALUES(p_task_id,auth.uid(),'revision_requested',jsonb_build_object('note',p_note));
  ELSE RAISE EXCEPTION 'Invalid Director review transition'; END IF;
  RETURN v_task;
END; $$;
REVOKE ALL ON FUNCTION public.hcn_review_coordination_task(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_review_coordination_task(uuid,text,text) TO authenticated;

CREATE FUNCTION public.hcn_ack_coordination_instruction(p_task_id uuid)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_task public.hcn_coordination_tasks; v_time timestamptz;
BEGIN
  SELECT * INTO v_task FROM public.hcn_coordination_tasks WHERE id=p_task_id FOR UPDATE;
  IF v_task.id IS NULL OR v_task.kind<>'care_instruction' OR v_task.status<>'approved'
    OR v_task.assigned_user_id IS DISTINCT FROM auth.uid()
    OR NOT public.hcn_can_view_coordination_task(p_task_id)
    OR NOT EXISTS (
      SELECT 1 FROM public.organization_memberships m
      WHERE m.organization_id=v_task.organization_id AND m.user_id=auth.uid()
        AND m.status='active' AND m.org_role='caregiver'
    )
  THEN RAISE EXCEPTION 'Only the currently assigned Caregiver may acknowledge approved instructions'; END IF;
  INSERT INTO public.hcn_coordination_instruction_acks(task_id,caregiver_user_id)
    VALUES(p_task_id,auth.uid()) ON CONFLICT (task_id,caregiver_user_id) DO NOTHING;
  SELECT acknowledged_at INTO v_time FROM public.hcn_coordination_instruction_acks
    WHERE task_id=p_task_id AND caregiver_user_id=auth.uid();
  IF NOT EXISTS(SELECT 1 FROM public.hcn_coordination_task_events
     WHERE task_id=p_task_id AND actor_id=auth.uid() AND event='acknowledged') THEN
    INSERT INTO public.hcn_coordination_task_events(task_id,actor_id,event)
      VALUES(p_task_id,auth.uid(),'acknowledged');
  END IF;
  RETURN v_time;
END; $$;
REVOKE ALL ON FUNCTION public.hcn_ack_coordination_instruction(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_ack_coordination_instruction(uuid) TO authenticated;

CREATE FUNCTION public.hcn_list_eligible_plan_staff(p_plan_id uuid)
RETURNS TABLE(user_id uuid,display_name text,org_role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
DECLARE v_plan public.hcn_coordination_plans;
BEGIN
  SELECT * INTO v_plan FROM public.hcn_coordination_plans WHERE id=p_plan_id;
  IF v_plan.id IS NULL OR NOT (
    public.is_active_org_director(v_plan.organization_id) OR public.is_organization_owner(v_plan.organization_id))
    THEN RAISE EXCEPTION 'Director/Owner authorization required'; END IF;
  RETURN QUERY SELECT DISTINCT m.user_id,
       coalesce(nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),
         p.email,m.user_id::text)::text,
       m.org_role::text
    FROM public.staff_patient_assignments a
    JOIN public.organization_memberships m ON m.organization_id=a.organization_id
      AND m.user_id=a.user_id AND m.status='active' AND m.org_role=a.org_role
    JOIN public.profiles p ON p.id=m.user_id
    WHERE a.organization_id=v_plan.organization_id AND a.patient_id=v_plan.patient_id
      AND a.is_active=true
    ORDER BY 2;
END; $$;
REVOKE ALL ON FUNCTION public.hcn_list_eligible_plan_staff(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_list_eligible_plan_staff(uuid) TO authenticated;

CREATE FUNCTION public.hcn_get_coordination_task_metrics(p_organization_id uuid)
RETURNS TABLE(active_tasks integer,blocked_tasks integer,overdue_tasks integer,
  review_pending integer,unacknowledged_instructions integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
BEGIN
  IF NOT (public.is_active_org_director(p_organization_id) OR public.is_organization_owner(p_organization_id))
    THEN RAISE EXCEPTION 'Director/Owner authorization required'; END IF;
  RETURN QUERY SELECT
    count(*) FILTER (WHERE t.status IN ('pending','in_progress','submitted'))::integer,
    count(*) FILTER (WHERE t.status IN ('pending','in_progress') AND EXISTS (
      SELECT 1 FROM public.hcn_coordination_task_dependencies dep
      JOIN public.hcn_coordination_tasks prev ON prev.id=dep.prerequisite_task_id
      WHERE dep.task_id=t.id AND prev.status<>'approved'
    ))::integer,
    count(*) FILTER (WHERE t.due_at<now() AND t.status NOT IN ('approved','cancelled'))::integer,
    count(*) FILTER (WHERE t.status='submitted')::integer,
    count(*) FILTER (WHERE t.kind='care_instruction' AND t.status='approved'
      AND NOT EXISTS (
        SELECT 1 FROM public.hcn_coordination_instruction_acks a
        WHERE a.task_id=t.id AND a.caregiver_user_id=t.assigned_user_id
      ))::integer
    FROM public.hcn_coordination_tasks t
    JOIN public.hcn_coordination_plans p ON p.id=t.plan_id
    WHERE t.organization_id=p_organization_id AND p.status='active';
END; $$;
REVOKE ALL ON FUNCTION public.hcn_get_coordination_task_metrics(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_get_coordination_task_metrics(uuid) TO authenticated;
