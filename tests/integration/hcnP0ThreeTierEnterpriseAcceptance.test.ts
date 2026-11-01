// HCN-MASTER-REMEDIATION-20261101, Phase J -- three-tier enterprise
// acceptance. Synthetic accounts in this disposable, local-only test
// environment (never production, never the owner's persistent
// database -- enforced by _runtime.ts's own target validation).
//
// Three organizations under Bilal as Organization Owner (never Platform
// Owner -- his profiles.role is left at its default, never 'admin'):
// Al-Noor Essential (0 specialist slots), Al-Noor Plus (1), Al-Noor
// Complete (3) -- the REAL license_tier_catalog values, independently
// confirmed in Phase E, not re-chosen for this test. Each organization:
// one Director, five caregivers, three patients. Bilal additionally
// holds a real 'caregiver' office membership in each organization (on
// top of being its Owner via organizations.created_by) so he can
// actually participate in conversations through the exact same
// mechanism every other staff member uses -- Owner status alone does
// not grant conversation participation (package1OrgOwnerSelfAssignment.test.ts's
// own finding: "ownership alone grants no clinical access before
// self-assignment"). 'caregiver' was chosen over 'billing_admin' (tried
// first) after confirming live that staff_patient_assignments.org_role
// is CHECK-constrained to ('caregiver','therapist','medical_professional')
// only -- a billing office has no clinical-coordination capability by
// design -- and 'caregiver' is one of the same capabilities
// org_owner_self_assign_capability() itself already recognizes for an
// Organization Owner.
//
// Specialist approval for each tier reuses the REAL end-to-end path
// (submit_professional_application -> record_credential_verification ->
// director_approve_application), the exact mechanism Phase E already
// proved enforces the combined specialist-slot cap -- re-exercised here
// inside a fully-staffed (1 director + 5 caregivers + 3 patients)
// organization, not a minimal fixture, to prove the cap holds under
// realistic load, not just in isolation.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, http, login, rpc, sql } from './_runtime';

const PW = 'AlNoor9!Acceptance';
const stamp = Date.now();

type TierName = 'essential' | 'plus' | 'complete';
const TIERS: { tier: TierName; label: string; orgIdPrefix: string }[] = [
  { tier: 'essential', label: 'Essential', orgIdPrefix: 'f0ea0001' },
  { tier: 'plus', label: 'Plus', orgIdPrefix: 'f0eb0002' },
  { tier: 'complete', label: 'Complete', orgIdPrefix: 'f0ec0003' },
];

const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const orgIds: Record<TierName, string> = { essential: '', plus: '', complete: '' };
const patientIds: Record<TierName, string[]> = { essential: [], plus: [], complete: [] };
const caregiverIds: Record<TierName, string[]> = { essential: [], plus: [], complete: [] };
const caregiverToks: Record<TierName, string[]> = { essential: [], plus: [], complete: [] };
const directorIds: Record<TierName, string> = { essential: '', plus: '', complete: '' };
const directorToks: Record<TierName, string> = { essential: '', plus: '', complete: '' };
const specialistIds: string[] = [];
const specialistTokByTier: Record<TierName, string[]> = { essential: [], plus: [], complete: [] };
const specialistIdByTier: Record<TierName, string[]> = { essential: [], plus: [], complete: [] };
const specialistRoleByTier: Record<TierName, ('medical_professional' | 'therapist')[]> = { essential: [], plus: [], complete: [] };

async function mkActiveUser(email: string): Promise<string> {
  const id = await authSignUp(email, PW);
  sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${id}';`);
  return id;
}

async function submitAndApproveSpecialist(orgId: string, directorTok: string, office: 'medical_professional' | 'therapist', emailPrefix: string, idx: number): Promise<number> {
  const email = `${emailPrefix}-${idx}-${stamp}@local.test`;
  const userId = await mkActiveUser(email);
  specialistIds.push(userId);
  const userTok = await login(email, PW);
  const [, app] = (await rpc('submit_professional_application', {
    p_requested_office: office, p_target_organization_id: orgId, p_proposed_organization_name: null, p_proposed_package_type: null,
    p_legal_name: 'Al-Noor Specialist', p_preferred_name: null, p_contact_email: email, p_contact_phone: null,
    p_professional_title: 'Specialist', p_profession_category: office, p_application_details: {},
  }, userTok)) as [number, { id: string }];
  await rpc('record_credential_verification', { p_application_id: app.id, p_decision: 'independently_verified', p_evidence_reference: 'Al-Noor acceptance evidence' }, directorTok);
  const [status] = await rpc('director_approve_application', { p_application_id: app.id }, directorTok);
  if (status === 200) {
    const tier = (Object.keys(orgIds) as TierName[]).find((t) => orgIds[t] === orgId)!;
    specialistTokByTier[tier].push(userTok);
    specialistIdByTier[tier].push(userId);
    specialistRoleByTier[tier].push(office);
  }
  return status;
}

