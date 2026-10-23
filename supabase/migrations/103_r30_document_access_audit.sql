-- Codex MMA-CODEX-16 — "Download auditing," the one sub-item of this
-- finding's checklist not yet covered by migrations 100/101. Logs who
-- accessed which protected document and when, for the two buckets this
-- finding is actually about (clinical patient-documents and
-- professional-credentials evidence) — never patient-media/entertainment
-- content, which is outside this finding's scope.
--
-- Append-only by design, matching every other audit table in this
-- engagement (account_management_audit, professional_application_events):
-- a caller may insert their OWN access record and nothing else; only the
-- Platform Owner may read the log (oversight), never a self-read (an
-- audit log a subject could edit or hide their own entries from isn't
-- a real audit log).
CREATE TABLE IF NOT EXISTS document_access_audit (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accessed_by   UUID NOT NULL REFERENCES profiles(id),
  bucket_id     TEXT NOT NULL CHECK (bucket_id IN ('patient-documents', 'professional-credentials')),
  storage_path  TEXT NOT NULL,
  accessed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE document_access_audit ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "A caller may log their own document access"
    ON document_access_audit FOR INSERT
    WITH CHECK (accessed_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A caller may also see their OWN entries. Required, not merely
-- convenient: PostgREST's default INSERT issues `RETURNING *`, and that
-- RETURNING row's visibility is itself governed by the SELECT policy —
-- an INSERT-only, platform-owner-only-SELECT table would reject the
-- inserter's own insert outright (confirmed live: 42501, "new row
-- violates row-level security policy", caught by this migration's own
-- test before being shipped). Self-visibility does not weaken the audit
-- property: a caller still cannot UPDATE or DELETE any row, so they can
-- see but never alter or hide their own history.
DO $$ BEGIN
  CREATE POLICY "A caller may view their own document access entries"
    ON document_access_audit FOR SELECT
    USING (accessed_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "The Platform Owner may review the full document access log"
    ON document_access_audit FOR SELECT
    USING (public.is_platform_owner());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

REVOKE ALL ON document_access_audit FROM PUBLIC;
GRANT SELECT, INSERT ON document_access_audit TO authenticated;
REVOKE ALL ON document_access_audit FROM anon;
