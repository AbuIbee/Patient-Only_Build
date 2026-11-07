// HCN-MASTER-REMEDIATION-20261101, Phase A -- regression evidence for the
// S01/S02 corrections to PR #4's draft migrations
// (supabase/migrations/20261101090000_hcn_p0_current_staff_clinical_authorization.sql
// and .../20261101091000_hcn_reconcile_checkin_and_redundant_policies.sql).
//
// Independent Codex review 004 found the first draft of these migrations
// unsafe (audit-output/HCN_PR4_SAFE_CHECKPOINT_20261101 on
// audit/hcn-pr4-reviewed-controls-20261101): S01-R1 (substring/position()
// guard recognition accepts unexpected branches and wrong helper
// arguments), S02-R1 (fixed total-count gate rejects the valid 31-policy
// historical state), S02-R2 (brittle to PostgreSQL's own schema-
// qualification deparsing), S02-R3 (presence-only checks can't detect an
// unsafe extra branch), S02-R4 (single-pass validate+mutate loop).
//
// This suite exercises the ACTUAL migration SQL files against a real
// disposable PostgreSQL instance -- not a static read -- because that is
// exactly how an additional, more fundamental defect was found while doing
// this work: the original draft's identity/drift-check subqueries used a
// SQL table alias "p" that collides with the surrounding DO block's own
// loop variable "p" (declared `record`, unassigned until the FOR loop
// runs), which PL/pgSQL resolves against the unassigned plpgsql variable
// first -- raising "record \"p\" is not assigned yet" before a single
// policy could be validated. The draft, as committed to PR #4, had never
// actually been run successfully against a real PostgreSQL instance; this
// was caught only by executing it, not by static review.
//
// A second, independently serious defect was found the same way: the
// draft's free-tier check-in guard correction assumed the PRE-migration-152
// predicate (public.patient_has_paid_entitlement(patient_id), combined with
// a caregiver_patients check) was still current. Migration 152 ("P1-08
// local entitlement oracle lockdown", applied well after the stale
// baseline snapshot the original draft was reasoned from) replaced that
// predicate with a bare, self-scoped public.my_patient_has_paid_entitlement()
// call AND revoked `authenticated`'s EXECUTE on the raw, arbitrary-argument
// patient_has_paid_entitlement(uuid) entirely. The original draft's
// replacement predicate would have called a function `authenticated` can no
// longer execute, failing EVERY check-in INSERT with "permission denied for
// function" once actually applied -- not merely the unauthorized ones.
//
// Requires the local disposable Supabase stack (scripts/disposable_supabase.mjs)
// -- never the owner's persistent database (enforced by _runtime.ts's own
// target validation, which this file reuses).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ANON, DB_CONTAINER, http, sql } from './_runtime';

const REPO_ROOT = join(__dirname, '..', '..');
const M1_PATH = join(REPO_ROOT, 'supabase', 'migrations', '20261101090000_hcn_p0_current_staff_clinical_authorization.sql');
const M2_PATH = join(REPO_ROOT, 'supabase', 'migrations', '20261101091000_hcn_reconcile_checkin_and_redundant_policies.sql');
const M1_SQL = readFileSync(M1_PATH, 'utf-8');
const M2_SQL = readFileSync(M2_PATH, 'utf-8');

const SYNTHETIC_FQA_GUARD_NAME = "Caller must be the check-in's own patient (FQA-019/SEC-008)";

function runSqlExpectSuccess(script: string): string {
  return execSync(`docker exec -i ${DB_CONTAINER} psql -U postgres -d postgres -At -q -v ON_ERROR_STOP=1`, { input: script }).toString();
}
function runSqlExpectFailure(script: string): string {
  try {
    execSync(`docker exec -i ${DB_CONTAINER} psql -U postgres -d postgres -At -q -v ON_ERROR_STOP=1`, { input: script, stdio: ['pipe', 'pipe', 'pipe'] });
    throw new Error('Expected the migration to fail, but it succeeded.');
  } catch (e) {
    const stderr = (e as { stderr?: Buffer }).stderr?.toString() ?? '';
    return stderr;
  }
}