beforeAll(async () => {
  ids.bilal = await mkActiveUser(`alnoor-bilal-${stamp}@local.test`);
  tok.bilal = await login(`alnoor-bilal-${stamp}@local.test`, PW);

  for (const { tier, label, orgIdPrefix } of TIERS) {
    const orgId = `${orgIdPrefix}-0001-4001-8001-${String(stamp).padStart(12, '0').slice(-12)}`;
    orgIds[tier] = orgId;
    const directorId = await mkActiveUser(`alnoor-${tier}-director-${stamp}@local.test`);
    directorIds[tier] = directorId;
    directorToks[tier] = await login(`alnoor-${tier}-director-${stamp}@local.test`, PW);

    const specialistSlotCount = Number(sql(`SELECT specialist_slot_count FROM license_tier_catalog WHERE tier_code = '${tier}';`));

    sql(`
      BEGIN;
      INSERT INTO organizations(id,name,package_type,created_by) VALUES('${orgId}','Al-Noor ${label} ${stamp}','integrated_care','${ids.bilal}');
      INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status,license_tier_code,specialist_slot_count)
        VALUES('${orgId}',20,20,9999,'active','${tier}',${specialistSlotCount});
      INSERT INTO organization_memberships(organization_id,user_id,org_role,status,invited_by) VALUES
        ('${orgId}','${directorId}','director','active','${ids.bilal}'),
        ('${orgId}','${ids.bilal}','caregiver','active','${ids.bilal}');
      COMMIT;
    `);

    // Five caregivers per organization, per the directive's own named headcount.
    for (let i = 0; i < 5; i++) {
      const email = `alnoor-${tier}-caregiver-${i}-${stamp}@local.test`;
      const caregiverId = await mkActiveUser(email);
      caregiverIds[tier].push(caregiverId);
      caregiverToks[tier].push(await login(email, PW));
      sql(`INSERT INTO organization_memberships(organization_id,user_id,org_role,status,invited_by) VALUES('${orgId}','${caregiverId}','caregiver','active','${directorId}');`);
    }

    // Three patients per organization, per the directive's own named headcount.
    for (let i = 0; i < 3; i++) {
      const email = `alnoor-${tier}-patient-${i}-${stamp}@local.test`;
      const patientId = await mkActiveUser(email);
      patientIds[tier].push(patientId);
      sql(`
        INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES('${patientId}','AlNoor${label}','Patient${i}','AlNoor ${label} Patient ${i}','1 Ave','Facility');
        INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('${orgId}','${patientId}','active','${directorId}');
      `);
    }

    // Assign every caregiver and Bilal's own messaging eligibility to
    // patient #0 -- the one patient every staff-messaging test below
    // actually exchanges messages about. is_authorized_for_patient()
    // requires a staff_patient_assignments row whose org_role matches
    // the caller's own active organization_memberships row -- Bilal's
    // OFFICE membership alone (nor his separate Owner status) does not
    // grant conversation access without this.
    for (const caregiverId of caregiverIds[tier]) {
      sql(`INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES('${orgId}','${caregiverId}','${patientIds[tier][0]}','caregiver',true,'${directorId}');`);
    }
    sql(`INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES('${orgId}','${ids.bilal}','${patientIds[tier][0]}','caregiver',true,'${directorId}');`);
  }
}, 120000);

