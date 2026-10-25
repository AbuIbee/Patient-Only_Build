// MMA-ENT-CAREGIVER-MASTER-004, D03 (P2) — independent runtime audit
// finding: "authenticated patient list has no search/filter/label
// control." Migration 137 adds a per-staff_patient_assignments
// display_label, mirroring the existing residential
// caregiver_patients.display_label pattern (migration 033) exactly.
//
// Requires the local Docker Supabase stack. Run with
// `npm run test:integration`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, http, login, sql } from './_runtime';

const PW = 'D03Label9!';
const stamp = Date.now();
const ORG_A = 'a1111111-0003-4003-8003-000000000003';
const ORG_B = 'b2222222-0003-4003-8003-000000000003';

const emails = {
  caregiverA: `d03-caregiverA-${stamp}@local.test`,
  caregiverB: `d03-caregiverB-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
let patientId: string;
let assignmentAId: string;
let assignmentBId: string;

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  const patientEmail = `d03-patient-${stamp}@local.test`;
  patientId = await authSignUp(patientEmail, PW);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}','${patientId}');
    DELETE FROM organizations WHERE id IN ('${ORG_A}','${ORG_B}');
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES
      ('${ORG_A}','D03 Org A','integrated_care','${ids.caregiverA}'),
      ('${ORG_B}','D03 Org B','integrated_care','${ids.caregiverB}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES
      ('${ORG_A}',20,20,9999,'active'),('${ORG_B}',20,20,9999,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES
      ('${ORG_A}','${ids.caregiverA}','caregiver','active'),
      ('${ORG_B}','${ids.caregiverA}','caregiver','active'),
      ('${ORG_B}','${ids.caregiverB}','caregiver','active');
    INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES('${patientId}','D03','Patient','D03 Patient','1 D03 Ave','D03 Facility');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES
      ('${ORG_A}','${patientId}','active','${ids.caregiverA}'),
      ('${ORG_B}','${patientId}','active','${ids.caregiverB}');
    -- caregiverA is assigned to the SAME patient under BOTH orgs (migration 094's own scenario) --
    -- two distinct assignment rows that must be independently labelable.
    INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES
      ('${ORG_A}','${ids.caregiverA}','${patientId}','caregiver',true,'${ids.caregiverA}'),
      ('${ORG_B}','${ids.caregiverA}','${patientId}','caregiver',true,'${ids.caregiverB}'),
      ('${ORG_B}','${ids.caregiverB}','${patientId}','caregiver',true,'${ids.caregiverB}');
    COMMIT;
  `);
  assignmentAId = sql(`SELECT id FROM staff_patient_assignments WHERE organization_id='${ORG_A}' AND user_id='${ids.caregiverA}' AND patient_id='${patientId}';`);
  assignmentBId = sql(`SELECT id FROM staff_patient_assignments WHERE organization_id='${ORG_B}' AND user_id='${ids.caregiverA}' AND patient_id='${patientId}';`);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
}, 30000);

afterAll(async () => {
  sql(`DELETE FROM public.patients WHERE id='${patientId}'; DELETE FROM organizations WHERE id IN ('${ORG_A}','${ORG_B}');`);
  for (const id of [...Object.values(ids), patientId]) await authDeleteUser(id);
});

describe('MMA-ENT-CAREGIVER-MASTER-004 D03 (P2) — per-assignment patient labels (migration 137)', () => {
  it('a caregiver can set their own label for one specific assignment, independent of a second assignment for the SAME patient under a different org', async () => {
    const [statusA] = await http('PATCH', `/rest/v1/staff_patient_assignments?id=eq.${assignmentAId}`, { display_label: 'Org A — Tuesdays' }, tok.caregiverA) as [number, unknown];
    expect(statusA).toBe(200);
    const [statusB] = await http('PATCH', `/rest/v1/staff_patient_assignments?id=eq.${assignmentBId}`, { display_label: 'Org B — weekends' }, tok.caregiverA) as [number, unknown];
    expect(statusB).toBe(200);

    expect(sql(`SELECT display_label FROM staff_patient_assignments WHERE id='${assignmentAId}';`)).toBe('Org A — Tuesdays');
    expect(sql(`SELECT display_label FROM staff_patient_assignments WHERE id='${assignmentBId}';`)).toBe('Org B — weekends');
  });

  it('a DIFFERENT staff member cannot set a label on an assignment that is not their own', async () => {
    const [status] = await http('PATCH', `/rest/v1/staff_patient_assignments?id=eq.${assignmentAId}`, { display_label: 'Hijacked label' }, tok.caregiverB) as [number, unknown[]];
    // RLS silently matches zero rows for an UPDATE outside the policy's USING clause -- 200 with an empty body, not an error.
    expect(status).toBe(200);
    expect(sql(`SELECT display_label FROM staff_patient_assignments WHERE id='${assignmentAId}';`)).toBe('Org A — Tuesdays');
  });

  it('the label update cannot be used to smuggle changes to org_role/is_active/patient_id/user_id on the same row', async () => {
    const [status, body] = await http('PATCH', `/rest/v1/staff_patient_assignments?id=eq.${assignmentAId}`, {
      display_label: 'Still mine', org_role: 'medical_professional', is_active: false,
    }, tok.caregiverA) as [number, { org_role?: string; is_active?: boolean; message?: string }[] | { message?: string }];
    // PostgREST rejects the whole UPDATE outright because the column
    // GRANT (migration 137) covers only display_label/updated_at --
    // org_role/is_active are not among the authenticated role's granted
    // columns for UPDATE at all.
    expect(status).toBeGreaterThanOrEqual(400);
    expect(sql(`SELECT org_role, is_active FROM staff_patient_assignments WHERE id='${assignmentAId}';`)).toBe('caregiver|t');
    void body;
  });

  it('clearing a label (empty string -> null) via the service contract works through get_my_staff_patients()', async () => {
    const [status] = await http('PATCH', `/rest/v1/staff_patient_assignments?id=eq.${assignmentAId}`, { display_label: null }, tok.caregiverA) as [number, unknown];
    expect(status).toBe(200);
    const [rpcStatus, rows] = await http('POST', '/rest/v1/rpc/get_my_staff_patients', {}, tok.caregiverA) as [number, { assignment_id: string; display_label: string | null }[]];
    expect(rpcStatus).toBe(200);
    const row = rows.find((r) => r.assignment_id === assignmentAId);
    expect(row?.display_label).toBeNull();
  });
});
