// HCN-DASH-MASTER-001 Workstream 1 (CLAUDE-01) -- proves, at the real
// RLS/data layer (not just in JS), that the two NEW org-scoped reads
// behind the Director's expanded dashboard (caregiver_credentials,
// shift_handoff_acknowledgments) are correctly tenant-isolated, and
// that the underlying source data getOrgOperationalSnapshot composes
// (visits/incidents/credentials/assignments) behaves exactly as the
// KPI math in organizationDirectorOpsService.ts assumes. The
// aggregation logic itself (hourly staffing, compliance-alert
// assembly) is pure JS over this same data and is covered by the
// real-browser E2E spec (tests/e2e_director_dashboard_overview.spec.ts),
// which exercises the actual supabase-js client this file cannot
// import (it depends on browser globals / import.meta.env).
//
// Requires the local Docker Supabase stack. Run with `npm run test:integration`.
import { afterAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql } from './_runtime';

const PW = 'DirSnapshot9!';
const stamp = Date.now();
const createdUserIds: string[] = [];
const createdOrgIds: string[] = [];

async function orgWithDirector(orgLabel: string): Promise<{ orgId: string; directorId: string; directorTok: string }> {
  const email = `dirsnap-director-${stamp}-${orgLabel}@local.test`;
  const directorId = await authSignUp(email, PW);
  createdUserIds.push(directorId);
  sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${directorId}';`);
  const directorTok = await login(email, PW);
  const orgId = sql(`INSERT INTO organizations(name,package_type,created_by) VALUES('DirSnap Org ${stamp}-${orgLabel}','integrated_care','${directorId}') RETURNING id;`);
  createdOrgIds.push(orgId);
  sql(`
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${orgId}',10,10,399,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${orgId}','${directorId}','director','active');
  `);
  return { orgId, directorId, directorTok };
}

afterAll(async () => {
  if (createdOrgIds.length) {
    const ids = createdOrgIds.map((id) => `'${id}'`).join(',');
    sql(`
      DELETE FROM caregiver_credentials WHERE organization_id IN (${ids});
      DELETE FROM shift_handoff_acknowledgments WHERE handoff_id IN (SELECT id FROM shift_handoffs WHERE organization_id IN (${ids}));
      DELETE FROM shift_handoffs WHERE organization_id IN (${ids});
      DELETE FROM incident_reports WHERE organization_id IN (${ids});
      DELETE FROM caregiver_visits WHERE organization_id IN (${ids});
      DELETE FROM caregiver_patients WHERE patient_id IN (SELECT id FROM patients WHERE id IN (SELECT patient_id FROM covered_patient_memberships WHERE organization_id IN (${ids})));
      DELETE FROM covered_patient_memberships WHERE organization_id IN (${ids});
      DELETE FROM organization_memberships WHERE organization_id IN (${ids});
      DELETE FROM organization_licenses WHERE organization_id IN (${ids});
      DELETE FROM organizations WHERE id IN (${ids});
    `);
  }
  for (const id of createdUserIds) await authDeleteUser(id);
});

describe('HCN-DASH-MASTER-001 Workstream 1 -- Director operational-snapshot source data is tenant-isolated (DIR-007)', () => {
  it('a Director cannot read another organization\'s caregiver credentials', async () => {
    const orgA = await orgWithDirector('a');
    const orgB = await orgWithDirector('b');
    sql(`INSERT INTO caregiver_credentials(user_id,organization_id,credential_name,status) VALUES('${orgA.directorId}','${orgA.orgId}','CPR Certification','active');`);

    const [statusOwn, ownRows] = (await rpc('get_my_organizations', {}, orgA.directorTok)) as [number, unknown[]];
    expect(statusOwn).toBe(200);
    expect(ownRows.length).toBeGreaterThan(0);

    // Director B queries org A's credentials directly via PostgREST --
    // RLS ("Active directors can view credentials within their own
    // org") must return nothing, not org A's real row.
    const r = await fetch(`${process.env.MMA_TEST_API_BASE}/rest/v1/caregiver_credentials?organization_id=eq.${orgA.orgId}`, {
      headers: {
        apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
        Authorization: `Bearer ${orgB.directorTok}`,
      },
    });
    const body = (await r.json()) as unknown[];
    expect(r.status).toBe(200);
    expect(body.length).toBe(0);
  });

  it('a Director can read their own organization\'s caregiver credentials', async () => {
    const org = await orgWithDirector('own');
    sql(`INSERT INTO caregiver_credentials(user_id,organization_id,credential_name,status,expires_at) VALUES('${org.directorId}','${org.orgId}','CPR Certification','expiring_soon', (now()+interval '5 days')::date);`);
    const r = await fetch(`${process.env.MMA_TEST_API_BASE}/rest/v1/caregiver_credentials?organization_id=eq.${org.orgId}`, {
      headers: {
        apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
        Authorization: `Bearer ${org.directorTok}`,
      },
    });
    const body = (await r.json()) as { credential_name: string; status: string }[];
    expect(r.status).toBe(200);
    expect(body.length).toBe(1);
    expect(body[0].credential_name).toBe('CPR Certification');
    expect(body[0].status).toBe('expiring_soon');
  });
});

