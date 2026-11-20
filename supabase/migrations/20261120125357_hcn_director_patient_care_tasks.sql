-- Clinical staff can read scoped operational tasks. Directors create
-- them and assigned caregivers record outcomes. Legacy tasks keep their policies.
ALTER TABLE public.tasks ADD COLUMN organization_id uuid
  REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX tasks_active_org_patient_idx ON public.tasks (organization_id, patient_id)
  WHERE organization_id IS NOT NULL AND is_active;

CREATE POLICY "Authorized offices can view organization care tasks"
  ON public.tasks FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND (
    hcn_private.current_director_patient_v1(organization_id, patient_id)
    OR hcn_private.current_staff_patient_v1(organization_id, patient_id)
  ));

CREATE POLICY "Organization care tasks require matching office access"
  ON public.tasks AS RESTRICTIVE FOR SELECT TO authenticated
  USING (organization_id IS NULL
    OR hcn_private.current_director_patient_v1(organization_id, patient_id)
    OR hcn_private.current_staff_patient_v1(organization_id, patient_id));

CREATE POLICY "Assigned caregivers can record organization care task outcomes"
  ON public.tasks FOR UPDATE TO authenticated
  USING (organization_id IS NOT NULL AND is_active
    AND hcn_private.current_staff_patient_v1(organization_id, patient_id, 'caregiver'))
  WITH CHECK (organization_id IS NOT NULL AND is_active
    AND hcn_private.current_staff_patient_v1(organization_id, patient_id, 'caregiver'));

CREATE POLICY "Only assigned caregivers can update organization care tasks"
  ON public.tasks AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (organization_id IS NULL OR (is_active
    AND hcn_private.current_staff_patient_v1(organization_id, patient_id, 'caregiver')))
  WITH CHECK (organization_id IS NULL OR (is_active
    AND hcn_private.current_staff_patient_v1(organization_id, patient_id, 'caregiver')));

CREATE POLICY "Organization care tasks require the Director creation routine"
  ON public.tasks AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (organization_id IS NULL);
CREATE POLICY "Preserve organization care task records"
  ON public.tasks AS RESTRICTIVE FOR DELETE TO authenticated USING (organization_id IS NULL);

CREATE FUNCTION hcn_private.guard_organization_task_outcome()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'A care task cannot change organizations' USING ERRCODE='42501';
  END IF;
  IF OLD.organization_id IS NOT NULL
    AND (to_jsonb(NEW) - ARRAY['status','refusal_reason','status_updated_by','status_updated_at','completed_at'])
      IS DISTINCT FROM
        (to_jsonb(OLD) - ARRAY['status','refusal_reason','status_updated_by','status_updated_at','completed_at'])
  THEN
    RAISE EXCEPTION 'Only the care task outcome can be updated' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION hcn_private.guard_organization_task_outcome() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER hcn_guard_organization_task_outcome
  BEFORE UPDATE ON public.tasks FOR EACH ROW
  EXECUTE FUNCTION hcn_private.guard_organization_task_outcome();

CREATE FUNCTION public.hcn_director_add_patient_care_task(
  p_organization_id uuid, p_patient_id uuid, p_task_id uuid, p_title text, p_description text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_title text := btrim(p_title);
  v_description text := NULLIF(btrim(p_description), '');
BEGIN
  IF NOT hcn_private.current_director_patient_v1(p_organization_id, p_patient_id) THEN
    RAISE EXCEPTION 'Active Director access is required for this patient' USING ERRCODE='42501';
  END IF;
  IF p_task_id IS NULL OR v_title IS NULL OR v_title = '' OR length(v_title) > 120
    OR length(v_description) > 1000
  THEN
    RAISE EXCEPTION 'Enter a task title of up to 120 characters and instructions of up to 1,000 characters'
      USING ERRCODE='22023';
  END IF;

  INSERT INTO public.tasks (id, organization_id, patient_id, title, description, is_recurring)
  VALUES (p_task_id, p_organization_id, p_patient_id, v_title, v_description, false)
  ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM public.tasks t WHERE t.id=p_task_id AND t.organization_id=p_organization_id
      AND t.patient_id=p_patient_id AND t.title=v_title AND t.description IS NOT DISTINCT FROM v_description
  ) THEN
    RAISE EXCEPTION 'The task could not be added. Try again with a new task.' USING ERRCODE='22023';
  END IF;
  RETURN p_task_id;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_director_add_patient_care_task(uuid,uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_director_add_patient_care_task(uuid,uuid,uuid,text,text) TO authenticated;

NOTIFY pgrst, 'reload schema';
