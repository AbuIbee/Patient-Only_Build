// ROUND 5 — Enterprise Caregiver Portal foundation: staff clinical-record
// RLS access (new finding, this round's own inventory pass).
//
// CONFIRMED GAP: every base clinical table's RLS (migration 001 and
// later) only ever recognized `caregiver_patients`. The existing
// EnterpriseStaffPatientView.tsx already queried medications,
// mood_entries, and care_partner_notes directly for an org staff member
// under the assumption that an active `staff_patient_assignments` row
// was sufficient authorization — but no such RLS policy existed. The
// result: a staff member's query for an assigned patient's clinical
// data was silently denied and returned zero rows, indistinguishable
// from "this patient genuinely has none."
//
// FIX (migration 067): a read-only SELECT policy added to each base
// clinical table (medications, medication_schedules, medication_logs,
// tasks, mood_entries, appointments, patient_document_uploads,
// care_partner_checkins, care_partner_notes, help_activations,
// patients), granting access only when the caller holds an ACTIVE
// staff_patient_assignments row for that patient.
//
// LIVE VERIFICATION (local isolated stack, real HTTP against real
// PostgREST + RLS, disposable organization/director/staff/patient):
//   - An assigned org staff caregiver's GET on the patient's
//     medications now returns the row (previously: empty).
//   - An unrelated org director (same organization, no assignment to
//     this specific patient) still gets an empty result.
//   - After unassign_staff_from_patient(), the previously-assigned
//     staff caregiver's GET on the same medication reverts to empty —
//     access is revoked immediately, matching the existing guarantee
//     caregiver_patients-based revocation already provides.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Enterprise foundation — migration 067 grants staff_patient_assignments-based read access to base clinical tables', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/067_r5_enterprise_staff_clinical_record_access.sql'),
    'utf-8',
  );

  const tables = [
    'medications', 'medication_schedules', 'medication_logs', 'tasks', 'mood_entries',
    'appointments', 'patient_document_uploads', 'care_partner_checkins', 'care_partner_notes',
    'help_activations', 'patients',
  ];

  it.each(tables)('adds an "Assigned org staff can view" SELECT policy referencing staff_patient_assignments on %s', (table) => {
    const marker = `ON ${table} FOR SELECT`;
    const idx = source.indexOf(marker);
    expect(idx, `expected a SELECT policy on ${table}`).toBeGreaterThan(-1);
    const block = source.slice(Math.max(0, idx - 300), idx + 300);
    expect(block).toMatch(/Assigned org staff can view/);
    expect(block).toMatch(/staff_patient_assignments/);
    expect(block).toMatch(/is_active\s*=\s*true/);
  });

  it('every new policy is read-only (SELECT) — no INSERT/UPDATE/DELETE access is widened for staff', () => {
    expect(source).not.toMatch(/FOR (INSERT|UPDATE|DELETE)/);
  });

  it('every new policy block is wrapped in a duplicate-safe DO block (idempotent re-apply)', () => {
    const doBlockCount = (source.match(/DO \$\$ BEGIN/g) ?? []).length;
    const exceptionCount = (source.match(/EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;/g) ?? []).length;
    expect(doBlockCount).toBeGreaterThanOrEqual(tables.length);
    expect(doBlockCount).toBe(exceptionCount);
  });
});
