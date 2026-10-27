-- PACKAGE 1 (MMA-P1-FINAL) Priorities 3 & 4, directive Section 8 —
-- Director patient closure (ACTIVE -> CLOSED) and automatic 45-day
-- archival (CLOSED -> ARCHIVED).
--
-- EXISTING MECHANISM FOUND, NOT REPLACED: covered_patient_memberships
-- already has status IN ('active','ended') and end_patient_coverage()
-- (migration 035, Director-only). Confirmed by grep this is a DEAD code
-- path -- organizationService.ts exports endPatientCoverage() but no page
-- component calls it. It has no mandatory reason/notes, no audit entry,
-- and no archival concept at all, so it does not satisfy Section 8's
-- explicit requirements. It is left completely untouched (nothing
-- depends on changing its behavior) and this migration adds the real
-- closure/archival lifecycle alongside it as new, additive states.
--
-- 'closed'/'archived' are ADDED to the existing status CHECK rather than
-- replacing 'ended', so nothing that already writes or reads 'active'/
-- 'ended' is affected.
ALTER TABLE covered_patient_memberships DROP CONSTRAINT IF EXISTS covered_patient_memberships_status_check;
ALTER TABLE covered_patient_memberships ADD CONSTRAINT covered_patient_memberships_status_check
  CHECK (status IN ('active', 'ended', 'closed', 'archived'));

ALTER TABLE covered_patient_memberships ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES profiles(id);
ALTER TABLE covered_patient_memberships ADD COLUMN IF NOT EXISTS closure_reason TEXT;
ALTER TABLE covered_patient_memberships ADD COLUMN IF NOT EXISTS closure_notes TEXT;
ALTER TABLE covered_patient_memberships ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE covered_patient_memberships ADD COLUMN IF NOT EXISTS scheduled_archival_at TIMESTAMPTZ;
ALTER TABLE covered_patient_memberships ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- 8.4: "a legal hold must prevent prohibited deletion" / "retention,
-- holds, and mandatory safeguards must remain enforceable." No such
-- mechanism existed anywhere in this repository. Minimal, additive table
-- -- Platform-Owner-only, since this is an exceptional legal control, not
-- ordinary organizational administration (Section 4.2).
CREATE TABLE IF NOT EXISTS patient_legal_holds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID NOT NULL REFERENCES patients(id),
  reason          TEXT NOT NULL CHECK (char_length(btrim(reason)) > 0),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released')),
  placed_by       UUID NOT NULL REFERENCES profiles(id),
  placed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_by     UUID REFERENCES profiles(id),
  released_at     TIMESTAMPTZ
);
ALTER TABLE patient_legal_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON patient_legal_holds FROM PUBLIC, anon, authenticated;
GRANT SELECT ON patient_legal_holds TO authenticated;
GRANT ALL ON patient_legal_holds TO service_role;
DO $$ BEGIN
  CREATE POLICY "Only the Platform Owner can view legal holds"
    ON patient_legal_holds FOR SELECT USING (public.is_platform_owner());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.place_patient_legal_hold(p_patient_id UUID, p_reason TEXT)
