// run_authorization_tests.cjs
//
// Staging-only. Executes, for real, the authorization test matrices that
// supabase/migrations/014_caregiver_relationship_authorization_and_view_
// hardening.sql and 020_admin_profile_access_and_security_hardening.sql
// already describe in their own "STAGING-ONLY AUTHORIZATION TESTS" sections
// as "described for the owner to run in an isolated environment; NOT
// executed by this migration file or by this engagement." This script is
// that execution — it does not invent new test cases, it runs the ones the
// project already designed and approved, against the real staging RLS
// policies and RPCs, using the five synthetic accounts provisioning_
// synthetic_accounts.cjs created.
//
// Every test signs in with the STAGING ANON KEY (never service role) as the
// relevant synthetic account and calls the exact same supabase-js client
// surface the real application uses — this is a test of the live RLS/RPC
// authorization boundary, not of application UI code (which the prior
// round's Playwright suite already covered for the flows that don't need a
// second/third account).
//
// Run with:
//   SUPABASE_URL=https://axurszlibxwwptkczztt.supabase.co \
//   SUPABASE_ANON_KEY=<staging anon key, same one in .env.staging.local> \
//   node run_authorization_tests.cjs
//
// Requires synthetic_accounts.json (written by provision_synthetic_accounts.cjs)
// in this same directory.

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !ANON_KEY) {
  console.error('SUPABASE_URL and SUPABASE_ANON_KEY must both be set.');
  process.exit(1);
}
if (!SUPABASE_URL.includes('axurszlibxwwptkczztt')) {
  console.error(`Refusing to run: SUPABASE_URL (${SUPABASE_URL}) is not the staging project.`);
  process.exit(1);
}

const accountsPath = path.join(__dirname, 'synthetic_accounts.json');
if (!fs.existsSync(accountsPath)) {
  console.error('synthetic_accounts.json not found — run provision_synthetic_accounts.cjs first.');
  process.exit(1);
}
const ACCTS = JSON.parse(fs.readFileSync(accountsPath, 'utf8'));

