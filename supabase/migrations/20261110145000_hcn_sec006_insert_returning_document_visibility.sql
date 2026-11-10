-- SEC-006: PostgREST INSERT returns the inserted document to the
-- authorized uploader. hcn_can_view_clinical_document() performs its own
-- table lookup; under STABLE's statement-start snapshot, it cannot see
-- the document inserted by the same INSERT ... RETURNING statement.
-- That makes a legitimate upload return HTTP 403 despite valid INSERT
-- authorization. VOLATILE is required for correct snapshot visibility.
-- Does NOT relax any of the function's classification, patient or
-- organization authorization checks; it only sees this statement's row.
ALTER FUNCTION public.hcn_can_view_clinical_document(uuid) VOLATILE;
