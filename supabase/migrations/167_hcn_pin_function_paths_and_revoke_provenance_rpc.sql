-- HCN isolated staging security-advisor closure:
-- pin search paths only for routines without prior SET search_path.
-- PUBLIC schema CREATE is not available to anon or authenticated roles.
-- No user, license, subscription, or patient records are changed.
ALTER FUNCTION public.archival_interval() SET search_path = 'public';
ALTER FUNCTION public.assign_application_reference() SET search_path = 'public';
ALTER FUNCTION public.calculate_monthly_patient_fee_cents(integer) SET search_path = 'public';
ALTER FUNCTION public.compute_next_month_billing_anchor(text) SET search_path = 'public';
ALTER FUNCTION public.organizations_default_owner_to_creator() SET search_path = 'public';
ALTER FUNCTION public.validate_director_application_payload(jsonb,text) SET search_path = 'public';
REVOKE ALL ON FUNCTION public.enforce_patient_safety_plan_provenance() FROM PUBLIC,anon,authenticated;
