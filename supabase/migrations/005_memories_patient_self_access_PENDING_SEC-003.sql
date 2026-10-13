-- 005_memories_patient_self_access_PENDING_SEC-003.sql
-- F06 (Memories) — ownership-resolution repair.
--
-- *** DO NOT EXECUTE until SEC-003 is independently approved and validated. ***
-- The work order explicitly ties F06 to SEC-003 ("Integrate least-privilege
-- own-patient RLS proposal dependent on SEC-003 approval"), unlike the other
-- patient-self-access policies in 004_patient_self_access_core.sql, which
-- the work order does not gate on a named security finding. This file is a
-- PROPOSAL for owner/security review, not an implemented repair. F06 is
-- reported as BLOCKED, not IMPLEMENTED, specifically because of this file.
--
-- Rationale for why this one is more sensitive than 004: memories carries
-- storage-referencing metadata (photo_url pointing into the patient-media
-- bucket) alongside the DB row, so an ownership mistake here has a storage
-- exposure blast radius that tasks/mood_entries/medications don't carry.
-- SEC-003's scope (per the work order, not independently re-derived here)
-- should confirm the storage-side exposure is also closed before this is
-- applied.
--
-- Shape is identical to 004's pattern for consistency, pending that review.

DO $$ BEGIN
  CREATE POLICY "Patients can view their own memories"
    ON memories FOR SELECT
    USING (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Patients can manage their own memories"
    ON memories FOR ALL
    USING (patient_id = auth.uid())
    WITH CHECK (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
