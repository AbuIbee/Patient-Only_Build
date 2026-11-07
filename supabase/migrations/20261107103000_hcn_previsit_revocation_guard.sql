-- HCN P0: revoke pre-visit approval immediately on loss of caregiver assignment / license.
CREATE OR REPLACE FUNCTION public.hcn_is_previsit_current(p_visit_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
  SELECT EXISTS(
    SELECT 1 FROM public.hcn_previsit_acknowledgments ack
    JOIN public.caregiver_visits v ON v.id=ack.visit_id
    WHERE ack.visit_id=p_visit_id
      AND ack.caregiver_id=v.caregiver_id AND ack.organization_id=v.organization_id
      AND (v.caregiver_id=(SELECT auth.uid()) OR public.is_active_org_director(v.organization_id))
      AND ack.patient_id=v.patient_id
      -- A previously valid receipt must be revoked with the assignment,
      -- membership, organization license or patient coverage.
      AND EXISTS (
        SELECT 1
        FROM public.staff_patient_assignments a
        JOIN public.organization_memberships m
          ON m.organization_id=a.organization_id AND m.user_id=a.user_id
        JOIN public.organization_licenses l
          ON l.organization_id=a.organization_id AND l.status='active'
        JOIN public.covered_patient_memberships c
          ON c.organization_id=a.organization_id AND c.patient_id=a.patient_id AND c.status='active'
        WHERE a.organization_id=v.organization_id
          AND a.patient_id=v.patient_id AND a.user_id=v.caregiver_id
          AND a.org_role='caregiver' AND a.is_active
          AND m.org_role='caregiver' AND m.status='active'
      )
      AND ack.acknowledged_at>now()-interval '24 hours'
      AND ack.latest_handoff_at IS NOT DISTINCT FROM (
        SELECT max(h.created_at) FROM public.shift_handoffs h
         WHERE h.organization_id=v.organization_id AND h.patient_id=v.patient_id
      )
      AND ack.latest_patient_note_at IS NOT DISTINCT FROM (
        SELECT max(n.updated_at) FROM public.patient_notes n
         WHERE n.patient_id=v.patient_id AND n.note_type NOT IN
           ('therapist_session','clinical_observation','care_partner_personal')
      )
      AND ack.latest_medications_at IS NOT DISTINCT FROM
        (SELECT max(m.updated_at) FROM public.medications m WHERE m.patient_id=v.patient_id)
      AND ack.latest_contacts_at IS NOT DISTINCT FROM
        (SELECT max(p.updated_at) FROM public.patient_care_providers p WHERE p.patient_id=v.patient_id)
      AND ack.latest_patient_information_at IS NOT DISTINCT FROM
        (SELECT max(i.updated_at) FROM public.hcn_patient_information i WHERE i.patient_id=v.patient_id AND i.organization_id=v.organization_id)
  );
$fn$;
REVOKE ALL ON FUNCTION public.hcn_is_previsit_current(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_is_previsit_current(uuid) TO authenticated,service_role;

