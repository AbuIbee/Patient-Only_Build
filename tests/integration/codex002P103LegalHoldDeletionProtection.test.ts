// MMA-P1-CODEX-002 P1-03 -- "A Caregiver can delete a clinical note
// despite an active legal hold." Migration 149 adds a RESTRICTIVE DELETE
// policy on patient_notes/patient_document_uploads/medications/
// medication_logs using patient_legal_holds. Proves the original Codex
// reproduction no longer succeeds, that deletion works normally when no
// hold exists, that an unrelated patient's notes are unaffected, and that
// non-destructive UPDATE remains permitted under an active hold.
//
// MMA-P1-FINAL-CLOSURE Priority 5 — CRITICAL BUG FOUND AND FIXED while
// re-verifying this exact finding: this test's "caregiver" identity was
// previously ALSO granted role='admin' (needed to call
// place_patient_legal_hold(), which requires is_platform_owner()) --
// which silently masked a real defect. patient_legal_holds' own RLS
// (Platform-Owner-only SELECT) meant migration 149's RESTRICTIVE
// policies, which queried it via a raw subquery, were evaluated under
// the SAME role as the caller -- for a genuine non-admin caregiver, that
// subquery saw zero rows regardless of whether a hold was actually
// active, making the policy provide NO real protection. Confirmed
// empirically: `SET ROLE authenticated` as an ordinary (non-admin) user
// against a row with a real active hold returned EXISTS=false. Fixed in
// migrations 158/159 (patient_has_active_legal_hold(), a SECURITY
// DEFINER wrapper unaffected by the caller's own RLS). This test now
// uses a GENUINELY separate admin identity to place/release the hold,
// so the caregiver under test is the real, ordinary-Caregiver threat
// model the original finding named -- not an admin masquerading as one.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, http, rpc, sql } from './_runtime';

const PW = 'Codex002P103Fix9!';
const stamp = Date.now();

const emails = {
  caregiver: `codex002p103-caregiver-${stamp}@local.test`,
  admin: `codex002p103-admin-${stamp}@local.test`,
  patientHeld: `codex002p103-patientHeld-${stamp}@local.test`,
  patientFree: `codex002p103-patientFree-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
let noteHeldId: string;
let noteFreeId: string;
let holdId: string;

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}');
    UPDATE profiles SET role='admin' WHERE id='${ids.admin}';
    BEGIN;
    INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES
      ('${ids.patientHeld}','Codex002','Held','Codex002 Held','1 Ave','Facility'),
      ('${ids.patientFree}','Codex002','Free','Codex002 Free','1 Ave','Facility');
    INSERT INTO caregiver_patients(caregiver_id,patient_id) VALUES
      ('${ids.caregiver}','${ids.patientHeld}'),
      ('${ids.caregiver}','${ids.patientFree}');
    COMMIT;
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);

  noteHeldId = sql(`INSERT INTO patient_notes(patient_id, caregiver_id, note_type, note) VALUES ('${ids.patientHeld}','${ids.caregiver}','general','Pre-hold synthetic note') RETURNING id;`);
  noteFreeId = sql(`INSERT INTO patient_notes(patient_id, caregiver_id, note_type, note) VALUES ('${ids.patientFree}','${ids.caregiver}','general','No-hold synthetic note') RETURNING id;`);

  const [, hold] = (await rpc('place_patient_legal_hold', { p_patient_id: ids.patientHeld, p_reason: 'Pending litigation hold' }, tok.admin)) as [number, { id: string }];
  holdId = hold.id;
});

afterAll(async () => {
  sql(`
    DELETE FROM account_management_audit WHERE target_user_id IN ('${ids.patientHeld}','${ids.patientFree}');
    DELETE FROM patient_legal_holds WHERE patient_id IN ('${ids.patientHeld}','${ids.patientFree}');
    DELETE FROM patient_notes WHERE patient_id IN ('${ids.patientHeld}','${ids.patientFree}');
    DELETE FROM caregiver_patients WHERE caregiver_id='${ids.caregiver}';
    DELETE FROM patients WHERE id IN ('${ids.patientHeld}','${ids.patientFree}');
  `);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

describe('MMA-P1-CODEX-002 P1-03 (migration 149) — legal hold blocks note deletion', () => {
  it('a Caregiver cannot delete a note for a patient under an active legal hold', async () => {
    await http('DELETE', `/rest/v1/patient_notes?id=eq.${noteHeldId}`, undefined, tok.caregiver);
    const stillThere = sql(`SELECT count(*) FROM patient_notes WHERE id='${noteHeldId}';`);
    expect(stillThere).toBe('1');
  });

  it('non-destructive update of the held note is still permitted', async () => {
    const [status] = await http('PATCH', `/rest/v1/patient_notes?id=eq.${noteHeldId}`, { note: 'Corrected while under hold' }, tok.caregiver);
    expect(status).toBeLessThan(300);
    const text = sql(`SELECT note FROM patient_notes WHERE id='${noteHeldId}';`);
    expect(text).toBe('Corrected while under hold');
  });

  it("an unrelated patient's note (no hold) is unaffected and can still be deleted normally", async () => {
    await http('DELETE', `/rest/v1/patient_notes?id=eq.${noteFreeId}`, undefined, tok.caregiver);
    const gone = sql(`SELECT count(*) FROM patient_notes WHERE id='${noteFreeId}';`);
    expect(gone).toBe('0');
  });

  it('once the hold is released, the previously-protected note can be deleted', async () => {
    const [releaseStatus] = await rpc('release_patient_legal_hold', { p_hold_id: holdId }, tok.admin);
    expect(releaseStatus).toBe(200);

    await http('DELETE', `/rest/v1/patient_notes?id=eq.${noteHeldId}`, undefined, tok.caregiver);
    const gone = sql(`SELECT count(*) FROM patient_notes WHERE id='${noteHeldId}';`);
    expect(gone).toBe('0');
  });

  // service_role intentionally bypasses RLS entirely in this architecture
  // (every legitimate backend/admin RPC in this repository, including
  // this session's own archive_eligible_closed_patients(), relies on
  // that) -- an RLS-based RESTRICTIVE policy structurally cannot and
  // should not apply to it; service_role is the trusted root, not part
  // of this threat model. Real protection for any future service-role-
  // driven exceptional deletion path (P1-05) must be an explicit,
  // procedural hold check INSIDE that specific RPC, not a blanket
  // service_role lockout here that would also break every other
  // legitimate privileged maintenance operation in this repository. No
  // test is asserted here against service_role for that reason -- it is
  // not a gap, it is the correct trust boundary for this role.
});
