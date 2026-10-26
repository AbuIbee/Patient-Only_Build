-- MMA-CODEX-011 finding 011-02 (F-14/P02/P10, P1): clinical record
-- created_at/updated_at were plain DEFAULT-only columns -- a column with
-- just a DEFAULT accepts whatever value an INSERT/UPDATE statement
-- explicitly supplies for it; the DEFAULT only applies when the column is
-- omitted entirely. Every write in migration 070/072 goes through a
-- SECURITY DEFINER RPC that never lets the caller set created_at, but
-- the base tables' RLS INSERT policies (migrations 070/072/076) only
-- ever checked author_id/has_patient_access()/source -- never created_at
-- -- so a direct REST insert bypassing the RPC could set an arbitrary
-- created_at. Independently reproduced: an ordinary Medical professional
-- inserting with their own real author_id/source but created_at
-- 2000-01-01 persisted the forged date; a subsequent select returned it.
--
-- Fix: created_at becomes genuinely server-owned on every one of these
-- clinical tables -- a BEFORE INSERT OR UPDATE trigger overwrites
-- whatever value NEW.created_at carries with now() on INSERT and with
-- OLD.created_at (unchanged) on UPDATE, regardless of caller, RPC or
-- direct REST. This is deliberately scoped to created_at/updated_at only
-- -- it does NOT touch diagnosed_date, effective_date or measured_at,
-- which are the clinically-OBSERVED dates a caregiver/professional is
-- legitimately recording and must remain editable; only the record-
-- keeping "when was this entered/edited" timestamps are locked down.
-- updated_at gets the same server-owned treatment on the two tables that
-- have it (patient_diagnoses, patient_therapy_goals) -- forced to now()
-- on UPDATE, never caller-supplied, closing the identical forgery vector
-- for edits.
--
-- Applies to every table built in migration 070 (patient_diagnoses,
-- patient_allergies, patient_care_plans, patient_vitals,
-- patient_therapy_goals, patient_care_preferences) plus
-- patient_care_providers (migration 072) -- the same created_at
-- DEFAULT-only shape, same clinical-record family (069_r20's provenance
-- hardening pass already covers these tables' `source` column, not
-- created_at, for the other three).

CREATE OR REPLACE FUNCTION public.enforce_clinical_record_created_at_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$function$;
-- Migration 085's CLOSURE REGISTER guard asserts NO function in the
-- public schema grants anon EXECUTE, via any path. A trigger fires as
-- part of the INSERT/UPDATE statement itself -- the invoking role never
-- needs a direct EXECUTE grant on the trigger function for it to run --
-- so this is safe to revoke from PUBLIC/anon/authenticated alike.
REVOKE ALL ON FUNCTION public.enforce_clinical_record_created_at_immutable() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_clinical_record_updated_at_server_owned()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.updated_at := now();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.enforce_clinical_record_updated_at_server_owned() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_patient_diagnoses_created_at_immutable ON patient_diagnoses;
  CREATE TRIGGER trg_patient_diagnoses_created_at_immutable
    BEFORE INSERT OR UPDATE ON patient_diagnoses
    FOR EACH ROW EXECUTE FUNCTION public.enforce_clinical_record_created_at_immutable();
  DROP TRIGGER IF EXISTS trg_patient_diagnoses_updated_at_server_owned ON patient_diagnoses;
  CREATE TRIGGER trg_patient_diagnoses_updated_at_server_owned
    BEFORE INSERT OR UPDATE ON patient_diagnoses
    FOR EACH ROW EXECUTE FUNCTION public.enforce_clinical_record_updated_at_server_owned();
END $$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_patient_allergies_created_at_immutable ON patient_allergies;
  CREATE TRIGGER trg_patient_allergies_created_at_immutable
    BEFORE INSERT OR UPDATE ON patient_allergies
    FOR EACH ROW EXECUTE FUNCTION public.enforce_clinical_record_created_at_immutable();
END $$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_patient_care_plans_created_at_immutable ON patient_care_plans;
  CREATE TRIGGER trg_patient_care_plans_created_at_immutable
    BEFORE INSERT OR UPDATE ON patient_care_plans
    FOR EACH ROW EXECUTE FUNCTION public.enforce_clinical_record_created_at_immutable();
END $$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_patient_vitals_created_at_immutable ON patient_vitals;
  CREATE TRIGGER trg_patient_vitals_created_at_immutable
    BEFORE INSERT OR UPDATE ON patient_vitals
    FOR EACH ROW EXECUTE FUNCTION public.enforce_clinical_record_created_at_immutable();
END $$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_patient_therapy_goals_created_at_immutable ON patient_therapy_goals;
  CREATE TRIGGER trg_patient_therapy_goals_created_at_immutable
    BEFORE INSERT OR UPDATE ON patient_therapy_goals
    FOR EACH ROW EXECUTE FUNCTION public.enforce_clinical_record_created_at_immutable();
  DROP TRIGGER IF EXISTS trg_patient_therapy_goals_updated_at_server_owned ON patient_therapy_goals;
  CREATE TRIGGER trg_patient_therapy_goals_updated_at_server_owned
    BEFORE INSERT OR UPDATE ON patient_therapy_goals
    FOR EACH ROW EXECUTE FUNCTION public.enforce_clinical_record_updated_at_server_owned();
END $$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_patient_care_preferences_created_at_immutable ON patient_care_preferences;
  CREATE TRIGGER trg_patient_care_preferences_created_at_immutable
    BEFORE INSERT OR UPDATE ON patient_care_preferences
    FOR EACH ROW EXECUTE FUNCTION public.enforce_clinical_record_created_at_immutable();
END $$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_patient_care_providers_created_at_immutable ON patient_care_providers;
  CREATE TRIGGER trg_patient_care_providers_created_at_immutable
    BEFORE INSERT OR UPDATE ON patient_care_providers
    FOR EACH ROW EXECUTE FUNCTION public.enforce_clinical_record_created_at_immutable();
END $$;
