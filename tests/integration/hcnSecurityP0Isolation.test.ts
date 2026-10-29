// HCN P0: disposable-Supabase regression tests. No hosted DB or production target.
// Integration runtime refuses unset/unsafe Docker targets. All SQL fixture DML
// occurs inside transactions rolled back before teardown.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql } from './_runtime';

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

  it('client roles have no TRUNCATE, TRIGGER or REFERENCES rights on public tables', () => {
    const count = sql(`
      SELECT count(*) FROM pg_tables WHERE schemaname='public' AND (
      has_table_privilege('anon',format('%I.%I',schemaname,tablename),'TRUNCATE') OR
      has_table_privilege('authenticated',format('%I.%I',schemaname,tablename),'TRUNCATE') OR
      has_table_privilege('anon',format('%I.%I',schemaname,tablename),'TRIGGER') OR
      has_table_privilege('authenticated',format('%I.%I',schemaname,tablename),'TRIGGER') OR
      has_table_privilege('anon',format('%I.%I',schemaname,tablename),'REFERENCES') OR
      has_table_privilege('authenticated',format('%I.%I',schemaname,tablename),'REFERENCES'));`);
    expect(count).toBe('0');
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
