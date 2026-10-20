// ROUND 6 — CONFIRMED DEFECT, live-reproduced: an Enterprise org-
// caregiver's task-completion UPDATE returned HTTP 200 with an EMPTY
// body — the existing "Caregivers can manage tasks for their
// patients" policy (migration 001) is scoped to caregiver_patients
// only; migration 067 had only extended `tasks` SELECT to staff, never
// UPDATE. The Round 5 Enterprise Caregiver Dashboard's TasksView
// "mark complete/skip" buttons silently did nothing for any Enterprise
// staff caregiver. Found and fixed this round (migration 071) before
// any Codex report — live-verified: the same UPDATE that previously
// matched zero rows now succeeds and returns the updated row.
//
// Also fixed in the same migration/round, same root-cause pattern
// (RLS write-side gaps for staff that migration 067 only closed for
// SELECT): staff can now author ordinary (non-professional)
// patient_notes, record mood_entries, and upload
// patient_document_uploads — all live-verified. And
// get_patient_help_activation_history() (migration 053, a P0 fix in
// its own right) never recognized staff_patient_assignments at all
// and would flatly reject an Enterprise caregiver; extended with one
// additional OR-branch, the existing NULL-safe condition preserved
// verbatim.
//
// H08/W02/N04: tasks.status now also accepts 'not_applicable'
// (previously only pending/completed/skipped), plus refusal_reason —
// closing "Completed, Declined, Not Completed or Not Applicable...
// documented patient refusal."
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('ROUND 6 — migration 071 staff write-access and task-status fixes', () => {
  const source = readFileSync(resolve(process.cwd(), 'supabase/migrations/071_r6_enterprise_staff_write_access_and_schema.sql'), 'utf-8');

  it('adds an explicit staff UPDATE policy on tasks (the confirmed silent-write-failure fix)', () => {
    expect(source).toMatch(/CREATE POLICY "Assigned org staff can update tasks for their patients"\s+ON tasks FOR UPDATE/);
  });

  it("tasks.status now accepts 'not_applicable' and a refusal_reason column exists", () => {
    expect(source).toMatch(/CHECK \(status IN \('pending', 'completed', 'skipped', 'not_applicable'\)\)/);
    expect(source).toMatch(/ADD COLUMN IF NOT EXISTS refusal_reason TEXT/);
  });

  it('staff can author ordinary notes but the policy explicitly excludes professional note types and the patient-only type', () => {
    const fn = source.split('"Assigned org staff can author ordinary notes for their patients"')[1];
    expect(fn).toMatch(/note_type NOT IN \('therapist_session', 'clinical_observation', 'care_partner_personal'\)/);
    expect(fn).toMatch(/author_id = auth\.uid\(\) AND caregiver_id IS NULL/);
  });

  it('staff gain INSERT on mood_entries and patient_document_uploads, scoped to staff_patient_assignments', () => {
    expect(source).toMatch(/"Assigned org staff can record mood entries for their patients"\s+ON mood_entries FOR INSERT/);
    expect(source).toMatch(/"Assigned org staff can upload documents for their patients"\s+ON patient_document_uploads FOR INSERT/);
  });

  it('get_patient_help_activation_history now recognizes an active staff_patient_assignments row, preserving the original NULL-safe condition verbatim', () => {
    const fn = source.split('CREATE OR REPLACE FUNCTION public.get_patient_help_activation_history')[1];
    expect(fn).toMatch(/auth\.uid\(\) = p_patient_id/);
    expect(fn).toMatch(/EXISTS \(SELECT 1 FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth\.uid\(\)\)/);
    expect(fn).toMatch(/EXISTS \(SELECT 1 FROM staff_patient_assignments WHERE patient_id = p_patient_id AND user_id = auth\.uid\(\) AND is_active = true\)/);
  });

  it('messages gains a message_type column defaulting to message, never altering existing rows semantics (C03)', () => {
    expect(source).toMatch(/ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'message' CHECK \(message_type IN \('message', 'care_update'\)\)/);
  });
});
