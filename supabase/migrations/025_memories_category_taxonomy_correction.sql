-- 025_memories_category_taxonomy_correction.sql
-- RELEASE-BLOCKER-CLOSURE PHASE 1 (TypeScript diagnostic root-cause fix).
--
-- PROPOSAL ONLY — NOT EXECUTED. See header note in 002_identity_and_role_contract.sql.
-- This file has not been run against any database.
--
-- EVIDENCE: 001_initial_schema.sql's tracked CHECK constraint on
-- `memories.category` is `CHECK (category IN ('photo', 'audio', 'video',
-- 'story'))` — a MEDIA-TYPE taxonomy. No other tracked migration (002-024)
-- ever touches it. But src/pages/patient/PatientMemories.tsx's entire
-- category feature — CATEGORY_CONFIG (label/icon/color/emoji for each),
-- the filter bar, the upload-zone category selector — is built exclusively
-- around a DIFFERENT, THEMATIC taxonomy: 'family' | 'travel' | 'milestones'
-- | 'daily'. The application both reads and writes this thematic value to
-- the same `category` column (confirmed: `fetchMemories()`'s own SELECT
-- assumes the stored value round-trips as one of these four; every insert
-- call site writes one of these four, never 'photo'/'audio'/'video'/
-- 'story'). If the live database's constraint actually matches the
-- tracked one, every single memory save with a real category has been
-- failing a CHECK constraint violation — this is a correctness fix, not a
-- cosmetic one.
--
-- This migration corrects the TRACKED constraint to match the extensively
-- and consistently confirmed real application taxonomy — not a guess:
-- every category value the app has ever written or expected to read back
-- is in this new set, and the old 'photo'/'audio'/'video'/'story' set has
-- zero confirmed read or write call sites anywhere in tracked application
-- code.
DO $$ BEGIN
  ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_category_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE memories
  ADD CONSTRAINT memories_category_check
  CHECK (category IS NULL OR category IN ('family', 'travel', 'milestones', 'daily'));

-- ============================================================
-- STAGING-ONLY VERIFICATION (described for the owner to run in an isolated
-- environment; NOT executed by this migration file or by this engagement)
-- ============================================================
-- T1 (critical): before this file, does the LIVE database actually reject
--   an insert of `category = 'family'` into `memories`? If the live
--   constraint already differs from 001's tracked one (the same "tracked
--   != live" uncertainty as elsewhere in this engagement), this migration
--   may be a no-op in practice — but it is still the source-of-truth
--   correction the tracked schema needed regardless.
-- T2 (regression): any existing row with category IN ('photo','audio',
--   'video','story') — if any exist live — would now violate the NEW
--   constraint. Run a read-only count of such rows before applying.
