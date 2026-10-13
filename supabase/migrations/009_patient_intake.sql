-- 009_patient_intake.sql
-- F09 (Public patient intake).
--
-- PROPOSAL ONLY — NOT EXECUTED. See header note in 002_identity_and_role_contract.sql.
--
-- `patient_intake` does not exist in this repo's tracked migrations at all
-- (cross-cutting finding, _audit_group_B.md), yet
-- publicPatientIntakeService.ts depends on it with anon INSERT access from
-- an unauthenticated public form (/patient-intake route, no login). Columns
-- below match that service's insert payload exactly.

CREATE TABLE IF NOT EXISTS patient_intake (
  id                              UUID PRIMARY KEY, -- client-generated receipt id, see publicPatientIntakeService.ts
  patient_profile_id              UUID REFERENCES profiles(id),
  caregiver_profile_id            UUID REFERENCES profiles(id),
  patient_first_name              TEXT NOT NULL,
  patient_last_name               TEXT NOT NULL,
  patient_preferred_name          TEXT,
  patient_date_of_birth           DATE,
  patient_diagnosis_date          DATE,
  patient_dementia_stage          TEXT,
  patient_street_address          TEXT,
  patient_city                    TEXT,
  patient_state                   TEXT,
  patient_zip_code                TEXT,
  patient_phone                   TEXT,
  patient_email                   TEXT,
  preferred_hospital               TEXT,
  doctor_therapist_name           TEXT,
  doctor_therapist_phone          TEXT,
  caregiver_name                  TEXT,
  caregiver_relationship          TEXT,
  caregiver_phone                 TEXT,
  medications_and_dosage          TEXT,
  emergency_contact_full_name     TEXT,
  emergency_contact_phone         TEXT,
  emergency_contact_email         TEXT,
  emergency_contact_relationship  TEXT,
  created_by                      UUID REFERENCES profiles(id),
  created_at                      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewed_at                     TIMESTAMP WITH TIME ZONE,
  reviewed_by                     UUID REFERENCES profiles(id)
);

ALTER TABLE patient_intake ENABLE ROW LEVEL SECURITY;

-- Anonymous INSERT only — this is intentional (public form, no login) and
-- is the one piece of this table's access the work order explicitly
-- requires. No anon SELECT is granted; the client never needs one (see
-- F09 code fix in publicPatientIntakeService.ts).
DO $$ BEGIN
  CREATE POLICY "Public can submit patient intake"
    ON patient_intake FOR INSERT
    TO anon
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Staff (admin) review access — intake data is sensitive (DOB, medications,
-- emergency contacts), so this intentionally does NOT grant it to every
-- authenticated user, only to profiles.role = 'admin'/'superadmin'.
DO $$ BEGIN
  CREATE POLICY "Admins can review patient intake submissions"
    ON patient_intake FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can update patient intake review state"
    ON patient_intake FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Basic abuse mitigation for an anonymous public INSERT endpoint. Supabase
-- doesn't support per-IP rate limiting in plain RLS; this is a minimum
-- floor (reject clearly-incomplete submissions at the DB layer, not just
-- client-side validation) — a real rate limit needs an edge function or
-- WAF rule in front of this table, which is outside this migration's scope.
DO $$ BEGIN
  ALTER TABLE patient_intake
    ADD CONSTRAINT patient_intake_requires_identifying_info
    CHECK (patient_first_name <> '' AND patient_last_name <> '');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
