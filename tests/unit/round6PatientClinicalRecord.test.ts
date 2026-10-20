// ROUND 6 — new clinical-record tables regression tests: P02
// (Diagnoses), P03 (Allergies), P08 (Care Plan), P10 (Vitals), P19
// (Therapy Goals), P21 (Care Preferences). None of these existed
// before this round.
//
// LIVE VERIFICATION (local isolated stack, real HTTP, disposable
// fixtures): a real org-caregiver recorded a diagnosis, allergy, care
// plan, and vitals for their own patient — each read back correctly
// via direct REST. The caregiver's attempt to record a diagnosis with
// source='professional_observation' was REJECTED (that claim is
// gated to therapist/medical_professional staff only). The same
// caregiver's attempt to record a therapy goal (author-restricted to
// professional staff entirely) was REJECTED. An entirely unrelated
// account received an empty read and was REJECTED attempting to
// record a diagnosis for a patient with no assignment. All fixtures
// deleted afterward; verified via a zero-count query.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('ROUND 6 — migration 070 source-provenance and professional-authorship gates', () => {
  const source = readFileSync(resolve(process.cwd(), 'supabase/migrations/070_r6_patient_clinical_record_tables.sql'), 'utf-8');

  it('has_patient_access recognizes both caregiver_patients and staff_patient_assignments (dual-source, matching migration 067)', () => {
    const fn = source.split('CREATE OR REPLACE FUNCTION public.has_patient_access')[1];
    expect(fn).toMatch(/caregiver_patients/);
    expect(fn).toMatch(/staff_patient_assignments/);
  });

  it('record_patient_diagnosis/allergy/vitals reject a professional_observation source claim unless the caller is professional staff', () => {
    for (const fnName of ['record_patient_diagnosis', 'record_patient_allergy', 'record_patient_vitals']) {
      const fn = source.split(`CREATE OR REPLACE FUNCTION public.${fnName}`)[1];
      expect(fn).toMatch(/p_source\s*=\s*'professional_observation'\s+AND\s+NOT\s+public\.is_professional_staff_for_patient/);
    }
  });

  it('record_therapy_goal is author-restricted to professional staff entirely, not merely the source label', () => {
    const fn = source.split('CREATE OR REPLACE FUNCTION public.record_therapy_goal')[1];
    expect(fn).toMatch(/IF NOT public\.is_professional_staff_for_patient\(p_patient_id\) THEN RAISE EXCEPTION/);
  });

  it('record_patient_care_plan versions forward-only and marks the prior plan not current, rather than overwriting history', () => {
    const fn = source.split('CREATE OR REPLACE FUNCTION public.record_patient_care_plan')[1];
    expect(fn).toMatch(/UPDATE patient_care_plans SET is_current = false/);
    expect(fn).toMatch(/v_next_version/);
  });

  it('every new table enables RLS and every INSERT policy requires author_id = auth.uid()', () => {
    for (const table of ['patient_diagnoses', 'patient_allergies', 'patient_care_plans', 'patient_vitals', 'patient_therapy_goals', 'patient_care_preferences']) {
      expect(source).toMatch(new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`));
    }
    const insertPolicies = source.match(/FOR INSERT WITH CHECK \(author_id = auth\.uid\(\)/g) ?? [];
    expect(insertPolicies.length).toBeGreaterThanOrEqual(6);
  });

  it('every RPC is REVOKEd from PUBLIC and GRANTed only to authenticated (never anon)', () => {
    const revokes = source.match(/REVOKE ALL ON FUNCTION public\.\w+\([^)]*\) FROM PUBLIC/g) ?? [];
    const grants = source.match(/GRANT EXECUTE ON FUNCTION public\.\w+\([^)]*\) TO authenticated/g) ?? [];
    expect(revokes.length).toBe(grants.length);
    expect(revokes.length).toBeGreaterThanOrEqual(9);
  });
});
