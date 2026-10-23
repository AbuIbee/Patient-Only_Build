// Codex MMA-CODEX-10 — "false-zero-count bug" in get_org_communications_
// overview(). Reproduces the exact gap migration 099 closes: the
// function's original JOIN required every counted conversation to have
// a participant with an active staff_patient_assignments row. Migration
// 087 made 'director' a legal conversation participant whose authority
// comes from organization_memberships + covered_patient_memberships,
// not staff_patient_assignments — a director has no staff_patient_
// assignments row at all, so a conversation whose only org-scoped
// participant is the director (a perfectly real, properly-authorized
// conversation) was silently excluded from every count: "active
// conversations", "patients with conversations", both shown as zero
// even though a real conversation exists.
//
// Requires the local Docker Supabase stack. Run with
// `npm run test:integration`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql } from './_runtime';

const PW = 'CommsOverviewFix9!';
const stamp = Date.now();
const ORG = 'c0444444-4444-4444-8444-444444444444';

const emails = { director: `cou-director-${stamp}@local.test` };
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
let patientId: string;

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  const patientEmail = `cou-patient-${stamp}@local.test`;
  patientId = await authSignUp(patientEmail, PW);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}','${patientId}');
    DELETE FROM organizations WHERE id='${ORG}';
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES('${ORG}','COU Org','integrated_care','${ids.director}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${ORG}',20,20,9999,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${ORG}','${ids.director}','director','active');
    INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES('${patientId}','COU','Patient','COU Patient','1 COU Ave','COU Facility');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('${ORG}','${patientId}','active','${ids.director}');
    COMMIT;
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
}, 30000);

afterAll(async () => {
  sql(`DELETE FROM public.patients WHERE id='${patientId}'; DELETE FROM organizations WHERE id='${ORG}';`);
  for (const id of [...Object.values(ids), patientId]) await authDeleteUser(id);
});

describe('Codex MMA-CODEX-10 — get_org_communications_overview() no longer undercounts director-only conversations (migration 099)', () => {
  it('a conversation whose only org-scoped participant is the director (no staff_patient_assignments row exists for a director) is correctly counted, not shown as zero', async () => {
    // The director is a legal participant purely via is_org_director_for_
    // patient() (migration 087) — confirm no staff_patient_assignments
    // row exists for them, so this genuinely exercises the new path.
    const spaCount = sql(`SELECT count(*) FROM staff_patient_assignments WHERE user_id='${ids.director}' AND patient_id='${patientId}';`);
    expect(spaCount).toBe('0');

    const [createStatus, conv] = (await rpc('create_conversation', {
      p_patient_id: patientId, p_recipient_user_ids: [ids.director], p_subject: 'COU director-only conversation',
    }, tok.director)) as [number, { id: string }];
    expect(createStatus).toBe(200);

    const [status, body] = (await rpc('get_org_communications_overview', { p_org_id: ORG }, tok.director)) as [number, Array<{ active_conversations: number; patients_with_conversations: number }>];
    expect(status).toBe(200);
    expect(Number(body[0].active_conversations)).toBeGreaterThanOrEqual(1);
    expect(Number(body[0].patients_with_conversations)).toBeGreaterThanOrEqual(1);

    sql(`DELETE FROM conversation_participants WHERE conversation_id='${conv.id}'; DELETE FROM conversations WHERE id='${conv.id}';`);
  });
});