describe('HCN-MASTER-REMEDIATION-20261101 Phase A -- PR #4 S01/S02 corrective migrations, real-execution regression', () => {
  // These migrations are ALREADY part of the normal migration history
  // applied by the disposable stack boot (scripts/disposable_supabase.mjs),
  // so by the time this suite runs, M1 and M2 have each already succeeded
  // once. Every test below replays them again or tampers with the live
  // catalog, then restores it, never assuming a particular starting point
  // beyond "M1 and M2 already applied cleanly".

  it('sanity: both migrations already applied cleanly as part of the normal migration history (29-manifest fully upgraded, free-tier guard extended)', () => {
    const upgraded = sql(`
      SELECT count(*) FROM pg_policies
      WHERE schemaname='public' AND tablename='patients'
        AND policyname='Assigned org staff can view their assigned patients'
        AND qual ILIKE '%hcn_current_staff_patient_access%';
    `);
    expect(upgraded).toBe('1');
    const freeTier = sql(`
      SELECT with_check FROM pg_policies
      WHERE schemaname='public' AND tablename='care_partner_checkins'
        AND policyname='Free-tier accounts cannot submit new care partner check-ins (RE';
    `);
    expect(freeTier).toContain('my_patient_has_paid_entitlement');
    expect(freeTier).toContain('hcn_current_staff_patient_access');
  });

  // CONFIRMED LIVE, a second real defect this run found beyond Codex
  // review 004's own S01-R1..S02-R4 list: every one of the 29 upgraded
  // policies (plus the two check-in guards 091000 extends) carries no
  // `TO` clause, so adding a call to hcn_current_staff_patient_access()
  // -- correctly REVOKEd from anon -- turned "RLS returns an empty result
  // for anon" into a hard 401 "permission denied for function" on every
  // anonymous read of any of these tables. Fixed by rescoping every
  // upgraded policy `TO authenticated` in the same ALTER POLICY statement
  // as its content change, reproducing migration 106's own already-
  // established fix for a disjoint set of 56 policies.
  it('an anonymous caller still gets 200 + [] (not 401) reading a table whose policy now calls hcn_current_staff_patient_access()', async () => {
    const [status, body] = await http('GET', '/rest/v1/patients?select=id&limit=1', undefined, ANON);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('an anonymous caller still gets 200 + [] (not 401) attempting to read care_partner_checkins, whose check-in guards now call hcn_current_staff_patient_access()', async () => {
    const [status, body] = await http('GET', '/rest/v1/care_partner_checkins?select=id&limit=1', undefined, ANON);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('M1 replay (M1 -> M1) against an already-migrated database is a safe no-op', () => {
    expect(() => runSqlExpectSuccess(M1_SQL)).not.toThrow();
  });

  it('M2 replay (M1 -> M2 -> M2) against an already-migrated database is a safe no-op', () => {
    expect(() => runSqlExpectSuccess(M2_SQL)).not.toThrow();
  });

  it('M1 -> M2 -> M1 -> M2 full regression sequence is safe end to end', () => {
    expect(() => runSqlExpectSuccess(M1_SQL)).not.toThrow();
    expect(() => runSqlExpectSuccess(M2_SQL)).not.toThrow();
  });

  describe('historical 31-policy state (S02-R1): both coexisting check-in restrictive guards present', () => {
    beforeAll(() => {
      sql(`
        CREATE POLICY "${SYNTHETIC_FQA_GUARD_NAME}"
        ON public.care_partner_checkins AS RESTRICTIVE FOR INSERT
        WITH CHECK (
          (patient_id = auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.caregiver_patients cp
            WHERE cp.patient_id = care_partner_checkins.patient_id AND cp.caregiver_id = auth.uid()
          )
        );
      `);
    });
    afterAll(() => {
      sql(`DROP POLICY IF EXISTS "${SYNTHETIC_FQA_GUARD_NAME}" ON public.care_partner_checkins;`);
    });

    it('M1 does not reject the historical state on its drift check (no magic total-count gate)', () => {
      expect(() => runSqlExpectSuccess(M1_SQL)).not.toThrow();
    });

    it('M2 extends the historical-only guard with the staff branch, reaching the real historical total of 31', () => {
      expect(() => runSqlExpectSuccess(M2_SQL)).not.toThrow();
      const count = sql(`
        SELECT count(*) FROM pg_policies p
        WHERE p.schemaname IN ('public','storage')
          AND (coalesce(p.qual,'')||coalesce(p.with_check,'')) ILIKE '%staff_patient_assignments%';
      `);
      expect(count).toBe('31');
      const extended = sql(`
        SELECT with_check FROM pg_policies
        WHERE schemaname='public' AND tablename='care_partner_checkins'
          AND policyname='${SYNTHETIC_FQA_GUARD_NAME.replace("'", "''")}';
      `);
      expect(extended).toContain('hcn_current_staff_patient_access');
    });

    it('M1 and M2 both still replay as safe no-ops once the historical guard has been extended', () => {
      expect(() => runSqlExpectSuccess(M1_SQL)).not.toThrow();
      expect(() => runSqlExpectSuccess(M2_SQL)).not.toThrow();
    });
  });

  describe('tamper detection (S01-R1/S02-R3): fail closed on an unexpected shape', () => {
    const ORIGINAL_USING =
      "EXISTS ( SELECT 1 FROM staff_patient_assignments spa WHERE ((spa.patient_id = patients.id) AND (spa.user_id = auth.uid()) AND ((spa.is_active = true) AND hcn_current_staff_patient_access(spa.organization_id, spa.patient_id))))";

    afterAll(() => {
      // Always restore the known-good shape, regardless of which test ran last.
      sql(`ALTER POLICY "Assigned org staff can view their assigned patients" ON public.patients USING (${ORIGINAL_USING});`);
    });

    it('rejects an already-guarded policy whose helper call arguments have been swapped', () => {
      sql(`
        ALTER POLICY "Assigned org staff can view their assigned patients" ON public.patients
        USING (EXISTS ( SELECT 1 FROM staff_patient_assignments spa WHERE ((spa.patient_id = patients.id) AND (spa.user_id = auth.uid()) AND ((spa.is_active = true) AND hcn_current_staff_patient_access(spa.patient_id, spa.organization_id)))));
      `);
      const stderr = runSqlExpectFailure(M1_SQL);
      expect(stderr).toMatch(/Unexpected helper call or wrong arguments/);
    });

    it('rejects a duplicated raw guard token added alongside an already-wrapped guard (the specific "unexpected OR branch" class this migration can detect without full per-policy ground truth)', () => {
      sql(`
        ALTER POLICY "Assigned org staff can view their assigned patients" ON public.patients
        USING (EXISTS ( SELECT 1 FROM staff_patient_assignments spa WHERE ((spa.patient_id = patients.id) AND (spa.user_id = auth.uid()) AND ((spa.is_active = true) AND hcn_current_staff_patient_access(spa.organization_id, spa.patient_id) OR (spa.is_active = true)))));
      `);
      const stderr = runSqlExpectFailure(M1_SQL);
      expect(stderr).toMatch(/Unexpected USING shape or role-scope\/content mismatch/);
    });

    it('rejects a wholly unknown extra restrictive check-in guard that M2 does not recognize', () => {
      sql(`
        CREATE POLICY "Synthetic unreviewed restrictive guard"
        ON public.care_partner_checkins AS RESTRICTIVE FOR INSERT
        WITH CHECK (EXISTS (SELECT 1 FROM staff_patient_assignments spa WHERE spa.patient_id = care_partner_checkins.patient_id));
      `);
      try {
        const stderr = runSqlExpectFailure(M2_SQL);
        expect(stderr).toMatch(/Unexpected restrictive check-in ownership guard/);
      } finally {
        sql(`DROP POLICY IF EXISTS "Synthetic unreviewed restrictive guard" ON public.care_partner_checkins;`);
      }
    });
  });
});
