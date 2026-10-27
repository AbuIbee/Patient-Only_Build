-- MMA-P1-FINAL-CLOSURE Priority 5 — "For legal holds, specifically
-- investigate destructive updates, cascading deletion, privileged RPCs,
-- and Storage deletion." Migration 149 protected patient_notes/
-- patient_document_uploads/medications/medication_logs (table-row
-- deletion). Storage object deletion was not investigated at that time.
--
-- CRITICAL BUG FOUND AND FIXED while investigating this, confirmed
-- empirically before writing any policy here: patient_legal_holds has
-- RLS enabled with ONLY "Only the Platform Owner can view legal holds"
-- (is_platform_owner()). Migration 149's RESTRICTIVE policies embedded a
-- RAW subquery directly against patient_legal_holds inside the policy's
-- own USING clause -- a raw subquery is evaluated under the SAME
-- calling role as the outer query, not elevated, so for any ordinary
-- (non-admin) caller that subquery's RLS silently filters an
-- objectively-active hold row out of view, making `NOT EXISTS(...)`
-- evaluate to TRUE regardless of the hold's real state. Confirmed live:
-- `SET ROLE authenticated` as a genuine non-admin user against a row
-- known to exist returned EXISTS = false. The ONLY reason migration
-- 149's own test appeared to pass was that its "caregiver" test
-- identity was ALSO granted role='admin' (required separately, to call
-- place_patient_legal_hold()) -- it validated an admin-caregiver, not
-- the ordinary-caregiver threat model the original P1-03 finding named.
--
-- FIX: a SECURITY DEFINER wrapper, patient_has_active_legal_hold(),
-- executes with the function owner's privileges and is therefore
-- unaffected by the CALLING role's RLS on patient_legal_holds -- the
-- exact same pattern has_patient_access()/is_platform_owner() already
-- use for this exact reason throughout this engagement. Migration 159
-- (companion to this one) repoints migration 149's four existing
-- policies at this function instead of their raw subquery, without
-- rewriting migration 149 itself.
CREATE OR REPLACE FUNCTION public.patient_has_active_legal_hold(p_patient_id UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT EXISTS (SELECT 1 FROM patient_legal_holds h WHERE h.patient_id = p_patient_id AND h.status = 'active');
$function$;
REVOKE ALL ON FUNCTION public.patient_has_active_legal_hold(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.patient_has_active_legal_hold(UUID) TO authenticated, service_role;

-- Storage: `patient_media_delete` (bucket 'patient-media') authorizes
-- deletion by the patient themselves, their caregiver, or an admin --
-- with no legal-hold check at all. Object paths in this bucket are
-- <patient_id>/<rest> (confirmed by reading patient_media_delete's own
-- qual, which already relies on split_part(name,'/',1) for its own
-- authorization). Same RESTRICTIVE-policy pattern as migration 149,
-- using the new SECURITY-DEFINER-safe function from the start.
DO $$ BEGIN
  CREATE POLICY "Active legal hold blocks patient-media object deletion"
    ON storage.objects AS RESTRICTIVE FOR DELETE
    USING (
      bucket_id <> 'patient-media'
      OR NOT public.patient_has_active_legal_hold((split_part(storage.objects.name, '/', 1))::uuid)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
