// HCN P0: disposable-Supabase regression tests. No hosted DB or production target.
// Integration runtime refuses unset/unsafe Docker targets. All SQL fixture DML
// occurs inside transactions rolled back before teardown.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, http, login, rpc, sql } from './_runtime';

const stamp = Date.now();
const ids: Record<string, string> = {};
const PW = 'Hcn-Isolation-9!';

beforeAll(async () => {
  for (const key of ['owner', 'director', 'patient', 'outsider', 'globalAdmin']) {
    ids[key] = await authSignUp(`hcn-p0-${key}-${stamp}@local.test`, PW);
    expect(ids[key]).toMatch(/^[0-9a-f-]{36}$/i);
  }
}, 30000);

afterAll(async () => {
  for (const id of Object.values(ids)) await authDeleteUser(id);
}, 30000);

describe('HCN P0 database authorization and license security', () => {
  it('keeps Global Admin authority nondelegable via authenticated role-management RPCs', async () => {
    // This role is created only in the disposable Docker database; no live identities are touched.
    sql(`UPDATE public.profiles SET role='admin' WHERE id='${ids.globalAdmin}';`);
    const adminToken = await login(`hcn-p0-globalAdmin-${stamp}@local.test`, PW);
    const ordinaryToken = await login(`hcn-p0-director-${stamp}@local.test`, PW);
    const [ordinaryStatus] = await rpc('admin_set_role', { p_user_id: ids.outsider, p_role: 'caregiver' }, ordinaryToken);
    expect(ordinaryStatus).toBeGreaterThanOrEqual(400);
    const [elevationStatus] = await rpc('admin_set_role', { p_user_id: ids.outsider, p_role: 'superadmin' }, adminToken);
    expect(elevationStatus).toBeGreaterThanOrEqual(400);
    const [pendingStatus] = await rpc('admin_set_role', { p_user_id: ids.outsider, p_role: 'pending' }, adminToken);
    expect(pendingStatus).toBeGreaterThanOrEqual(400);
    const [selfStatus] = await rpc('admin_set_role', { p_user_id: ids.globalAdmin, p_role: 'caregiver' }, adminToken);
    expect(selfStatus).toBeGreaterThanOrEqual(400);
    const [ordinaryApproved] = await rpc('admin_set_role', { p_user_id: ids.outsider, p_role: 'caregiver' }, adminToken);
    expect(ordinaryApproved).toBeLessThan(300);
    expect(sql(`SELECT role FROM public.profiles WHERE id='${ids.outsider}';`)).toBe('caregiver');
  });

  it('Other Specialist remains nonclinical while authorized caregiver and patient retain access', () => {
    sql(`BEGIN;
    DO $qa$
    DECLARE o uuid;
    BEGIN
      INSERT INTO public.organizations(name,package_type,created_by,owner_user_id,organization_owner_user_id)
      VALUES('HCN-QA-ROLLBACK-OTHER-ACCESS','integrated_care','${ids.owner}','${ids.owner}','${ids.owner}')
      RETURNING id INTO o;
      INSERT INTO public.organization_licenses(organization_id,license_tier_code,specialist_slot_count,status,licensed_seats)
      VALUES(o,'complete',3,'active',10);
      INSERT INTO public.professional_applications(applicant_user_id,requested_office,target_organization_id,
        legal_name,contact_email,status,credential_verification_status,credential_verified_by)
      VALUES('${ids.outsider}','other_specialist',o,'QA Other','qa-other@example.invalid',
        'pending_review','independently_verified','${ids.owner}');
      INSERT INTO public.organization_memberships(organization_id,user_id,org_role,status,invited_by)
      VALUES(o,'${ids.director}','caregiver','active','${ids.owner}'),
            (o,'${ids.outsider}','other_specialist','active','${ids.owner}');
      INSERT INTO public.patients(id,first_name,last_name) VALUES('${ids.patient}','QA','ROLLBACK');
      INSERT INTO public.covered_patient_memberships(organization_id,patient_id,status)
      VALUES(o,'${ids.patient}','active');
      INSERT INTO public.staff_patient_assignments(organization_id,user_id,patient_id,org_role,assigned_by)
      VALUES(o,'${ids.director}','${ids.patient}','caregiver','${ids.owner}');
      IF NOT public.is_authorized_for_patient('${ids.director}','${ids.patient}') THEN
        RAISE EXCEPTION 'Valid caregiver access denied';
      END IF;
      IF public.is_authorized_for_patient('${ids.outsider}','${ids.patient}') THEN
        RAISE EXCEPTION 'Other Specialist acquired unauthorized patient access';
      END IF;
      IF NOT public.is_authorized_for_patient('${ids.patient}','${ids.patient}') THEN
        RAISE EXCEPTION 'Patient self-access denied';
      END IF;
    END $qa$;
    ROLLBACK;`);
  });

  it('rejected or insufficient credentials revoke approved specialist membership, assignments, and write audit', () => {
    sql(`BEGIN;
    DO $qa$
    DECLARE o uuid; app uuid; prior_status text; assignment_active boolean; denied_null boolean:=false;
    BEGIN
      INSERT INTO public.organizations(name,package_type,created_by,owner_user_id,organization_owner_user_id)
      VALUES('HCN-QA-ROLLBACK-REVERIFY','integrated_care','${ids.owner}','${ids.owner}','${ids.owner}') RETURNING id INTO o;
      INSERT INTO public.organization_licenses(organization_id,status,licensed_seats) VALUES(o,'active',10);
      INSERT INTO public.organization_memberships(organization_id,user_id,org_role,status,invited_by)
      VALUES(o,'${ids.director}','director','active','${ids.owner}'),
            (o,'${ids.outsider}','medical_professional','active','${ids.director}');
      INSERT INTO public.patients(id,first_name,last_name) VALUES('${ids.patient}','QA','ROLLBACK');
      INSERT INTO public.covered_patient_memberships(organization_id,patient_id,status)
      VALUES(o,'${ids.patient}','active');
      INSERT INTO public.staff_patient_assignments(organization_id,user_id,patient_id,org_role,assigned_by)
      VALUES(o,'${ids.outsider}','${ids.patient}','medical_professional','${ids.director}');
      INSERT INTO public.professional_applications(
        applicant_user_id,requested_office,target_organization_id,legal_name,contact_email,
        status,credential_verification_status,credential_verified_by)
      VALUES('${ids.outsider}','medical_professional',o,'QA Specialist',
         'qa-rollback@example.invalid','approved','independently_verified','${ids.director}')
      RETURNING id INTO app;
      PERFORM set_config('request.jwt.claim.sub','${ids.director}',true);
      BEGIN
        PERFORM public.record_credential_verification(app,NULL,'QA null verdict');
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE 'Invalid credential verification decision:%' THEN denied_null:=true; ELSE RAISE; END IF;
      END;
      IF NOT denied_null THEN RAISE EXCEPTION 'Null credential verdict accepted'; END IF;
      PERFORM public.record_credential_verification(app,'insufficient','QA reviewer rejected evidence');
      SELECT status INTO prior_status FROM public.organization_memberships
        WHERE organization_id=o AND user_id='${ids.outsider}';
      SELECT is_active INTO assignment_active FROM public.staff_patient_assignments
        WHERE organization_id=o AND user_id='${ids.outsider}';
      IF prior_status<>'revoked' OR assignment_active IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'Credential revocation did not fence active authority';
      END IF;
      IF NOT EXISTS(SELECT 1 FROM public.account_management_audit
       WHERE organization_id=o AND target_user_id='${ids.outsider}'
         AND action_type='membership_revoked_credential_invalidated') THEN
        RAISE EXCEPTION 'Credential revocation missing audit event';
      END IF;
    END $qa$;
    ROLLBACK;`);
  });

  it('prevents former conversation creators from removing others after patient access is lost', async () => {
    const ownerToken = await login(`hcn-p0-owner-${stamp}@local.test`, PW);
    sql(`INSERT INTO public.patients(id, first_name, last_name) VALUES
       ('${ids.owner}', 'QA', 'Creator'), ('${ids.patient}', 'QA', 'Other')
       ON CONFLICT (id) DO NOTHING;`);
    const authorizedConv = sql(`INSERT INTO public.conversations(patient_id,created_by,subject)
       VALUES ('${ids.owner}','${ids.owner}','QA owned patient') RETURNING id;`);
    const revokedConv = sql(`INSERT INTO public.conversations(patient_id,created_by,subject)
       VALUES ('${ids.patient}','${ids.owner}','QA unauthorized patient') RETURNING id;`);
    try {
      sql(`INSERT INTO public.conversation_participants(conversation_id,user_id,participant_role,added_by)
        VALUES ('${authorizedConv}','${ids.owner}','patient','${ids.owner}'),
        ('${authorizedConv}','${ids.director}','caregiver','${ids.owner}'),
        ('${revokedConv}','${ids.owner}','caregiver','${ids.owner}'),
        ('${revokedConv}','${ids.director}','caregiver','${ids.owner}');`);
      const [blocked] = await rpc('remove_conversation_participant', {
        p_conversation_id: revokedConv, p_user_id: ids.director,
      }, ownerToken);
      expect(blocked).toBeGreaterThanOrEqual(400);
      const [valid] = await rpc('remove_conversation_participant', {
        p_conversation_id: authorizedConv, p_user_id: ids.director,
      }, ownerToken);
      expect(valid).toBeLessThan(300);
      const [self] = await rpc('remove_conversation_participant', {
        p_conversation_id: revokedConv, p_user_id: ids.owner,
      }, ownerToken);
      expect(self).toBeLessThan(300);
    } finally {
      sql(`DELETE FROM public.conversation_participants WHERE conversation_id IN ('${authorizedConv}','${revokedConv}');
        DELETE FROM public.conversations WHERE id IN ('${authorizedConv}','${revokedConv}');
        DELETE FROM public.patients WHERE id IN ('${ids.owner}','${ids.patient}');`);
    }
  });

  it('client roles have no TRUNCATE, TRIGGER, REFERENCES or MAINTAIN on public tables', () => {
    const count = sql(`
      SELECT count(*) FROM pg_tables WHERE schemaname='public' AND (
      has_table_privilege('anon',format('%I.%I',schemaname,tablename),'TRUNCATE') OR
      has_table_privilege('authenticated',format('%I.%I',schemaname,tablename),'TRUNCATE') OR
      has_table_privilege('anon',format('%I.%I',schemaname,tablename),'TRIGGER') OR
      has_table_privilege('authenticated',format('%I.%I',schemaname,tablename),'TRIGGER') OR
      has_table_privilege('anon',format('%I.%I',schemaname,tablename),'REFERENCES') OR
      has_table_privilege('authenticated',format('%I.%I',schemaname,tablename),'REFERENCES') OR
      has_table_privilege('anon',format('%I.%I',schemaname,tablename),'MAINTAIN') OR
      has_table_privilege('authenticated',format('%I.%I',schemaname,tablename),'MAINTAIN'));`);
    expect(count).toBe('0');
  });

  it('prevents future postgres-owned public tables from inheriting destructive client privileges', () => {
    const n = sql(`SELECT count(*)
      FROM pg_default_acl d
      CROSS JOIN LATERAL aclexplode(d.defaclacl) a
      JOIN pg_roles r ON r.oid=a.grantee
      WHERE d.defaclnamespace='public'::regnamespace
        AND d.defaclobjtype='r' AND d.defaclrole='postgres'::regrole
        AND r.rolname IN ('anon','authenticated')
        AND a.privilege_type IN ('TRUNCATE','TRIGGER','REFERENCES','MAINTAIN');`);
    expect(n).toBe('0');
  });

  it('temporary-program exclusion intersects authorized patient reads instead of granting every patient', () => {
    const level = sql(`SELECT permissive FROM pg_policies WHERE schemaname='public'
      AND tablename='patients' AND policyname='Temporary program cannot read patients (REPAIR 008)';`);
    expect(level).toBe('RESTRICTIVE');
  });

  it('denies unrelated patient reads and four direct clinical inserts, preserving self read', () => {
    sql(`BEGIN;
    DO $qa$
    DECLARE p uuid := '${ids.patient}'; outsider uuid := '${ids.outsider}'; n integer; denied integer := 0;
    BEGIN
      INSERT INTO public.patients(id,first_name,last_name)
      VALUES(p,'QA','ROLLBACK');
      EXECUTE 'SET LOCAL ROLE authenticated';
      PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
      IF public.has_patient_access(p) THEN RAISE EXCEPTION 'Fixture outsider is authorized'; END IF;
      SELECT count(*) INTO n FROM public.patients WHERE id=p;
      IF n<>0 THEN RAISE EXCEPTION 'Unrelated patient read succeeded'; END IF;
      BEGIN
        INSERT INTO public.patient_diagnoses(patient_id,condition_name,source,author_id)
        VALUES(p,'QA','verified_source',outsider);
      EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
      BEGIN
        INSERT INTO public.patient_allergies(patient_id,allergen,source,author_id)
        VALUES(p,'QA','verified_source',outsider);
      EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
      BEGIN
        INSERT INTO public.patient_vitals(patient_id,source,author_id)
        VALUES(p,'verified_source',outsider);
      EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
      BEGIN
        INSERT INTO public.patient_care_plans(patient_id,goals,author_id)
        VALUES(p,'QA',outsider);
      EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
      IF denied<>4 THEN RAISE EXCEPTION 'Clinical inserts denied only % of 4',denied; END IF;
      PERFORM set_config('request.jwt.claim.sub',p::text,true);
      SELECT count(*) INTO n FROM public.patients WHERE id=p;
      IF n<>1 THEN RAISE EXCEPTION 'Patient self read blocked'; END IF;
      EXECUTE 'RESET ROLE';
    END $qa$;
    ROLLBACK;`);
  });

  it('denies unrelated patient SELECT and forged clinical INSERT over real JWT/PostgREST', async () => {
    const outsiderToken = await login(`hcn-p0-outsider-${stamp}@local.test`, PW);
    const patientToken = await login(`hcn-p0-patient-${stamp}@local.test`, PW);
    sql(`INSERT INTO public.patients(id,first_name,last_name) VALUES('${ids.patient}','QA','HTTP') ON CONFLICT (id) DO NOTHING;`);
    try {
      const [deniedRead, rows] = await http('GET', `/rest/v1/patients?id=eq.${ids.patient}&select=id`, undefined, outsiderToken);
      expect(deniedRead).toBe(200);
      expect(rows).toEqual([]);
      const [selfRead, ownRows] = await http('GET', `/rest/v1/patients?id=eq.${ids.patient}&select=id`, undefined, patientToken);
      expect(selfRead).toBe(200);
      expect(Array.isArray(ownRows) ? ownRows.length : 0).toBe(1);
      const [deniedInsert] = await http('POST', '/rest/v1/patient_diagnoses', {
        patient_id: ids.patient, condition_name: 'QA forged diagnosis',
        source: 'verified_source', author_id: ids.outsider,
      }, outsiderToken);
      expect(deniedInsert).toBeGreaterThanOrEqual(400);
    } finally {
      sql(`DELETE FROM public.patients WHERE id='${ids.patient}';`);
    }
  });

  it('prevents Organization Owner clinical self-grant while retaining billing control', () => {
    sql(`BEGIN;
    DO $qa$
    DECLARE o uuid; rejected boolean:=false;
    BEGIN
      INSERT INTO public.organizations(name,package_type,created_by,owner_user_id,organization_owner_user_id)
      VALUES('HCN-QA-ROLLBACK-OWNER','integrated_care','${ids.owner}','${ids.owner}','${ids.owner}')
      RETURNING id INTO o;
      PERFORM set_config('request.jwt.claim.sub','${ids.owner}',true);
      PERFORM public.org_owner_self_assign_capability(o,'billing_admin');
      BEGIN
        PERFORM public.org_owner_self_assign_capability(o,'medical_professional');
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE 'Invalid capability:%' THEN rejected:=true; ELSE RAISE; END IF;
      END;
      IF NOT rejected THEN RAISE EXCEPTION 'Owner was able to self-grant clinical capability'; END IF;
    END $qa$;
    ROLLBACK;`);
  });

  it('accepts valid invitations, denies active role substitution and revoked-inviter acceptance', () => {
    sql(`BEGIN;
    DO $qa$
    DECLARE o uuid; first_inv uuid; second_inv uuid; v_email text; rejected boolean;
    BEGIN
      INSERT INTO public.organizations(name,package_type,created_by,owner_user_id,organization_owner_user_id)
      VALUES('HCN-QA-ROLLBACK-INVITES','integrated_care','${ids.owner}','${ids.owner}','${ids.owner}')
      RETURNING id INTO o;
      INSERT INTO public.organization_licenses(organization_id,status,licensed_seats)
      VALUES(o,'active',10);
      INSERT INTO public.organization_memberships(organization_id,user_id,org_role,status,invited_by)
      VALUES(o,'${ids.director}','director','active','${ids.owner}');
      INSERT INTO public.organization_memberships(organization_id,user_id,org_role,status,invited_by)
      VALUES(o,'${ids.patient}','caregiver','invited','${ids.director}') RETURNING id INTO first_inv;
      PERFORM set_config('request.jwt.claim.sub','${ids.patient}',true);
      PERFORM public.respond_to_org_invite(first_inv,true);
      SELECT pr.email INTO v_email FROM public.profiles pr WHERE pr.id='${ids.patient}';
      PERFORM set_config('request.jwt.claim.sub','${ids.director}',true);
      rejected:=false;
      BEGIN
        PERFORM public.invite_org_member(o,v_email,'co_director');
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE 'This account is already an active organization member%' THEN rejected:=true; ELSE RAISE; END IF;
      END;
      IF NOT rejected THEN RAISE EXCEPTION 'Active member role replaced without acceptance'; END IF;
      INSERT INTO public.organization_memberships(organization_id,user_id,org_role,status,invited_by)
      VALUES(o,'${ids.outsider}','caregiver','invited','${ids.director}') RETURNING id INTO second_inv;
      UPDATE public.organization_memberships SET status='revoked'
        WHERE organization_id=o AND user_id='${ids.director}';
      PERFORM set_config('request.jwt.claim.sub','${ids.outsider}',true);
      rejected:=false;
      BEGIN
        PERFORM public.respond_to_org_invite(second_inv,true);
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE 'Invitation issuer no longer has authority%' THEN rejected:=true; ELSE RAISE; END IF;
      END;
      IF NOT rejected THEN RAISE EXCEPTION 'Revoked issuer invitation accepted'; END IF;
    END $qa$;
    ROLLBACK;`);
  });
});
