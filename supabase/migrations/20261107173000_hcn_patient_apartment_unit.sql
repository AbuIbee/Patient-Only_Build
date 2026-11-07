-- HCN: independent apartment/unit address line. No existing address values are modified.
ALTER TABLE public.hcn_patient_information ADD COLUMN IF NOT EXISTS apartment_unit text;
CREATE OR REPLACE FUNCTION public.hcn_save_patient_information(p_org_id uuid, p_patient_id uuid, p_changes jsonb, p_expected_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_prior public.hcn_patient_information; v_saved public.hcn_patient_information;
  v_key text; v_value jsonb;
BEGIN
  IF NOT public.hcn_can_access_patient_information(p_org_id,p_patient_id) THEN
    RAISE EXCEPTION 'Not authorized to edit this patient' USING ERRCODE='42501';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes)<>'object' OR p_changes='{}'::jsonb THEN
    RAISE EXCEPTION 'No patient information changes supplied';
  END IF;
  FOR v_key,v_value IN SELECT key,value FROM jsonb_each(p_changes) LOOP
    IF v_key NOT IN ('patient_email','home_phone','mobile_phone','street_address','apartment_unit',
      'city','state','postal_code','medical_care_needs','mental_health_needs',
      'physical_care_needs','additional_emergency_name','additional_emergency_relationship',
      'additional_emergency_phone','additional_emergency_mobile','additional_emergency_email')
    THEN RAISE EXCEPTION 'Unknown patient information field';
    END IF;
    IF jsonb_typeof(v_value) NOT IN ('string','null') OR length(v_value #>> '{}')>2000 THEN
      RAISE EXCEPTION 'Invalid patient information field';
    END IF;
  END LOOP;
  -- Prevent concurrent first-writer races as well as stale overwrite on existing rows.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_org_id::text||':'||p_patient_id::text,0));
  SELECT * INTO v_prior FROM public.hcn_patient_information
    WHERE organization_id=p_org_id AND patient_id=p_patient_id FOR UPDATE;
  IF FOUND AND (p_expected_version IS NULL OR p_expected_version<>v_prior.version) THEN
    RAISE EXCEPTION 'Patient information changed. Refresh before saving.'
      USING ERRCODE='PT409';
  END IF;
  IF NOT FOUND AND p_expected_version IS NOT NULL THEN
    RAISE EXCEPTION 'Patient information changed. Refresh before saving.'
      USING ERRCODE='PT409';
  END IF;

  IF v_prior.id IS NULL THEN
    INSERT INTO public.hcn_patient_information (organization_id,patient_id,updated_by)
    VALUES (p_org_id,p_patient_id,auth.uid()) RETURNING * INTO v_prior;
    -- First write version is still 1; this row will now be filled below.
  END IF;

  UPDATE public.hcn_patient_information
  SET patient_email=CASE WHEN p_changes?'patient_email' THEN nullif(btrim(p_changes->>'patient_email'),'') ELSE patient_email END,
    home_phone=CASE WHEN p_changes?'home_phone' THEN nullif(btrim(p_changes->>'home_phone'),'') ELSE home_phone END,
    mobile_phone=CASE WHEN p_changes?'mobile_phone' THEN nullif(btrim(p_changes->>'mobile_phone'),'') ELSE mobile_phone END,
    street_address=CASE WHEN p_changes?'street_address' THEN nullif(btrim(p_changes->>'street_address'),'') ELSE street_address END,
    apartment_unit=CASE WHEN p_changes?'apartment_unit' THEN nullif(btrim(p_changes->>'apartment_unit'),'') ELSE apartment_unit END,
    city=CASE WHEN p_changes?'city' THEN nullif(btrim(p_changes->>'city'),'') ELSE city END,
    state=CASE WHEN p_changes?'state' THEN nullif(btrim(p_changes->>'state'),'') ELSE state END,
    postal_code=CASE WHEN p_changes?'postal_code' THEN nullif(btrim(p_changes->>'postal_code'),'') ELSE postal_code END,
    medical_care_needs=CASE WHEN p_changes?'medical_care_needs' THEN nullif(btrim(p_changes->>'medical_care_needs'),'') ELSE medical_care_needs END,
    mental_health_needs=CASE WHEN p_changes?'mental_health_needs' THEN nullif(btrim(p_changes->>'mental_health_needs'),'') ELSE mental_health_needs END,
    physical_care_needs=CASE WHEN p_changes?'physical_care_needs' THEN nullif(btrim(p_changes->>'physical_care_needs'),'') ELSE physical_care_needs END,
    additional_emergency_name=CASE WHEN p_changes?'additional_emergency_name' THEN nullif(btrim(p_changes->>'additional_emergency_name'),'') ELSE additional_emergency_name END,
    additional_emergency_relationship=CASE WHEN p_changes?'additional_emergency_relationship' THEN nullif(btrim(p_changes->>'additional_emergency_relationship'),'') ELSE additional_emergency_relationship END,
    additional_emergency_phone=CASE WHEN p_changes?'additional_emergency_phone' THEN nullif(btrim(p_changes->>'additional_emergency_phone'),'') ELSE additional_emergency_phone END,
    additional_emergency_mobile=CASE WHEN p_changes?'additional_emergency_mobile' THEN nullif(btrim(p_changes->>'additional_emergency_mobile'),'') ELSE additional_emergency_mobile END,
    additional_emergency_email=CASE WHEN p_changes?'additional_emergency_email' THEN nullif(btrim(p_changes->>'additional_emergency_email'),'') ELSE additional_emergency_email END,
    version=version+CASE WHEN v_prior.updated_by=auth.uid() AND v_prior.version=1 AND v_prior.updated_at >= now()-interval '2 seconds' AND p_expected_version IS NULL THEN 0 ELSE 1 END,
    updated_by=auth.uid(),updated_at=now()
  WHERE organization_id=p_org_id AND patient_id=p_patient_id RETURNING * INTO v_saved;

  INSERT INTO public.hcn_patient_information_audit
    (organization_id,patient_id,actor_user_id,previous_values,updated_values)
  VALUES (p_org_id,p_patient_id,auth.uid(),to_jsonb(v_prior),to_jsonb(v_saved));
  RETURN to_jsonb(v_saved);
END;
$function$

-- Retain the pre-existing RPC access controls and revoke newly broadened PUBLIC execute privileges.
REVOKE ALL ON FUNCTION public.hcn_save_patient_information(uuid,uuid,jsonb,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_save_patient_information(uuid,uuid,jsonb,integer) TO authenticated;
