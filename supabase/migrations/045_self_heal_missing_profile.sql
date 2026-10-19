-- 045_self_heal_missing_profile.sql
-- CRITICAL OWNER-REPORTED REMEDIATION Correction C — patient intake data
-- integrity / profile-creation lifecycle.
--
-- Confirmed root cause of the reported patient_intake_patient_profile_id_
-- fkey failure (and the matching "patient without a profile" /
-- "Auth users missing profiles" staging inconsistencies): when
-- handle_new_user() does not run for a given signup (root cause of THAT
-- still not isolated — a prior round already investigated without
-- finding it, and is not re-litigated here), App.tsx's session-restore
-- does not treat the missing profiles row as blocking. It logs a
-- warning and proceeds with buildAuthFallbackProfile() — a SYNTHESIZED,
-- in-memory-only object built from the Auth session, never written to
-- the database. The user is then let into the app (as a fallback
-- "patient") and can reach PatientIntakeForm, which writes
-- patient_intake.patient_profile_id = their real, valid auth.uid() — a
-- value the database correctly rejects via this exact FK, because no
-- profiles row with that id actually exists. Before that failure, the
-- same save sequence had already upserted a `patients` row for that same
-- non-existent profile id (patients.id has no FK at all) — the likely
-- source of the separately-reported "patient without a matching
-- profile" row.
--
-- Fix (this migration): a narrow, deterministic, idempotent self-heal
-- RPC a signed-in user can call for ONLY their own id, sourcing the same
-- fields handle_new_user() already derives from auth.users — this does
-- not invent any clinical data, only the bare account fields every
-- signup already produces. App.tsx (separate commit) now calls this the
-- moment it detects its own session has no matching profile, instead of
-- silently proceeding on a fallback — and re-fetches the REAL row
-- afterward, so state.currentUser.id is guaranteed to correspond to an
-- actual profiles row before any FK-dependent write (patient_intake,
-- etc.) can be attempted. This is also the "deterministic, authorized
-- procedure" for reconciling existing incomplete staging identities —
-- each affected account self-heals the next time it signs in; nothing
-- is deleted, nothing is invented beyond what signup already recorded.
--
-- STAGING-TARGETED. Not yet applied to production.
CREATE OR REPLACE FUNCTION public.self_heal_my_profile()
RETURNS profiles AS $$
DECLARE
  v_row profiles;
  v_email TEXT;
  v_meta JSONB;
  v_requested_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Already healed (a concurrent call, or the row was never actually
  -- missing) — return it as-is, no write.
  SELECT * INTO v_row FROM profiles WHERE id = auth.uid();
  IF v_row.id IS NOT NULL THEN
    RETURN v_row;
  END IF;

  SELECT email, raw_user_meta_data INTO v_email, v_meta FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'No Auth account found for this session';
  END IF;

  v_requested_role := v_meta->>'role';

  INSERT INTO public.profiles (id, email, first_name, last_name, role)
  VALUES (
    auth.uid(),
    v_email,
    COALESCE(v_meta->>'first_name', 'New'),
    COALESCE(v_meta->>'last_name', 'User'),
    CASE WHEN v_requested_role IN ('patient', 'caregiver') THEN v_requested_role ELSE 'patient' END
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    -- Lost a race with a concurrent call (or the trigger itself fired in
    -- between) — re-read rather than report a false failure.
    SELECT * INTO v_row FROM profiles WHERE id = auth.uid();
  END IF;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.self_heal_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.self_heal_my_profile() TO authenticated;

COMMENT ON FUNCTION public.self_heal_my_profile IS 'CRITICAL OWNER-REPORTED REMEDIATION Correction C: idempotent, caller-scoped repair for a signed-in user whose profiles row is missing. Sources only fields the normal signup trigger (handle_new_user) already derives from auth.users — never invents clinical or identity data beyond that.';
