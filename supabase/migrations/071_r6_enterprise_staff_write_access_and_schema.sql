-- ROUND 6 — CONFIRMED DEFECT, live-reproduced: migration 067
-- extended several base clinical tables' RLS to recognize an active
-- staff_patient_assignments row for SELECT only. `tasks` additionally
-- has a pre-existing, unmodified "Caregivers can manage tasks for
-- their patients" FOR ALL policy scoped ONLY to caregiver_patients
-- (the residential link) — an Enterprise org-caregiver has no
-- caregiver_patients row at all, so their UPDATE (mark task
-- completed/skipped) matches zero rows and is silently discarded.
-- Reproduced live this round: a real org-caregiver's
-- `PATCH /rest/v1/tasks?id=eq.<id>` returned HTTP 200 with an EMPTY
-- body — the exact "empty/error conflation" defect class this
-- engagement has repeatedly found and fixed, this time in a write
-- path rather than a read path. The Enterprise Caregiver Dashboard's
-- TasksView (Round 5) silently did nothing when a staff caregiver
-- clicked complete/skip.
--
-- FIX: an explicit staff UPDATE policy on `tasks`, mirroring the
-- existing caregiver_patients-scoped manage policy exactly but keyed
-- off staff_patient_assignments. INSERT/DELETE remain
-- caregiver_patients-only (unchanged) — task creation/removal stays a
-- residential-caregiver or director-assignment concern (not changed
-- by this migration), only marking an EXISTING assigned task's
-- outcome is extended to staff.
DO $$ BEGIN
  CREATE POLICY "Assigned org staff can update tasks for their patients"
    ON tasks FOR UPDATE
    USING (EXISTS (SELECT 1 FROM staff_patient_assignments spa WHERE spa.patient_id = tasks.patient_id AND spa.user_id = auth.uid() AND spa.is_active = true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- H08/W02/N04 — "Completed, Declined, Not Completed or Not Applicable
-- with time, context, patient refusal reason." The existing CHECK
-- only allowed ('pending','completed','skipped') — no distinct "not
-- applicable," no structured refusal-reason field (only a generic
-- free-text `description` meant for the task itself, not a per-
-- completion refusal reason).
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('pending', 'completed', 'skipped', 'not_applicable'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS refusal_reason TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status_updated_by UUID REFERENCES profiles(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMP WITH TIME ZONE;

-- W04 — "Ordinary care notes" (note_type IN general/medical/behavior/
-- mood/activity) had no path for Enterprise staff at all: the only
-- existing INSERT/SELECT policies on patient_notes are
-- caregiver_patients-scoped (migration 001) or note_type-gated to
-- therapist_session/clinical_observation specifically (migrations
-- 006/044/066) — a plain Enterprise org-caregiver authoring an
-- ordinary observation note had no RLS path whatsoever. Extended
-- identically to migration 067's pattern, explicitly EXCLUDING the
-- professional note types (those stay gated to their own dedicated
-- policies) and EXCLUDING care_partner_personal (patient-authored
-- only, per migration 006's own documented boundary).
DO $$ BEGIN
  CREATE POLICY "Assigned org staff can view ordinary notes for their patients"
    ON patient_notes FOR SELECT
    USING (
      note_type NOT IN ('therapist_session', 'clinical_observation', 'care_partner_personal')
      AND EXISTS (SELECT 1 FROM staff_patient_assignments spa WHERE spa.patient_id = patient_notes.patient_id AND spa.user_id = auth.uid() AND spa.is_active = true)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Assigned org staff can author ordinary notes for their patients"
    ON patient_notes FOR INSERT
    WITH CHECK (
      note_type NOT IN ('therapist_session', 'clinical_observation', 'care_partner_personal')
      AND author_id = auth.uid() AND caregiver_id IS NULL
      AND EXISTS (SELECT 1 FROM staff_patient_assignments spa WHERE spa.patient_id = patient_notes.patient_id AND spa.user_id = auth.uid() AND spa.is_active = true)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- W03 — "Quick Observation Entry" (mood, pain, hydration, appetite,
-- mobility, sleep). migration 067 gave staff SELECT on mood_entries
-- only; no INSERT path existed for Enterprise staff (the original
-- INSERT policy, migration 001, is caregiver_patients-scoped).
DO $$ BEGIN
  CREATE POLICY "Assigned org staff can record mood entries for their patients"
    ON mood_entries FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM staff_patient_assignments spa WHERE spa.patient_id = mood_entries.patient_id AND spa.user_id = auth.uid() AND spa.is_active = true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- W12/P15 — Documents & Attachments upload. migration 067 gave staff
-- SELECT on patient_document_uploads only; no INSERT path existed.
DO $$ BEGIN
  CREATE POLICY "Assigned org staff can upload documents for their patients"
    ON patient_document_uploads FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM staff_patient_assignments spa WHERE spa.patient_id = patient_document_uploads.patient_id AND spa.user_id = auth.uid() AND spa.is_active = true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- C03 — "Care Updates: structured patient-scoped shared updates...
-- separate from Private Journal," distinct from an ordinary message.
-- Adds a message_type column (default 'message', so every existing
-- row and every existing INSERT call site that never set this field
-- is completely unaffected) rather than inventing a parallel table.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'message' CHECK (message_type IN ('message', 'care_update'));

-- H03/P17 — "Critical Alerts" must include HELP-button events, not
-- only incident_reports. CONFIRMED GAP: get_patient_help_activation_history()
-- (migration 053, a P0 security fix in its own right) authorizes only
-- `auth.uid() = p_patient_id OR caregiver_patients` — an Enterprise
-- staff caregiver with ONLY a staff_patient_assignments row was never
-- recognized at all and would be flatly rejected
-- ("Not authorized for this patient's HELP activation history"),
-- exactly the same class of gap migration 067 fixed for other base
-- tables. Extended, not weakened: the existing NULL-safe,
-- positively-expressed condition (migration 053's own documented P0
-- fix for a three-valued-logic bug) is preserved verbatim; only one
-- additional OR-branch is added.
CREATE OR REPLACE FUNCTION public.get_patient_help_activation_history(p_patient_id uuid)
RETURNS TABLE(
  id uuid, created_at timestamp with time zone, phone_dialed text, caregiver_count_at_time integer,
  conversation_id uuid, notification_status text, acknowledged_count bigint, acknowledged_by text[]
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_patient_id IS NULL THEN
    RAISE EXCEPTION 'A patient id is required';
  END IF;
  IF NOT (
    auth.uid() = p_patient_id
    OR EXISTS (SELECT 1 FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth.uid())
    OR EXISTS (SELECT 1 FROM staff_patient_assignments WHERE patient_id = p_patient_id AND user_id = auth.uid() AND is_active = true)
  ) THEN
    RAISE EXCEPTION 'Not authorized for this patient''s HELP activation history';
  END IF;

  RETURN QUERY
  SELECT
    ha.id, ha.created_at, ha.phone_dialed, ha.caregiver_count_at_time, ha.conversation_id, ha.notification_status,
    count(ma.id) FILTER (WHERE ma.acknowledged_at IS NOT NULL),
    array_agg(DISTINCT (pr.first_name || ' ' || pr.last_name)) FILTER (WHERE ma.acknowledged_at IS NOT NULL)
  FROM help_activations ha
  LEFT JOIN message_acknowledgments ma ON ma.message_id = ha.message_id AND ma.user_id != ha.patient_id
  LEFT JOIN profiles pr ON pr.id = ma.user_id
  WHERE ha.patient_id = p_patient_id
  GROUP BY ha.id, ha.created_at, ha.phone_dialed, ha.caregiver_count_at_time, ha.conversation_id, ha.notification_status
  ORDER BY ha.created_at DESC;
END;
$function$;
-- Grants unchanged from migration 053 (REVOKE PUBLIC/anon, GRANT
-- authenticated) — CREATE OR REPLACE preserves them, re-asserted
-- defensively.
REVOKE ALL ON FUNCTION public.get_patient_help_activation_history(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_patient_help_activation_history(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_patient_help_activation_history(uuid) TO authenticated;