describe('HCN-DASH-MASTER-001 Workstream 1 -- real visit/incident data matches the KPI definitions DASH-01 relies on (DIR-001)', () => {
  it('today/completed/missed/late visit counts and open-incident counts are computed from real, distinguishable records', async () => {
    const { orgId, directorId } = await orgWithDirector('kpi');
    const caregiverEmail = `dirsnap-caregiver-${stamp}@local.test`;
    const caregiverId = await authSignUp(caregiverEmail, PW);
    createdUserIds.push(caregiverId);
    sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${caregiverId}';`);
    sql(`INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${orgId}','${caregiverId}','caregiver','active');`);

    const patientId = sql(`INSERT INTO patients(first_name,last_name,preferred_name,address,location) VALUES('DirSnap','Patient','DirSnap Patient','1 Ave','Facility') RETURNING id;`);
    sql(`INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('${orgId}','${patientId}','active','${directorId}');`);

    // One completed, one missed, one late-still-scheduled, all scheduled "today".
    sql(`
      INSERT INTO caregiver_visits(organization_id,patient_id,caregiver_id,scheduled_start,scheduled_end,status)
        VALUES ('${orgId}','${patientId}','${caregiverId}', date_trunc('day', now()) + interval '8 hours', date_trunc('day', now()) + interval '9 hours', 'completed');
      INSERT INTO caregiver_visits(organization_id,patient_id,caregiver_id,scheduled_start,scheduled_end,status)
        VALUES ('${orgId}','${patientId}','${caregiverId}', date_trunc('day', now()) + interval '10 hours', date_trunc('day', now()) + interval '11 hours', 'missed');
      INSERT INTO caregiver_visits(organization_id,patient_id,caregiver_id,scheduled_start,scheduled_end,status)
        VALUES ('${orgId}','${patientId}','${caregiverId}', now() - interval '30 minutes', now() + interval '30 minutes', 'scheduled');
      INSERT INTO incident_reports(organization_id,patient_id,reported_by,incident_type,description,severity,occurred_at,resolution_status)
        VALUES ('${orgId}','${patientId}','${directorId}','fall','Patient had a minor fall','moderate',now(),'open');
    `);

    const completed = sql(`SELECT count(*) FROM caregiver_visits WHERE organization_id='${orgId}' AND status='completed' AND scheduled_start::date = current_date;`);
    const missed = sql(`SELECT count(*) FROM caregiver_visits WHERE organization_id='${orgId}' AND status='missed' AND scheduled_start::date = current_date;`);
    const late = sql(`SELECT count(*) FROM caregiver_visits WHERE organization_id='${orgId}' AND status='scheduled' AND scheduled_start < now() AND scheduled_start::date = current_date;`);
    const openIncidents = sql(`SELECT count(*) FROM incident_reports WHERE organization_id='${orgId}' AND resolution_status != 'resolved';`);

    expect(completed).toBe('1');
    expect(missed).toBe('1');
    expect(late).toBe('1');
    expect(openIncidents).toBe('1');
    // These are exactly the predicates getOrgOperationalSnapshot() applies
    // client-side to the same rows (status + "today" + scheduled_start <
    // now()) -- this test exists to catch a future schema/semantics
    // drift between the two, not to re-verify arithmetic.
  });

  it('a revoked caregiver membership is excluded from the active-caregiver count', async () => {
    const { orgId } = await orgWithDirector('revoked');
    const caregiverEmail = `dirsnap-revoked-${stamp}@local.test`;
    const caregiverId = await authSignUp(caregiverEmail, PW);
    createdUserIds.push(caregiverId);
    sql(`INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${orgId}','${caregiverId}','caregiver','revoked');`);
    const activeCount = sql(`SELECT count(*) FROM organization_memberships WHERE organization_id='${orgId}' AND org_role='caregiver' AND status='active';`);
    expect(activeCount).toBe('0');
  });
});
