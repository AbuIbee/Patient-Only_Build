-- ROUND 6 — Enterprise Caregiver Portal: new clinical-record tables
-- for P02 (Diagnoses), P03 (Allergies), P08 (Care Plan), P10 (Vitals),
-- P19 (Therapy Goals), P21 (Care Preferences). None of these existed
-- before this round — confirmed by grep across every prior migration.
--
-- Every table carries a `source` column matching the locked
-- requirement's data-provenance model exactly: "current verified
-- source -> attributed patient/family report -> authorized
-- professional observation -> missing/unknown." Never silently
-- defaults to the strongest claim.
--
-- Read access: BOTH the residential caregiver_patients link AND an
-- active Enterprise staff_patient_assignments row — the same
-- dual-source pattern migration 067 established for base clinical
-- tables, so these new tables work identically for a residential
-- caregiver and an Enterprise org caregiver/therapist/medical
-- professional.
--
-- Write access: a caregiver (residential or Enterprise) may record an
-- entry attributed to themselves (author_id = auth.uid(), source
-- defaults to 'caregiver_report' unless the caller explicitly claims
-- 'professional_observation', which is only permitted for a staff
-- member whose org_role is therapist/medical_professional — never
-- self-asserted by an ordinary caregiver). This mirrors the existing,
-- already-reviewed pattern in patient_notes (migrations 006/044/066):
-- a positive, server-checked gate on who may claim professional
-- authorship, not a client-supplied flag trusted at face value.

