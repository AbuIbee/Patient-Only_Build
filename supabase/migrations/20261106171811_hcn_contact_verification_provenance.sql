-- HCN-CARE-MASTER-001 sections 6/7/16: verification is an explicit
-- authorized workflow, not a client-supplied label. Existing provider
-- INSERT grants predate verification_status; without this restriction
-- any authorized patient can insert source='unknown', verification_status='verified'.
-- Keep all existing authorization/professional-source restrictions and
-- preserve existing rows. New reports remain unverified until reconciled.
CREATE POLICY "HCN direct contact reports cannot assert verification"
ON public.patient_care_providers AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (verification_status='unverified');
