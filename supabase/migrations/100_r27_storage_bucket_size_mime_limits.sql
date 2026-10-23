-- Codex MMA-CODEX-16 — Document Storage hygiene gap (a), confirmed live:
-- 'patient-documents' (migration 007) and 'professional-credentials'
-- (migration 083) were both created with only (id, name, public) — no
-- server-side file_size_limit or allowed_mime_types at all. Client-side
-- checks exist for some patient-documents upload paths but not the
-- professional-credentials upload flow (ProfessionalRegisterPage.tsx/
-- ApplicationStatusPage.tsx have no `accept` restriction whatsoever), so
-- nothing server-side stopped an arbitrarily large or arbitrarily-typed
-- object being written to either bucket via a direct API call.
--
-- 'patient-media' is deliberately NOT touched here: its NULL/NULL is
-- already disclosed (migration 029's own comment) as intentionally
-- matching a prior confirmed production audit, not an oversight.
--
-- Limits chosen to match, not narrow, what the UI already allows:
-- patient-documents' own <input accept> already lists image/*,
-- application/pdf, Word, Excel, text/csv (PatientDocuments.tsx) — the
-- mime list below is that same set. professional-credentials has no
-- existing client-side restriction at all; a reasonable scanned-
-- document/photo set (PDF + common image formats) is applied rather
-- than inventing an untested narrower policy.
UPDATE storage.buckets
SET file_size_limit = 20971520, -- 20 MB
    allowed_mime_types = ARRAY[
      'image/*', 'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain', 'text/csv'
    ]
WHERE id = 'patient-documents';

UPDATE storage.buckets
SET file_size_limit = 15728640, -- 15 MB
    allowed_mime_types = ARRAY['image/*', 'application/pdf']
WHERE id = 'professional-credentials';
