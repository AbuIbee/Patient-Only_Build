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
  file_type     TEXT NOT NULL,
  storage_path  TEXT NOT NULL UNIQUE,
  note_text     TEXT DEFAULT '',
  uploaded_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- *** MYMEMORIA-GITHUB-SUPABASE-COMPAT-001 CORRECTION (staging-verified,
-- 2026-10-16) ***: production's real `file_type` column is NOT NULL.
-- PatientDocuments.tsx's own upload path always sets `file_type: file.type`
-- (confirmed call site) — tightening matches both production and the only
-- confirmed write path. Defensive re-apply in case the table already
-- exists from an earlier partial run of this file.
ALTER TABLE patient_document_uploads ALTER COLUMN file_type SET NOT NULL;

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

-- *** HELD — DO NOT EXECUTE until the audio-files bucket's actual contents
-- are confirmed. MYMEMORIA-GITHUB-SUPABASE-COMPAT-001 correction: this
-- block was previously active SQL granting bucket-wide authenticated
-- SELECT. The production audit (MyMemoria_Production_Audit/
-- 04_SUPABASE_SECURITY_AND_SCHEMA.md) confirms `audio-files` is a PRIVATE
-- bucket (100 MiB limit, audio/mpeg|ogg|wav|mp4|webm only) but does NOT
-- confirm whether it holds only licensed/shareable story audio or also
-- private per-user uploads — the exact assumption this block's own
-- original comment already flagged as unconfirmed. Broadening bucket-wide
-- SELECT on that unverified assumption is exactly the kind of guess this
-- engagement's own standing rule prohibits ("do not invent... unsafe
-- assertions without verified evidence"). Held, matching 005/008's
-- pending-clearance pattern, until the bucket's actual contents are
-- confirmed (or the policy is rescoped to a specific shared-content
-- subfolder instead of the whole bucket). F13 (Tell Me a Story playback)
-- remains BLOCKED, not IMPLEMENTED, specifically because of this hold —
-- TellMeAStoryDialog.tsx's own createSignedUrl call is already correct
-- (not getPublicUrl) and needs no code change once this clears.
--
-- DO $$ BEGIN
--   CREATE POLICY "Authenticated users can read shared story audio"
--     ON storage.objects FOR SELECT
--     USING (bucket_id = 'audio-files' AND auth.role() = 'authenticated');
-- EXCEPTION WHEN duplicate_object THEN NULL;
-- END $$;