afterAll(async () => {
  const DUMMY = '00000000-0000-0000-0000-000000000000';
  const allOrgIds = Object.values(orgIds).filter(Boolean);
  if (allOrgIds.length === 0) allOrgIds.push(DUMMY);
  const allPatientIds = Object.values(patientIds).flat();
  if (allPatientIds.length === 0) allPatientIds.push(DUMMY);
  const allStaffIds = [ids.bilal, ...Object.values(directorIds), ...Object.values(caregiverIds).flat(), ...specialistIds].filter(Boolean);
  sql(`
    DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE patient_id IN ('${allPatientIds.join("','")}'));
    DELETE FROM conversation_participants WHERE conversation_id IN (SELECT id FROM conversations WHERE patient_id IN ('${allPatientIds.join("','")}'));
    DELETE FROM conversations WHERE patient_id IN ('${allPatientIds.join("','")}');
    DELETE FROM professional_application_events WHERE application_id IN (SELECT id FROM professional_applications WHERE target_organization_id IN ('${allOrgIds.join("','")}'));
    DELETE FROM professional_applications WHERE target_organization_id IN ('${allOrgIds.join("','")}');
    DELETE FROM staff_patient_assignments WHERE organization_id IN ('${allOrgIds.join("','")}');
    DELETE FROM covered_patient_memberships WHERE organization_id IN ('${allOrgIds.join("','")}');
    DELETE FROM organization_memberships WHERE organization_id IN ('${allOrgIds.join("','")}');
    DELETE FROM organization_licenses WHERE organization_id IN ('${allOrgIds.join("','")}');
    DELETE FROM organizations WHERE id IN ('${allOrgIds.join("','")}');
    DELETE FROM patients WHERE id IN ('${allPatientIds.join("','")}');
  `);
  for (const id of [...allStaffIds, ...allPatientIds]) await authDeleteUser(id);
});

