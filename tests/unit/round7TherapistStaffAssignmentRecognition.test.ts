// ROUND 7 — CONFIRMED DEFECT, live-reproduced via fresh adversarial
// testing of Round 6's own W10 "PASS" claim: migration 072 widened
// caregiver_invite_therapist()'s authorization check to recognize
// staff_patient_assignments, but respond_to_therapist_invite()'s own
// staleness re-check (migration 064) and revoke_therapist_connection()
// (migration 065) were never updated and still checked ONLY
// caregiver_patients — meaning every Enterprise-staff-sent therapist
// invitation auto-revoked the instant the therapist tried to accept
// it (status came back 'revoked', never 'accepted'), and the inviting
// staff member could never revoke a connection they or a colleague
// initiated. Live-reproduced this round with a real two-organization
// fixture: an Org A staff-only caregiver (zero caregiver_patients
// rows) invited a real verified therapist; the therapist's accept
// call returned status='revoked' before this fix, and status=
// 'accepted' after it. The therapist's subsequent professional-note
// write and the staff caregiver's subsequent revoke call both then
// succeeded; a second note-write attempt after revocation was
// rejected. All fixtures deleted and zero-count-verified afterward.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('ROUND 7 — migration 074 therapist-connection staff_patient_assignments recognition', () => {
  const source = readFileSync(resolve(process.cwd(), 'supabase/migrations/074_r7_ther_staff_assignment_recognition.sql'), 'utf-8');

  it("respond_to_therapist_invite's staleness re-check now also recognizes an active staff_patient_assignments row for the inviting caregiver", () => {
    const fn = source.split('CREATE OR REPLACE FUNCTION public.respond_to_therapist_invite')[1];
    expect(fn).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM caregiver_patients\s+WHERE caregiver_id = v_conn\.caregiver_id AND patient_id = v_conn\.patient_id\s+FOR UPDATE\s*\)\s*AND NOT EXISTS \(\s*SELECT 1 FROM staff_patient_assignments\s+WHERE user_id = v_conn\.caregiver_id AND patient_id = v_conn\.patient_id AND is_active = true\s*\)/);
    // THER-01's positive role allowlist is preserved verbatim.
    expect(fn).toMatch(/IF v_responder_role IS DISTINCT FROM 'therapist' THEN/);
  });

  it('revoke_therapist_connection now also recognizes an active staff_patient_assignments row for the caller', () => {
    const fn = source.split('CREATE OR REPLACE FUNCTION public.revoke_therapist_connection')[1];
    expect(fn).toMatch(/NOT EXISTS \(SELECT 1 FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth\.uid\(\)\)\s+AND NOT EXISTS \(SELECT 1 FROM staff_patient_assignments WHERE patient_id = p_patient_id AND user_id = auth\.uid\(\) AND is_active = true\)/);
    // THER-02's FOR UPDATE row lock on the connection row is preserved verbatim.
    expect(fn).toMatch(/FOR UPDATE;/);
    expect(fn).toMatch(/v_conn\.status IN \('pending', 'accepted'\)/);
  });
});
