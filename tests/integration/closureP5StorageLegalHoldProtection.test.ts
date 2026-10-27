// MMA-P1-FINAL-CLOSURE Priority 5 -- "For legal holds, specifically
// investigate... Storage deletion." Migration 158 adds a RESTRICTIVE
// DELETE policy on storage.objects (bucket 'patient-media') keyed on
// patient_has_active_legal_hold(). Proves, against real Storage RLS, as
// a genuine non-admin caregiver: an object cannot be deleted while an
// active hold exists on the owning patient, deletion works normally
// once released, and an unrelated patient's object is unaffected.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql, SERVICE, BASE, ANON } from './_runtime';

// The generic http() helper always sends Content-Type: application/json
// and Prefer: return=representation -- harmless for PostgREST, but the
// Storage API's single-object DELETE endpoint behaves differently with
// them present (confirmed empirically this session: identical requests
// succeed without these headers and silently no-op with them). A
// dedicated, minimal DELETE call avoids that entirely.
async function storageDelete(path: string, token: string): Promise<number> {
  const r = await fetch(`${BASE}/storage/v1/object/${path}`, { method: 'DELETE', headers: { apikey: ANON, Authorization: `Bearer ${token}` } });
  return r.status;
}

const PW = 'ClosureP5StorageFix9!';
const stamp = Date.now();

const emails = {
  caregiver: `closurep5-caregiver-${stamp}@local.test`,
  admin: `closurep5-admin-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
let patientHeld: string;
let patientFree: string;
let holdId: string;
const objectHeldPath = () => `${patientHeld}/held-object.txt`;
const objectFreePath = () => `${patientFree}/free-object.txt`;

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  patientHeld = await authSignUp(`closurep5-patientHeld-${stamp}@local.test`, PW);
  patientFree = await authSignUp(`closurep5-patientFree-${stamp}@local.test`, PW);

  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete'
    WHERE id IN ('${ids.caregiver}','${ids.admin}','${patientHeld}','${patientFree}');
    UPDATE profiles SET role='admin' WHERE id='${ids.admin}';
    BEGIN;
    INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES
      ('${patientHeld}','ClosureP5','Held','ClosureP5 Held','1 Ave','Facility'),
      ('${patientFree}','ClosureP5','Free','ClosureP5 Free','1 Ave','Facility');
    INSERT INTO caregiver_patients(caregiver_id,patient_id) VALUES
      ('${ids.caregiver}','${patientHeld}'),
      ('${ids.caregiver}','${patientFree}');
    COMMIT;
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);

  // Insert storage.objects rows directly (bypassing the actual upload
  // pipeline, which is unrelated to this specific DELETE-policy check).
  sql(`
    INSERT INTO storage.objects (bucket_id, name, owner) VALUES
      ('patient-media', '${objectHeldPath()}', '${ids.caregiver}'),
      ('patient-media', '${objectFreePath()}', '${ids.caregiver}');
  `);

  const [, hold] = (await rpc('place_patient_legal_hold', { p_patient_id: patientHeld, p_reason: 'Pending litigation hold' }, tok.admin)) as [number, { id: string }];
  holdId = hold.id;
});

afterAll(async () => {
  // storage.objects has a BEFORE DELETE trigger (storage.protect_delete())
  // that unconditionally refuses a raw SQL DELETE, for ANY role including
  // the postgres superuser -- "Use the Storage API instead." Cleanup
  // must go through the real Storage REST endpoint (SERVICE bypasses
  // RLS, so this succeeds regardless of any remaining hold).
  await storageDelete(`patient-media/${objectHeldPath()}`, SERVICE);
  await storageDelete(`patient-media/${objectFreePath()}`, SERVICE);
  sql(`
    DELETE FROM account_management_audit WHERE target_user_id IN ('${patientHeld}','${patientFree}');
    DELETE FROM patient_legal_holds WHERE patient_id IN ('${patientHeld}','${patientFree}');
    DELETE FROM caregiver_patients WHERE caregiver_id='${ids.caregiver}';
    DELETE FROM patients WHERE id IN ('${patientHeld}','${patientFree}');
  `);
  for (const id of [...Object.values(ids), patientHeld, patientFree]) await authDeleteUser(id);
});

describe('MMA-P1-FINAL-CLOSURE Priority 5 (migration 158) — legal hold blocks patient-media storage object deletion', () => {
  it('a Caregiver (genuinely non-admin) cannot delete a held patient\'s media object', async () => {
    await storageDelete(`patient-media/${objectHeldPath()}`, tok.caregiver);
    const stillThere = sql(`SELECT count(*) FROM storage.objects WHERE bucket_id='patient-media' AND name='${objectHeldPath()}';`);
    expect(stillThere).toBe('1');
  });

  it("an unrelated patient's object (no hold) is unaffected and can still be deleted normally", async () => {
    await storageDelete(`patient-media/${objectFreePath()}`, tok.caregiver);
    const gone = sql(`SELECT count(*) FROM storage.objects WHERE bucket_id='patient-media' AND name='${objectFreePath()}';`);
    expect(gone).toBe('0');
  });

  it('once the hold is released, the previously-protected object can be deleted', async () => {
    const [releaseStatus] = await rpc('release_patient_legal_hold', { p_hold_id: holdId }, tok.admin);
    expect(releaseStatus).toBe(200);

    await storageDelete(`patient-media/${objectHeldPath()}`, tok.caregiver);
    const gone = sql(`SELECT count(*) FROM storage.objects WHERE bucket_id='patient-media' AND name='${objectHeldPath()}';`);
    expect(gone).toBe('0');
  });
});
