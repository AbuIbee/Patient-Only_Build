// ROUND 5 — NOTE-01 regression tests (new P1 finding, this round's own
// adversarial testing — Master Engineering Execution Directive Part X).
//
// CONFIRMED DEFECT #1 (reproduced live against a full local isolated
// Supabase stack — real Postgres, real RLS, real GoTrue): migration
// 006's "Patients can create their own authored notes" INSERT policy
// (`WITH CHECK (author_id = auth.uid() AND patient_id = auth.uid())`)
// had no note_type restriction. An ordinary PATIENT-role account, with
// zero therapist relationship and zero professional eligibility,
// successfully inserted a row with note_type = 'therapist_session' for
// themselves (201 Created) — forging what reads, to every other
// authorized viewer, as genuine professional clinical documentation.
//
// CONFIRMED DEFECT #2 (same session): the matching SELECT policy
// ("Patients can view their own authored notes", `USING (author_id =
// auth.uid())`) also had no note_type restriction. A real therapist who
// authored a real therapist_session note, then had their relationship
// revoked via revoke_therapist_connection(), could still read that note
// afterward — RLS policies are permissive-OR'd, and this unrelated,
// more broadly-worded policy (written for the 'care_partner_personal'
// self-note case) matched and granted access on its own, even though
// the dedicated "Therapists can view and manage their own session
// notes" policy correctly re-evaluated to false post-revocation. This
// is exactly the invariant this round's THER-01 section demands:
// "Removing eligibility must immediately remove effective professional
// authorization... regardless of whether a historical relationship row
// remains" — applied here to professional-note reading specifically.
//
// FIX (migration 066): both policies now explicitly exclude the
// professional note types (therapist_session, clinical_observation).
// Applied to both the local isolated stack and staging.
//
// LIVE VERIFICATION (local isolated stack, real HTTP against real
// PostgREST + RLS):
//   - Before the fix: patient-authored therapist_session note INSERT
//     returned 201. After the fix: 403 (RLS violation).
//   - Before the fix: a revoked therapist's GET on their own past
//     therapist_session note still returned the row. After the fix:
//     empty result set.
//   - Regression: a patient's legitimate care_partner_personal
//     self-note still succeeds (201) after the fix — no functionality
//     lost.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('NOTE-01 — migration 066 excludes professional note types from the patient self-note policies', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/066_r5_patient_authored_notes_exclude_professional_types.sql'),
    'utf-8',
  );

  function createPolicyBody(policyName: string): string {
    const marker = `CREATE POLICY "${policyName}"`;
    const idx = source.lastIndexOf(marker);
    expect(idx, `expected to find a CREATE POLICY statement for "${policyName}"`).toBeGreaterThan(-1);
    return source.slice(idx, idx + marker.length + 400);
  }

  it('the patient self-authoring INSERT policy excludes therapist_session and clinical_observation', () => {
    const block = createPolicyBody('Patients can create their own authored notes');
    expect(block).toMatch(/note_type\s+NOT IN\s*\(\s*'therapist_session'\s*,\s*'clinical_observation'\s*\)/);
  });

  it('the patient self-viewing SELECT policy excludes therapist_session and clinical_observation', () => {
    const block = createPolicyBody('Patients can view their own authored notes');
    expect(block).toMatch(/note_type\s+NOT IN\s*\(\s*'therapist_session'\s*,\s*'clinical_observation'\s*\)/);
  });

  it('both narrowed policies still require author_id = auth.uid() (unchanged ownership requirement)', () => {
    const insertBlock = createPolicyBody('Patients can create their own authored notes');
    const selectBlock = createPolicyBody('Patients can view their own authored notes');
    expect(insertBlock).toMatch(/author_id\s*=\s*auth\.uid\(\)/);
    expect(selectBlock).toMatch(/author_id\s*=\s*auth\.uid\(\)/);
  });

  it('the INSERT policy still requires patient_id = auth.uid() — a patient may only self-author, never author a note attributed to a different patient', () => {
    const insertBlock = createPolicyBody('Patients can create their own authored notes');
    expect(insertBlock).toMatch(/patient_id\s*=\s*auth\.uid\(\)/);
  });

  it('the patient self-authored DELETE policy is explicitly left unchanged (a patient can only ever delete their own author_id rows, never a professional\'s)', () => {
    expect(source).toMatch(/Patients can delete their own authored notes.*is left unchanged/s);
  });
});