RETURNS patient_legal_holds
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_row patient_legal_holds;
BEGIN
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Only the Platform Owner may place a legal hold';
  END IF;
  INSERT INTO patient_legal_holds (patient_id, reason, placed_by) VALUES (p_patient_id, btrim(p_reason), auth.uid()) RETURNING * INTO v_row;
  INSERT INTO account_management_audit (target_user_id, action_type, actor_user_id, new_value, reason)
  VALUES (p_patient_id, 'patient_legal_hold_placed', auth.uid(), jsonb_build_object('hold_id', v_row.id), p_reason);
  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.place_patient_legal_hold(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_patient_legal_hold(UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.release_patient_legal_hold(p_hold_id UUID)
RETURNS patient_legal_holds
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_row patient_legal_holds;
BEGIN
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Only the Platform Owner may release a legal hold';
  END IF;
  UPDATE patient_legal_holds SET status = 'released', released_by = auth.uid(), released_at = now()
  WHERE id = p_hold_id AND status = 'active' RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'No active legal hold found with that id';
  END IF;
  INSERT INTO account_management_audit (target_user_id, action_type, actor_user_id, new_value)
  VALUES (v_row.patient_id, 'patient_legal_hold_released', auth.uid(), jsonb_build_object('hold_id', v_row.id));
  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.release_patient_legal_hold(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_patient_legal_hold(UUID) TO authenticated, service_role;

-- ============================================================================
-- close_patient_coverage(): 8.1. Director-only, mandatory reason AND
-- notes, atomic (single UPDATE ... WHERE status='active'), idempotent
-- (a repeat call once already closed/archived returns the existing row
-- unchanged rather than erroring or double-transitioning). Schedules
-- archival exactly 45 calendar days out, UTC, at closure time -- not
-- computed later -- so the eligibility check below is a simple
-- timestamp comparison. Closing one organization's coverage never
-- touches another organization's covered_patient_memberships row for
-- the same patient (8.3) -- enforced simply by the WHERE clause matching
-- exactly one (organization_id, patient_id) row, verified by test.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.close_patient_coverage(
  p_org_id UUID,
  p_patient_id UUID,
  p_reason TEXT,
  p_notes TEXT
) RETURNS covered_patient_memberships
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_row covered_patient_memberships;
BEGIN
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an active director of this organization may close a patient''s coverage';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'A closure reason is required';
  END IF;
  IF p_notes IS NULL OR char_length(btrim(p_notes)) = 0 THEN
    RAISE EXCEPTION 'Explanatory closure notes are required';
  END IF;

  SELECT * INTO v_row FROM covered_patient_memberships WHERE organization_id = p_org_id AND patient_id = p_patient_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'No coverage relationship found for this organization and patient';
  END IF;

  IF v_row.status IN ('closed', 'archived') THEN
    RETURN v_row; -- idempotent: already closed, no-op
  END IF;
  IF v_row.status <> 'active' THEN
    RAISE EXCEPTION 'Coverage is not active (current status: %) and cannot be closed', v_row.status;
  END IF;

  UPDATE covered_patient_memberships SET
    status = 'closed', closed_by = auth.uid(), closure_reason = btrim(p_reason), closure_notes = btrim(p_notes),
    closed_at = now(), scheduled_archival_at = now() + INTERVAL '45 days'
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  INSERT INTO account_management_audit (target_user_id, organization_id, action_type, actor_user_id, new_value, reason)
  VALUES (p_patient_id, p_org_id, 'patient_coverage_closed', auth.uid(), jsonb_build_object('scheduled_archival_at', v_row.scheduled_archival_at, 'notes', p_notes), p_reason);

  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.close_patient_coverage(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_patient_coverage(UUID, UUID, TEXT, TEXT) TO authenticated, service_role;

-- ============================================================================
-- archive_eligible_closed_patients(): 8.2. Retry-safe (the UPDATE's own
-- WHERE status='closed' means re-running after a partial run only
-- touches rows not yet archived), selects only eligible rows
-- (scheduled_archival_at <= now()), respects an active legal hold by
-- skipping (not failing) that row, records a failure per-row via
-- EXCEPTION WHEN OTHERS without aborting the whole batch, and never
-- touches an unrelated organization's row (each transition is scoped to
-- exactly one row by primary key). service_role only -- this is meant to
-- be invoked by a scheduler (pg_cron or an equivalent external job), not
-- by an ordinary authenticated client. Archival never deletes anything.
--
-- KNOWN LIMITATION, explicitly recorded rather than silently skipped:
-- actual periodic SCHEDULING of this function (pg_cron or similar) is
-- NOT configured by this migration. pg_cron is not installed on the
-- local disposable stack used for this engagement's testing, and
-- enabling/scheduling it on the hosted Enterprise staging project is a
-- platform-configuration change outside this session's read-only-staging
-- authorization. The archival TRANSITION LOGIC itself is complete and
-- independently tested by direct invocation; wiring a scheduler to call
-- it periodically is a deployment-configuration decision for the
-- Platform Owner, not an application-code gap.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.archive_eligible_closed_patients()
RETURNS TABLE(out_patient_id UUID, out_organization_id UUID, archived BOOLEAN, detail TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT * FROM covered_patient_memberships WHERE status = 'closed' AND scheduled_archival_at <= now() LOOP
    BEGIN
      IF EXISTS (SELECT 1 FROM patient_legal_holds h WHERE h.patient_id = r.patient_id AND h.status = 'active') THEN
        INSERT INTO account_management_audit (target_user_id, organization_id, action_type, actor_user_id, reason)
        VALUES (r.patient_id, r.organization_id, 'patient_archival_skipped_legal_hold', NULL, 'Active legal hold prevents archival');
        out_patient_id := r.patient_id; out_organization_id := r.organization_id; archived := false; detail := 'active legal hold';
        RETURN NEXT;
        CONTINUE;
      END IF;

      UPDATE covered_patient_memberships SET status = 'archived', archived_at = now()
      WHERE id = r.id AND status = 'closed';

      INSERT INTO account_management_audit (target_user_id, organization_id, action_type, actor_user_id)
      VALUES (r.patient_id, r.organization_id, 'patient_coverage_archived', NULL);
      out_patient_id := r.patient_id; out_organization_id := r.organization_id; archived := true; detail := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO account_management_audit (target_user_id, organization_id, action_type, actor_user_id, reason)
      VALUES (r.patient_id, r.organization_id, 'patient_archival_failed', NULL, SQLERRM);
      out_patient_id := r.patient_id; out_organization_id := r.organization_id; archived := false; detail := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
  RETURN;
END;
$function$;
REVOKE ALL ON FUNCTION public.archive_eligible_closed_patients() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_eligible_closed_patients() TO service_role;