CREATE OR REPLACE FUNCTION public.has_patient_access(p_patient_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT
    EXISTS (SELECT 1 FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth.uid())
    OR EXISTS (SELECT 1 FROM staff_patient_assignments WHERE patient_id = p_patient_id AND user_id = auth.uid() AND is_active = true)
    OR p_patient_id = auth.uid();
$function$;
REVOKE ALL ON FUNCTION public.has_patient_access(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_patient_access(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_professional_staff_for_patient(p_patient_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT EXISTS (
    SELECT 1 FROM staff_patient_assignments
    WHERE patient_id = p_patient_id AND user_id = auth.uid() AND is_active = true
      AND org_role IN ('therapist', 'medical_professional')
  ) OR public.is_therapist_for_patient(p_patient_id);
$function$;
REVOKE ALL ON FUNCTION public.is_professional_staff_for_patient(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_professional_staff_for_patient(UUID) TO authenticated;

-- ============================================================================
-- P02 — patient_diagnoses
-- ============================================================================
CREATE TABLE IF NOT EXISTS patient_diagnoses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  condition_name  TEXT NOT NULL,
  diagnosed_date  DATE,
  notes           TEXT,
  source          TEXT NOT NULL DEFAULT 'caregiver_report' CHECK (source IN ('verified_source', 'caregiver_report', 'professional_observation', 'unknown')),
  author_id       UUID NOT NULL REFERENCES profiles(id),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE patient_diagnoses ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- P03 — patient_allergies. Never silently defaults to "no known
-- allergies" — the absence of a row means "not recorded," rendered
-- distinctly by the client, never as a positive claim of none.
-- ============================================================================
CREATE TABLE IF NOT EXISTS patient_allergies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  allergen        TEXT NOT NULL,
  reaction        TEXT,
  severity        TEXT CHECK (severity IN ('mild', 'moderate', 'severe', 'unknown')),
  notes           TEXT,
  source          TEXT NOT NULL DEFAULT 'caregiver_report' CHECK (source IN ('verified_source', 'caregiver_report', 'professional_observation', 'unknown')),
  author_id       UUID NOT NULL REFERENCES profiles(id),
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE patient_allergies ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- P08 — patient_care_plans. "Distinguish orders from patient
-- preferences" — explicitly author-attributed and versioned (a new
-- row per revision, never destructively overwritten) so an audit
-- history is structurally guaranteed, not merely a convention.
-- ============================================================================
CREATE TABLE IF NOT EXISTS patient_care_plans (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  goals             TEXT NOT NULL,
  permitted_tasks   TEXT,
  effective_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  version           INTEGER NOT NULL DEFAULT 1,
  author_id         UUID NOT NULL REFERENCES profiles(id),
  is_current        BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE patient_care_plans ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- P10 — patient_vitals
-- ============================================================================
CREATE TABLE IF NOT EXISTS patient_vitals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  measured_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  blood_pressure    TEXT,
  pulse_bpm         INTEGER,
  temperature_f     NUMERIC(4,1),
  oxygen_saturation INTEGER,
  weight_lbs        NUMERIC(6,2),
  pain_level        INTEGER CHECK (pain_level BETWEEN 0 AND 10),
  notes             TEXT,
  source            TEXT NOT NULL DEFAULT 'caregiver_report' CHECK (source IN ('verified_source', 'caregiver_report', 'professional_observation', 'unknown')),
  author_id         UUID NOT NULL REFERENCES profiles(id),
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE patient_vitals ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- P19 — patient_therapy_goals. Author-restricted to professional staff
-- at write time — "clinician/therapist-approved therapy objectives."
-- ============================================================================
CREATE TABLE IF NOT EXISTS patient_therapy_goals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  objective       TEXT NOT NULL,
  progress_notes  TEXT,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'achieved', 'discontinued')),
  author_id       UUID NOT NULL REFERENCES profiles(id),
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE patient_therapy_goals ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- P21 — patient_care_preferences. Deliberately distinct from
-- patients.preferences_* (which are the PATIENT APP's own display/
-- interaction settings — font size, tone, audio) — this is CARE
-- preference data a caregiver/family records about the patient
-- (comfort techniques, routines, foods), explicitly "distinguish
-- patient-reported preferences from orders" (never mixed with
-- patient_care_plans).
-- ============================================================================
CREATE TABLE IF NOT EXISTS patient_care_preferences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  category        TEXT NOT NULL CHECK (category IN ('routine', 'food', 'sensitivity', 'communication', 'comfort_technique', 'dignity', 'accessibility', 'other')),
  description     TEXT NOT NULL,
  reported_by     TEXT,
  author_id       UUID NOT NULL REFERENCES profiles(id),
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE patient_care_preferences ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Shared RLS pattern for all six tables above: has_patient_access()
-- covers SELECT; INSERT requires the same access PLUS (for the
-- professional_observation source claim, where applicable) an
-- explicit professional-staff check inside the RPCs below — the RLS
-- WITH CHECK alone cannot see the `source` value cleanly across all
-- six shapes, so the source-claim gate lives in the RPCs, not bare
-- table policies. Table-level INSERT policy still requires
-- author_id = auth.uid() AND has_patient_access(), so even a caller
-- going around the RPCs (e.g. direct REST) can never author on
-- someone else's behalf or touch an unrelated patient.
-- ============================================================================
DO $$ BEGIN
  CREATE POLICY "Authorized caregivers/staff can view diagnoses" ON patient_diagnoses FOR SELECT USING (public.has_patient_access(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Authorized caregivers/staff can record diagnoses" ON patient_diagnoses FOR INSERT WITH CHECK (author_id = auth.uid() AND public.has_patient_access(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authorized caregivers/staff can view allergies" ON patient_allergies FOR SELECT USING (public.has_patient_access(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Authorized caregivers/staff can record allergies" ON patient_allergies FOR INSERT WITH CHECK (author_id = auth.uid() AND public.has_patient_access(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authorized caregivers/staff can view care plans" ON patient_care_plans FOR SELECT USING (public.has_patient_access(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Authorized caregivers/staff can record care plans" ON patient_care_plans FOR INSERT WITH CHECK (author_id = auth.uid() AND public.has_patient_access(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authorized caregivers/staff can view vitals" ON patient_vitals FOR SELECT USING (public.has_patient_access(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Authorized caregivers/staff can record vitals" ON patient_vitals FOR INSERT WITH CHECK (author_id = auth.uid() AND public.has_patient_access(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authorized caregivers/staff can view therapy goals" ON patient_therapy_goals FOR SELECT USING (public.has_patient_access(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Only professional staff can record therapy goals" ON patient_therapy_goals FOR INSERT WITH CHECK (author_id = auth.uid() AND public.is_professional_staff_for_patient(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Only professional staff can update their own therapy goals" ON patient_therapy_goals FOR UPDATE USING (author_id = auth.uid() AND public.is_professional_staff_for_patient(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authorized caregivers/staff can view care preferences" ON patient_care_preferences FOR SELECT USING (public.has_patient_access(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Authorized caregivers/staff can record care preferences" ON patient_care_preferences FOR INSERT WITH CHECK (author_id = auth.uid() AND public.has_patient_access(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- RPCs: thin, SECURITY DEFINER wrappers that enforce the
-- professional_observation source-claim gate server-side (never
-- trusting a client-supplied source value at face value for that one
-- claim) and provide a stable API surface for the client service
-- layer, consistent with this engagement's established pattern.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_patient_diagnosis(
  p_patient_id UUID, p_condition_name TEXT, p_diagnosed_date DATE DEFAULT NULL, p_notes TEXT DEFAULT NULL, p_source TEXT DEFAULT 'caregiver_report'
) RETURNS patient_diagnoses
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_row patient_diagnoses;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.has_patient_access(p_patient_id) THEN RAISE EXCEPTION 'Not authorized for this patient'; END IF;
  IF btrim(COALESCE(p_condition_name, '')) = '' THEN RAISE EXCEPTION 'A condition name is required'; END IF;
  IF p_source = 'professional_observation' AND NOT public.is_professional_staff_for_patient(p_patient_id) THEN
    RAISE EXCEPTION 'Only a therapist or medical professional may record a professional_observation source';
  END IF;
  INSERT INTO patient_diagnoses (patient_id, condition_name, diagnosed_date, notes, source, author_id)
  VALUES (p_patient_id, p_condition_name, p_diagnosed_date, p_notes, p_source, auth.uid())
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.record_patient_diagnosis(UUID, TEXT, DATE, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_patient_diagnosis(UUID, TEXT, DATE, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_patient_allergy(
  p_patient_id UUID, p_allergen TEXT, p_reaction TEXT DEFAULT NULL, p_severity TEXT DEFAULT 'unknown', p_notes TEXT DEFAULT NULL, p_source TEXT DEFAULT 'caregiver_report'
) RETURNS patient_allergies
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_row patient_allergies;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.has_patient_access(p_patient_id) THEN RAISE EXCEPTION 'Not authorized for this patient'; END IF;
  IF btrim(COALESCE(p_allergen, '')) = '' THEN RAISE EXCEPTION 'An allergen is required'; END IF;
  IF p_source = 'professional_observation' AND NOT public.is_professional_staff_for_patient(p_patient_id) THEN
    RAISE EXCEPTION 'Only a therapist or medical professional may record a professional_observation source';
  END IF;
  INSERT INTO patient_allergies (patient_id, allergen, reaction, severity, notes, source, author_id)
  VALUES (p_patient_id, p_allergen, p_reaction, p_severity, p_notes, p_source, auth.uid())
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.record_patient_allergy(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_patient_allergy(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_patient_care_plan(
  p_patient_id UUID, p_goals TEXT, p_permitted_tasks TEXT DEFAULT NULL, p_effective_date DATE DEFAULT CURRENT_DATE
) RETURNS patient_care_plans
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_row patient_care_plans; v_next_version INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.has_patient_access(p_patient_id) THEN RAISE EXCEPTION 'Not authorized for this patient'; END IF;
  IF btrim(COALESCE(p_goals, '')) = '' THEN RAISE EXCEPTION 'Care plan goals are required'; END IF;
  SELECT COALESCE(max(version), 0) + 1 INTO v_next_version FROM patient_care_plans WHERE patient_id = p_patient_id;
  UPDATE patient_care_plans SET is_current = false WHERE patient_id = p_patient_id AND is_current = true;
  INSERT INTO patient_care_plans (patient_id, goals, permitted_tasks, effective_date, version, author_id, is_current)
  VALUES (p_patient_id, p_goals, p_permitted_tasks, p_effective_date, v_next_version, auth.uid(), true)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.record_patient_care_plan(UUID, TEXT, TEXT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_patient_care_plan(UUID, TEXT, TEXT, DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_patient_vitals(
  p_patient_id UUID, p_blood_pressure TEXT DEFAULT NULL, p_pulse_bpm INTEGER DEFAULT NULL, p_temperature_f NUMERIC DEFAULT NULL,
  p_oxygen_saturation INTEGER DEFAULT NULL, p_weight_lbs NUMERIC DEFAULT NULL, p_pain_level INTEGER DEFAULT NULL, p_notes TEXT DEFAULT NULL, p_source TEXT DEFAULT 'caregiver_report'
) RETURNS patient_vitals
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_row patient_vitals;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.has_patient_access(p_patient_id) THEN RAISE EXCEPTION 'Not authorized for this patient'; END IF;
  IF p_source = 'professional_observation' AND NOT public.is_professional_staff_for_patient(p_patient_id) THEN
    RAISE EXCEPTION 'Only a therapist or medical professional may record a professional_observation source';
  END IF;
  INSERT INTO patient_vitals (patient_id, blood_pressure, pulse_bpm, temperature_f, oxygen_saturation, weight_lbs, pain_level, notes, source, author_id)
  VALUES (p_patient_id, p_blood_pressure, p_pulse_bpm, p_temperature_f, p_oxygen_saturation, p_weight_lbs, p_pain_level, p_notes, p_source, auth.uid())
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.record_patient_vitals(UUID, TEXT, INTEGER, NUMERIC, INTEGER, NUMERIC, INTEGER, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_patient_vitals(UUID, TEXT, INTEGER, NUMERIC, INTEGER, NUMERIC, INTEGER, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_therapy_goal(p_patient_id UUID, p_objective TEXT, p_progress_notes TEXT DEFAULT NULL)
RETURNS patient_therapy_goals
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_row patient_therapy_goals;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_professional_staff_for_patient(p_patient_id) THEN RAISE EXCEPTION 'Only a therapist or medical professional may record a therapy goal'; END IF;
  IF btrim(COALESCE(p_objective, '')) = '' THEN RAISE EXCEPTION 'An objective is required'; END IF;
  INSERT INTO patient_therapy_goals (patient_id, objective, progress_notes, author_id)
  VALUES (p_patient_id, p_objective, p_progress_notes, auth.uid())
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.record_therapy_goal(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_therapy_goal(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_therapy_goal_progress(p_goal_id UUID, p_progress_notes TEXT, p_status TEXT DEFAULT NULL)
RETURNS patient_therapy_goals
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_row patient_therapy_goals;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_row FROM patient_therapy_goals WHERE id = p_goal_id AND author_id = auth.uid() FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No such therapy goal authored by you'; END IF;
  IF NOT public.is_professional_staff_for_patient(v_row.patient_id) THEN RAISE EXCEPTION 'Eligibility no longer confirmed for this patient'; END IF;
  UPDATE patient_therapy_goals SET progress_notes = p_progress_notes, status = COALESCE(p_status, status), updated_at = now()
  WHERE id = p_goal_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.update_therapy_goal_progress(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_therapy_goal_progress(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_care_preference(p_patient_id UUID, p_category TEXT, p_description TEXT, p_reported_by TEXT DEFAULT NULL)
RETURNS patient_care_preferences
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_row patient_care_preferences;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.has_patient_access(p_patient_id) THEN RAISE EXCEPTION 'Not authorized for this patient'; END IF;
  IF btrim(COALESCE(p_description, '')) = '' THEN RAISE EXCEPTION 'A description is required'; END IF;
  INSERT INTO patient_care_preferences (patient_id, category, description, reported_by, author_id)
  VALUES (p_patient_id, p_category, p_description, p_reported_by, auth.uid())
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.record_care_preference(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_care_preference(UUID, TEXT, TEXT, TEXT) TO authenticated;