const results = [];
function record(id, description, pass, detail) {
  results.push({ id, description, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${id}: ${description}${detail ? ' — ' + JSON.stringify(detail) : ''}`);
}

async function sessionFor(acct) {
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: acct.email, password: acct.password });
  if (error) throw new Error(`signIn(${acct.email}) failed: ${error.message}`);
  return { client, userId: data.user.id };
}

(async () => {
  const p1 = await sessionFor(ACCTS.patient1);
  const p2 = await sessionFor(ACCTS.patient2);
  const p3 = await sessionFor(ACCTS.patient3Pending);
  const cg = await sessionFor(ACCTS.caregiver);
  const ad = await sessionFor(ACCTS.admin);

  // ============================================================
  // SECTION 1 — true two-account patient isolation (item 2)
  // ============================================================
  {
    const own = await p1.client.from('medications').select('id').eq('patient_id', p1.userId);
    record('ISO-1a', 'Patient 1 can read own medications (positive control)', (own.data?.length ?? 0) === 1 && !own.error, own);

    const cross = await p1.client.from('medications').select('id').eq('patient_id', p2.userId);
    record('ISO-1b', 'Patient 1 reading Patient 2 medications returns zero rows', (cross.data?.length ?? -1) === 0 && !cross.error, cross);

    const crossPatients = await p1.client.from('patients').select('id').eq('id', p2.userId);
    record('ISO-1c', 'Patient 1 reading Patient 2 patients row returns zero rows', (crossPatients.data?.length ?? -1) === 0 && !crossPatients.error, crossPatients);

    const reverseOwn = await p2.client.from('medications').select('id').eq('patient_id', p2.userId);
    record('ISO-2a', 'Patient 2 can read own medications (positive control)', (reverseOwn.data?.length ?? 0) === 1 && !reverseOwn.error, reverseOwn);

    const reverseCross = await p2.client.from('medications').select('id').eq('patient_id', p1.userId);
    record('ISO-2b', 'Patient 2 reading Patient 1 medications returns zero rows', (reverseCross.data?.length ?? -1) === 0 && !reverseCross.error, reverseCross);

    const crossUpdate = await p1.client.from('medications').update({ dosage: '999mg' }).eq('patient_id', p2.userId);
    const p2MedsAfter = await p2.client.from('medications').select('dosage').eq('patient_id', p2.userId);
    record('ISO-3', 'Patient 1 cannot modify Patient 2 medications (write-path isolation)',
      (p2MedsAfter.data?.[0]?.dosage ?? null) === '5mg', { attemptError: crossUpdate.error?.message, p2MedsAfter: p2MedsAfter.data });
  }

  // ============================================================
  // SECTION 2 — caregiver relationship authorization (014's T-matrix)
  // ============================================================
  const rpcArgs = (patientId) => ({
    p_patient_id: patientId,
    p_preferred_name: 'Staging RPC Test',
    p_date_of_birth: null, p_diagnosis_date: null, p_dementia_stage: null,
    p_location: null, p_address: null, p_affirmation: null,
    p_emergency_contact_name: null, p_emergency_contact_relationship: null,
    p_emergency_contact_phone: null, p_emergency_contact_email: null,
    p_relationship_type: 'primary',
  });

  {
    // T6 — unlinked caregiver role is refused.
    const t6 = await cg.client.rpc('create_patient_with_caregiver', rpcArgs(p3.userId));
    record('CG-T6', 'Unlinked caregiver role cannot call create_patient_with_caregiver (refused)',
      !!t6.error && /administrator/i.test(t6.error.message || ''), { error: t6.error?.message });

    // T6b — ordinary patient role is refused.
    const t6b = await p1.client.rpc('create_patient_with_caregiver', rpcArgs(p3.userId));
    record('CG-T6b', 'Patient role cannot call create_patient_with_caregiver (refused)',
      !!t6b.error && /administrator/i.test(t6b.error.message || ''), { error: t6b.error?.message });

    // T2b — admin cannot claim an already-COMPLETE existing patient by id alone.
    const t2b = await ad.client.rpc('create_patient_with_caregiver', rpcArgs(p1.userId));
    record('CG-T2b', 'Admin cannot silently claim an already-complete existing patient (Patient 1) by id alone',
      !!t2b.error && /pending provisioning/i.test(t2b.error.message || ''), { error: t2b.error?.message });

    // T7 — admin targeting a made-up id with no profile at all.
    const fakeId = '00000000-0000-4000-8000-000000000099';
    const t7 = await ad.client.rpc('create_patient_with_caregiver', rpcArgs(fakeId));
    record('CG-T7', 'Admin targeting a nonexistent profile id is refused',
      !!t7.error && /pending provisioning/i.test(t7.error.message || ''), { error: t7.error?.message });

    // T4 — the actual positive case: admin links the pending Patient 3.
    const t4 = await ad.client.rpc('create_patient_with_caregiver', rpcArgs(p3.userId));
    record('CG-T4', 'Admin successfully creates+links a genuinely pending patient (Patient 3)',
      !t4.error && !!t4.data, { error: t4.error?.message, data: t4.data });

    // T5 — idempotent retry by the same admin for the same patient.
    const t5 = await ad.client.rpc('create_patient_with_caregiver', rpcArgs(p3.userId));
    record('CG-T5', 'Idempotent retry of the same link returns successfully, no duplicate',
      !t5.error && !!t5.data, { error: t5.error?.message });

    const linkCount = await ad.client.from('caregiver_patients').select('id').eq('patient_id', p3.userId).eq('caregiver_id', ad.userId);
    record('CG-T5b', 'Exactly one caregiver_patients row exists for Patient 3 after the retry',
      (linkCount.data?.length ?? -1) === 1, linkCount);

    // T8 positive — admin, now linked to Patient 3, CAN read Patient 3's patients row.
    const canReadLinked = await ad.client.from('patients').select('id').eq('id', p3.userId);
    record('CG-T8pos', "Admin (now Patient 3's linked caregiver) can read Patient 3's patients row",
      (canReadLinked.data?.length ?? 0) === 1, canReadLinked);

    // T8 negative — admin, NOT linked to Patient 1, cannot read Patient 1's medications.
    const cannotReadUnlinked = await ad.client.from('medications').select('id').eq('patient_id', p1.userId);
    record('CG-T8neg', 'Admin (not linked to Patient 1) cannot read Patient 1 medications',
      (cannotReadUnlinked.data?.length ?? -1) === 0 && !cannotReadUnlinked.error, cannotReadUnlinked);

    // Direct-table-insert regression (T3): caregiver role attempting a raw insert.
    const t3 = await cg.client.from('caregiver_patients').insert({ caregiver_id: cg.userId, patient_id: p1.userId });
    record('CG-T3', 'Direct INSERT on caregiver_patients remains denied for client roles',
      !!t3.error, { error: t3.error?.message });
  }

  // ============================================================
  // SECTION 3 — administrator permissions (020's T-matrix) + admin_set_role (022)
  // ============================================================
  {
    // T1 — admin sees all profiles.
    const allProfiles = await ad.client.from('profiles').select('id');
    record('ADM-T1', 'Admin SELECT on profiles returns more than just their own row',
      (allProfiles.data?.length ?? 0) >= 4 && !allProfiles.error, { count: allProfiles.data?.length, error: allProfiles.error?.message });

    // T2 — non-admin sees only their own row.
    const ownOnly = await p1.client.from('profiles').select('id');
    record('ADM-T2', 'Non-admin SELECT on profiles returns only their own row',
      (ownOnly.data?.length ?? -1) === 1 && ownOnly.data[0].id === p1.userId, { count: ownOnly.data?.length });

    // T3 — admin updates another user's first_name.
    const updateOther = await ad.client.from('profiles').update({ first_name: 'RenamedByAdminTest' }).eq('id', p1.userId);
    const verifyRename = await ad.client.from('profiles').select('first_name').eq('id', p1.userId).single();
    record('ADM-T3', "Admin can update another user's first_name", verifyRename.data?.first_name === 'RenamedByAdminTest', { updateError: updateOther.error?.message, verifyRename: verifyRename.data });

    // T4 — admin cannot change role/email via raw UPDATE (column grants still revoked).
    const roleAttempt = await ad.client.from('profiles').update({ role: 'superadmin' }).eq('id', p1.userId);
    const verifyRoleUnchanged = await ad.client.from('profiles').select('role').eq('id', p1.userId).single();
    record('ADM-T4', "Admin's raw UPDATE cannot change another user's role column",
      verifyRoleUnchanged.data?.role === 'patient', { updateError: roleAttempt.error?.message, roleNow: verifyRoleUnchanged.data?.role });

    // T7 — non-admin DELETE on profiles, including own row, is denied.
    const selfDelete = await p1.client.from('profiles').delete().eq('id', p1.userId);
    const stillExists = await ad.client.from('profiles').select('id').eq('id', p1.userId);
    record('ADM-T7', 'Non-admin DELETE on profiles (including own row) is denied',
      (stillExists.data?.length ?? 0) === 1, { deleteError: selfDelete.error?.message });

    // admin_set_role (022) — positive, no-op role reassignment by admin.
    const setRoleOk = await ad.client.rpc('admin_set_role', { p_user_id: p1.userId, p_role: 'patient' });
    record('ROLE-T2', 'admin_set_role succeeds for an admin caller', !setRoleOk.error, { error: setRoleOk.error?.message });

    // admin_set_role — negative, non-admin caller.
    const setRoleDenied = await p1.client.rpc('admin_set_role', { p_user_id: p2.userId, p_role: 'patient' });
    record('ROLE-T-neg', 'admin_set_role is refused for a non-admin caller',
      !!setRoleDenied.error && /Only admins/i.test(setRoleDenied.error.message || ''), { error: setRoleDenied.error?.message });
  }

  // ============================================================
  // SECTION 4 — paid-feature entitlement boundary, trusted synthetic grant,
  // NO Stripe/checkout (item 3)
  // ============================================================
  {
    // Negative first: a patient cannot self-grant their own entitlement.
    const selfGrantDenied = await p1.client.rpc('admin_set_subscription', {
      p_user_id: p1.userId, p_tier: 'paid_tier', p_plan: 'daily_care', p_program: null,
      p_status: 'active', p_trial_started_at: null, p_trial_ends_at: null, p_promo_expires_at: null,
    });
    record('ENT-neg1', 'Non-admin cannot call admin_set_subscription on their own account',
      !!selfGrantDenied.error && /Only admins/i.test(selfGrantDenied.error.message || ''), { error: selfGrantDenied.error?.message });

    // Negative: a patient cannot write their own subscriptions row directly either.
    const directWrite = await p1.client.from('subscriptions').update({ tier: 'paid_tier' }).eq('user_id', p1.userId);
    record('ENT-neg2', 'Non-admin cannot write subscriptions directly (client grant revoked per migration 029)',
      !!directWrite.error, { error: directWrite.error?.message });

    // Positive: admin grants a trusted synthetic paid_tier/daily_care entitlement — no Stripe involved.
    const grant = await ad.client.rpc('admin_set_subscription', {
      p_user_id: p1.userId, p_tier: 'paid_tier', p_plan: 'daily_care', p_program: null,
      p_status: 'active', p_trial_started_at: null, p_trial_ends_at: null, p_promo_expires_at: null,
    });
    record('ENT-pos1', 'Admin can grant Patient 1 a trusted synthetic paid_tier/daily_care entitlement', !grant.error, { error: grant.error?.message });

    const verifyEntitlement = await p1.client.from('subscriptions').select('tier, plan, status').eq('user_id', p1.userId).single();
    record('ENT-pos2', "Patient 1's own subscriptions row reflects the admin-granted entitlement",
      verifyEntitlement.data?.tier === 'paid_tier' && verifyEntitlement.data?.plan === 'daily_care', verifyEntitlement.data);
  }

  const summary = {
    total: results.length,
    passed: results.filter(r => r.pass).length,
    failed: results.filter(r => !r.pass),
  };
  console.log('\n=== SUMMARY ===');
  console.log(`${summary.passed}/${summary.total} passed`);
  if (summary.failed.length) {
    console.log('FAILED:', summary.failed.map(f => f.id));
  }

  fs.writeFileSync(path.join(__dirname, 'authorization_test_results.json'), JSON.stringify(results, null, 2));
  console.log('Full results written to authorization_test_results.json');
})().catch((err) => {
  console.error('TEST RUN FAILED (infrastructure error, not a test result):', err.message);
  process.exit(1);
});