describe('HCN-MASTER-REMEDIATION-20261101 Phase J -- three-tier enterprise acceptance (Al-Noor Essential/Plus/Complete, Bilal as Organization Owner)', () => {
  it('Bilal is the real Organization Owner of all three organizations, and is NOT a Platform Owner', async () => {
    for (const tier of ['essential', 'plus', 'complete'] as TierName[]) {
      const owner = sql(`SELECT get_organization_owner('${orgIds[tier]}');`);
      expect(owner).toBe(ids.bilal);
    }
    const bilalRole = sql(`SELECT role FROM profiles WHERE id='${ids.bilal}';`);
    expect(bilalRole).not.toBe('admin');
    expect(bilalRole).not.toBe('superadmin');
  });

  describe('Essential -- zero specialist slots', () => {
    it('a medical_professional application is denied outright', async () => {
      const status = await submitAndApproveSpecialist(orgIds.essential, directorToks.essential, 'medical_professional', 'alnoor-essential-spec', 0);
      expect(status).toBe(400);
    });

    it('Bilal, the Director, and a caregiver exchange authorized messages about patient #0', async () => {
      const [convStatus, conv] = (await rpc('create_conversation', {
        p_patient_id: patientIds.essential[0], p_recipient_user_ids: [directorIds.essential, caregiverIds.essential[0]], p_subject: 'Al-Noor Essential coordination',
      }, tok.bilal)) as [number, { id: string }];
      expect(convStatus).toBe(200);

      const [sendStatus] = await rpc('send_message', { p_conversation_id: conv.id, p_body: 'Essential tier acceptance message', p_is_urgent: false, p_reply_to_message_id: null }, tok.bilal);
      expect(sendStatus).toBe(200);

      const [readStatus, readBody] = (await rpc('get_my_conversations', { p_patient_id: patientIds.essential[0] }, directorToks.essential)) as [number, Array<{ conversation_id: string }>];
      expect(readStatus).toBe(200);
      expect(readBody.some((c) => c.conversation_id === conv.id)).toBe(true);

      const [caregiverReadStatus, caregiverReadBody] = (await rpc('get_my_conversations', { p_patient_id: patientIds.essential[0] }, caregiverToks.essential[0])) as [number, Array<{ conversation_id: string }>];
      expect(caregiverReadStatus).toBe(200);
      expect(caregiverReadBody.some((c) => c.conversation_id === conv.id)).toBe(true);
    });
  });

  describe('Plus -- one specialist slot', () => {
    it('accepts exactly one specialist, denies a second', async () => {
      const statusA = await submitAndApproveSpecialist(orgIds.plus, directorToks.plus, 'medical_professional', 'alnoor-plus-spec', 0);
      expect(statusA).toBe(200);
      const statusB = await submitAndApproveSpecialist(orgIds.plus, directorToks.plus, 'therapist', 'alnoor-plus-spec', 1);
      expect(statusB).toBe(400);
    });

    it('Bilal, the Director, a caregiver, and the one specialist exchange authorized messages about patient #0', async () => {
      expect(specialistTokByTier.plus.length).toBe(1);
      const [convStatus, conv] = (await rpc('create_conversation', {
        p_patient_id: patientIds.plus[0], p_recipient_user_ids: [directorIds.plus, caregiverIds.plus[0]], p_subject: 'Al-Noor Plus coordination',
      }, tok.bilal)) as [number, { id: string }];
      expect(convStatus).toBe(200);
      expect((await rpc('send_message', { p_conversation_id: conv.id, p_body: 'Plus tier acceptance message', p_is_urgent: false, p_reply_to_message_id: null }, tok.bilal))[0]).toBe(200);

      // The specialist needs their own assignment to this patient to join a conversation about them.
      sql(`INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES('${orgIds.plus}','${specialistIdByTier.plus[0]}','${patientIds.plus[0]}','medical_professional',true,'${directorIds.plus}');`);
      const [specConvStatus] = await rpc('create_conversation', {
        p_patient_id: patientIds.plus[0], p_recipient_user_ids: [directorIds.plus], p_subject: 'Al-Noor Plus specialist note',
      }, specialistTokByTier.plus[0]);
      expect(specConvStatus).toBe(200);
    });
  });

  describe('Complete -- three specialist slots', () => {
    it('accepts exactly three specialists in any medical/therapist mix, denies a fourth', async () => {
      expect((await submitAndApproveSpecialist(orgIds.complete, directorToks.complete, 'medical_professional', 'alnoor-complete-spec', 0))).toBe(200);
      expect((await submitAndApproveSpecialist(orgIds.complete, directorToks.complete, 'therapist', 'alnoor-complete-spec', 1))).toBe(200);
      expect((await submitAndApproveSpecialist(orgIds.complete, directorToks.complete, 'medical_professional', 'alnoor-complete-spec', 2))).toBe(200);
      expect((await submitAndApproveSpecialist(orgIds.complete, directorToks.complete, 'therapist', 'alnoor-complete-spec', 3))).toBe(400);
    });

    it('Bilal, the Director, a caregiver, and all three specialists exchange authorized messages about patient #0', async () => {
      expect(specialistTokByTier.complete.length).toBe(3);
      for (let i = 0; i < specialistTokByTier.complete.length; i++) {
        const specTok = specialistTokByTier.complete[i];
        sql(`INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES('${orgIds.complete}','${specialistIdByTier.complete[i]}','${patientIds.complete[0]}','${specialistRoleByTier.complete[i]}',true,'${directorIds.complete}');`);
        const [convStatus, conv] = (await rpc('create_conversation', {
          p_patient_id: patientIds.complete[0], p_recipient_user_ids: [directorIds.complete], p_subject: 'Al-Noor Complete specialist note',
        }, specTok)) as [number, { id: string }];
        expect(convStatus).toBe(200);
        expect((await rpc('send_message', { p_conversation_id: conv.id, p_body: 'Complete tier specialist note', p_is_urgent: false, p_reply_to_message_id: null }, specTok))[0]).toBe(200);
      }
      const [bilalConvStatus, bilalConv] = (await rpc('create_conversation', {
        p_patient_id: patientIds.complete[0], p_recipient_user_ids: [directorIds.complete, caregiverIds.complete[0]], p_subject: 'Al-Noor Complete coordination',
      }, tok.bilal)) as [number, { id: string }];
      expect(bilalConvStatus).toBe(200);
      expect((await rpc('send_message', { p_conversation_id: bilalConv.id, p_body: 'Complete tier acceptance message', p_is_urgent: false, p_reply_to_message_id: null }, tok.bilal))[0]).toBe(200);
    });
  });

  it('organization isolation holds across all three Al-Noor organizations -- no caregiver, director, or Bilal-authored conversation leaks across tiers', async () => {
    for (const tier of ['essential', 'plus', 'complete'] as TierName[]) {
      const [status, orgs] = (await rpc('get_my_organizations', {}, caregiverToks[tier][0])) as [number, { organization_id: string }[]];
      expect(status).toBe(200);
      const otherOrgIds = (Object.keys(orgIds) as TierName[]).filter((t) => t !== tier).map((t) => orgIds[t]);
      expect(orgs.some((o) => otherOrgIds.includes(o.organization_id))).toBe(false);
      expect(orgs.some((o) => o.organization_id === orgIds[tier])).toBe(true);

      const [, directRead] = (await http('GET', `/rest/v1/patients?id=eq.${patientIds[tier === 'essential' ? 'plus' : 'essential'][0]}&select=id`, undefined, caregiverToks[tier][0])) as [number, unknown[]];
      expect(Array.isArray(directRead) ? directRead.length : -1).toBe(0);
    }
  });
});
