-- 007_patient_documents_storage.sql
-- F08 (Documents and bills).
--
-- PROPOSAL ONLY — NOT EXECUTED. See header note in 002_identity_and_role_contract.sql.
--
-- Neither `patient_document_uploads` nor a `patient-documents` storage
-- bucket exist anywhere in this repo's tracked migrations, yet
-- PatientDocuments.tsx (DOC_BUCKET = 'patient-documents', L48) depends on
-- both. This proposes both as private/own-patient-only, matching the
-- component's existing use of createSignedUrl (never getPublicUrl).

CREATE TABLE IF NOT EXISTS patient_document_uploads (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id    UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  section       TEXT NOT NULL CHECK (section IN ('medical_docs', 'medical_bills')),
  file_name     TEXT NOT NULL,
  file_type     TEXT,
  storage_path  TEXT NOT NULL UNIQUE,
  note_text     TEXT DEFAULT '',
  uploaded_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE patient_document_uploads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Patients can view their own document uploads"
    ON patient_document_uploads FOR SELECT
    USING (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Patients can manage their own document uploads"
    ON patient_document_uploads FOR ALL
    USING (patient_id = auth.uid())
    WITH CHECK (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Caregivers can view their patients' document uploads"
    ON patient_document_uploads FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM caregiver_patients cp
        WHERE cp.patient_id = patient_document_uploads.patient_id
        AND cp.caregiver_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Private bucket — never public. Objects are keyed `${patient_id}/${section}/...`
-- (see PatientDocuments.tsx:284), so the policy below checks that the first
-- path segment matches the calling patient's own id.
INSERT INTO storage.buckets (id, name, public)
VALUES ('patient-documents', 'patient-documents', false)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "Patients can manage their own document storage objects"
    ON storage.objects FOR ALL
    USING (
      bucket_id = 'patient-documents'
      AND (storage.foldername(name))[1] = auth.uid()::text
    )
    WITH CHECK (
      bucket_id = 'patient-documents'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Caregivers can read their patients' document storage objects"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'patient-documents'
      AND EXISTS (
        SELECT 1 FROM caregiver_patients cp
        WHERE cp.patient_id::text = (storage.foldername(name))[1]
        AND cp.caregiver_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- F13 (Tell Me a Story playback): TellMeAStoryDialog.tsx already uses
-- createSignedUrl correctly (not getPublicUrl) — the component code itself
-- needs no change. The work order's claim is that `storage.objects` on the
-- `audio-files` bucket lacks a SELECT policy letting an authenticated
-- caller mint a signed URL at all. This repo has no storage policy SQL for
-- that bucket to compare against (cross-cutting finding in
-- _audit_group_B.md), so this proposes the narrowest policy that would make
-- createSignedUrl work for a licensed/shared story catalog: any
-- authenticated user may read (sign URLs for) objects in this bucket. This
-- assumes `audio-files` holds only licensed/shareable story audio, not
-- private per-user uploads — confirm that assumption against the actual
-- bucket contents before applying; if any private uploads share this
-- bucket, scope this policy to a subfolder instead of the whole bucket.
DO $$ BEGIN
  CREATE POLICY "Authenticated users can read shared story audio"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'audio-files' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
