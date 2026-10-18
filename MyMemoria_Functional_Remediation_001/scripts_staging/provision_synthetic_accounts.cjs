// provision_synthetic_accounts.cjs
//
// Staging-only. Creates five CONFIRMED synthetic accounts directly via the
// Supabase Auth Admin API (service-role), bypassing GoTrue's own email-send
// path entirely (email_confirm: true at creation time). This is the fix for
// the `429 over_email_send_rate_limit` that blocked true two-account testing
// in the prior round: the public signup form always sends a real email
// through Supabase's shared, rate-limited default mail service, regardless
// of who initiates it; the Admin API does not send any email at all.
//
// Requires a SERVICE ROLE key — never the anon/publishable key used by the
// app itself. This script is not run by the app and must never be committed
// with real credentials. Run it with:
//
//   SUPABASE_URL=https://axurszlibxwwptkczztt.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<staging service_role key> \
//   node provision_synthetic_accounts.cjs
//
// Writes the created identities (emails/passwords/ids) to
// synthetic_accounts.json in this directory for the test/cleanup scripts to
// consume. That file is itself staging-only test data — delete it as part
// of cleanup, same as every other _tmp_/synthetic artifact this engagement
// has used.
//
// Account model (confirmed from supabase/migrations/001, 002, 014, 020,
// 022 — not guessed):
//   - handle_new_user() only ever assigns role 'patient' or 'caregiver' from
//     signup metadata (anything else defaults to 'patient'); there is no
//     signup-time path to role='admin' at all, by design (022's own header:
//     "the only way to become admin is an EXISTING admin calling
//     admin_set_role(), or, for the very first admin, direct DB
//     administration"). So "Administrator" below is created the same way as
//     any other account and then promoted with a direct service-role UPDATE
//     — this is the documented bootstrap path, not a workaround, and
//     satisfies "do not create an administrator through public signup"
//     (the public signup FORM is never used for it at all).
//   - "Caregiver" is created with role='caregiver' and is deliberately left
//     WITHOUT any caregiver_patients link. Per 014's own documented
//     architecture, ordinary (non-admin) caregiver self-service linking to
//     a patient has no verifiable trusted-authorization mechanism and is
//     refused by create_patient_with_caregiver()'s own role gate — so this
//     account's purpose in the test suite is specifically the NEGATIVE
//     permission tests (T6/T6b in 014, confirming that gate holds), not a
//     positive linked-caregiver case. The positive "admin becomes a
//     patient's linked caregiver via the one trusted RPC" case is covered
//     by the Administrator account instead, which is how this application's
//     real admin-provisions-a-patient flow (patientService.ts createPatient)
//     actually works today.
//   - Patient 1 and Patient 2 each get a minimal `patients` row and one
//     synthetic medication row created directly via service role (bypassing
//     RLS intentionally, since service role is trusted infrastructure, not
//     a client). This is NOT re-testing "can a patient self-create their
//     own patients row through the UI" — that already passed for the prior
//     round's Patient A and is not repeated here. It exists purely so both
//     sides of the cross-account isolation test have real, attributable
//     data to target.

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set in the environment.');
  console.error('Never hardcode the service role key in this file or commit it anywhere.');
  process.exit(1);
}
if (!SUPABASE_URL.includes('axurszlibxwwptkczztt')) {
  console.error(`Refusing to run: SUPABASE_URL (${SUPABASE_URL}) does not match the staging project axurszlibxwwptkczztt. This script must never be pointed at production.`);
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SUFFIX = String(Date.now()).slice(-7);

// NOTE: the previous round's "Patient A" has already been fully removed
// from staging (confirmed by the user — ChatGPT independently deleted it
// and verified zero remaining staging users/records). It no longer exists
// to pair with for isolation testing, so this round provisions TWO fresh,
// independent patient identities (patient1/patient2) rather than reusing
// the "Patient B" name against a Patient A that is gone.
const ACCOUNTS = {
  patient1: {
    email: `stg-pat1-${SUFFIX}@mailinator.com`,
    password: `StagingTest123!1${SUFFIX}`,
    firstName: 'StagingTestOne',
    lastName: 'Patient',
    role: 'patient',
  },
  patient2: {
    email: `stg-pat2-${SUFFIX}@mailinator.com`,
    password: `StagingTest123!2${SUFFIX}`,
    firstName: 'StagingTestTwo',
    lastName: 'Patient',
    role: 'patient',
  },
  // Kept bare (profile_created, no patients row) for the Administrator's
  // positive create_patient_with_caregiver() link test (014's T4) — must be
  // a real, not-yet-finished patient identity, distinct from patient1/
  // patient2, which stay fully provisioned throughout for the isolation
  // tests.
  patient3Pending: {
    email: `stg-pat3-${SUFFIX}@mailinator.com`,
    password: `StagingTest123!3${SUFFIX}`,
    firstName: 'StagingTestThree',
    lastName: 'PendingLink',
    role: 'patient',
  },
  caregiver: {
    email: `stg-care-${SUFFIX}@mailinator.com`,
    password: `StagingTest123!C${SUFFIX}`,
    firstName: 'StagingTestCaregiver',
    lastName: 'NoLink',
    role: 'caregiver',
  },
  admin: {
    email: `stg-admin-${SUFFIX}@mailinator.com`,
    password: `StagingTest123!D${SUFFIX}`,
    firstName: 'StagingTestAdmin',
    lastName: 'Account',
    // Deliberately NOT 'admin' here — handle_new_user() would silently
    // downgrade an unrecognized/forbidden metadata role to 'patient' anyway
    // (002/020's CASE expression only accepts 'patient'/'caregiver'). Role
    // is promoted to 'admin' below via a direct, service-role UPDATE —
    // never through signup metadata, matching "do not create an
    // administrator through public signup."
    role: 'patient',
  },
};

async function createConfirmedUser(acct) {
  const { data, error } = await admin.auth.admin.createUser({
    email: acct.email,
    password: acct.password,
    email_confirm: true, // skips GoTrue's email send entirely — avoids the rate limit
    user_metadata: {
      first_name: acct.firstName,
      last_name: acct.lastName,
      role: acct.role,
    },
  });
  if (error) throw new Error(`createUser(${acct.email}) failed: ${error.message}`);
  return data.user;
}

(async () => {
  const result = {};

  console.log('Creating Patient 1...');
  const patient1User = await createConfirmedUser(ACCOUNTS.patient1);
  result.patient1 = { ...ACCOUNTS.patient1, id: patient1User.id };
  console.log('  id:', patient1User.id);

  console.log('Creating Patient 2...');
  const patient2User = await createConfirmedUser(ACCOUNTS.patient2);
  result.patient2 = { ...ACCOUNTS.patient2, id: patient2User.id };
  console.log('  id:', patient2User.id);

  console.log('Creating Patient 3 (left pending, for the admin-link RPC test)...');
  const patient3User = await createConfirmedUser(ACCOUNTS.patient3Pending);
  result.patient3Pending = { ...ACCOUNTS.patient3Pending, id: patient3User.id };
  console.log('  id:', patient3User.id);

  console.log('Creating Caregiver (deliberately unlinked)...');
  const caregiverUser = await createConfirmedUser(ACCOUNTS.caregiver);
  result.caregiver = { ...ACCOUNTS.caregiver, id: caregiverUser.id };
  console.log('  id:', caregiverUser.id);

  console.log('Creating Administrator (role starts patient, promoted below)...');
  const adminUser = await createConfirmedUser(ACCOUNTS.admin);
  result.admin = { ...ACCOUNTS.admin, id: adminUser.id };
  console.log('  id:', adminUser.id);

  // Bootstrap promotion — direct DB administration, NOT public signup, NOT
  // admin_set_role() (which itself requires an existing admin caller; there
  // is none yet on this staging project for this engagement's test scope).
  console.log('Promoting Administrator account to role=admin via direct service-role UPDATE...');
  const { error: promoteErr } = await admin
    .from('profiles')
    .update({ role: 'admin' })
    .eq('id', adminUser.id);
  if (promoteErr) throw new Error(`Failed to promote admin: ${promoteErr.message}`);

  // Verify the promotion actually took.
  const { data: adminProfile, error: adminProfileErr } = await admin
    .from('profiles').select('id, role').eq('id', adminUser.id).single();
  if (adminProfileErr || adminProfile?.role !== 'admin') {
    throw new Error(`Admin promotion did not verify: ${JSON.stringify({ adminProfileErr, adminProfile })}`);
  }
  console.log('  confirmed role:', adminProfile.role);

  // Minimal, directly-provisioned data for both patients — service role
  // bypasses RLS deliberately (trusted infra path), not re-testing the
  // already-PASS self-service UI creation path from the previous round.
  for (const [label, user, acct] of [
    ['Patient 1', patient1User, ACCOUNTS.patient1],
    ['Patient 2', patient2User, ACCOUNTS.patient2],
  ]) {
    console.log(`Provisioning ${label} patients row + one medication row (service-role, direct)...`);
    const { error: patientsRowErr } = await admin.from('patients').insert({
      id: user.id,
      first_name: acct.firstName,
      last_name: acct.lastName,
    });
    if (patientsRowErr) throw new Error(`patients insert failed for ${label}: ${patientsRowErr.message}`);

    const { error: medErr } = await admin.from('medications').insert({
      patient_id: user.id,
      name: `StagingTestMed_${label.replace(' ', '')}`,
      dosage: '5mg',
      form: 'tablet',
      type: 'otc',
      times: ['08:00'],
      is_active: true,
    });
    if (medErr) throw new Error(`medications insert failed for ${label}: ${medErr.message}`);

    const { error: subErr } = await admin.from('subscriptions').insert({
      user_id: user.id,
      tier: 'free_tier',
      status: 'active',
    });
    if (subErr) console.warn(`  subscriptions insert warning for ${label} (may already exist via a trigger):`, subErr.message);
  }

  // Leave patient3's profile mid-provisioning (provisioning_status =
  // 'profile_created', matching patientService.ts createPatient()'s own
  // step 2 exactly) rather than the column default 'complete', so the
  // Administrator account can legitimately exercise
  // create_patient_with_caregiver() against it in the positive RPC link
  // test (014's T4) — a real, not-yet-finished patient identity. It
  // deliberately has NO patients row yet (the RPC creates it) and no
  // medication/subscription data — those come to life only via the RPC
  // call itself, exercised by the test script. Patient 1 and Patient 2
  // both stay at the column default ('complete') with full data, since
  // they are the ordinary, already-onboarded patients used for the
  // isolation tests and for 014's T2b/T7 negative-claim tests (which
  // specifically require a genuinely 'complete' existing patient as the
  // target an admin is NOT allowed to silently adopt).
  const { error: provErr } = await admin
    .from('profiles')
    .update({ provisioning_status: 'profile_created' })
    .eq('id', patient3User.id);
  if (provErr) throw new Error(`Failed to set patient3 provisioning_status: ${provErr.message}`);

  fs.writeFileSync(
    path.join(__dirname, 'synthetic_accounts.json'),
    JSON.stringify(result, null, 2)
  );
  console.log('\nDone. Identities written to synthetic_accounts.json (staging-only test data; delete during cleanup).');
})().catch((err) => {
  console.error('PROVISIONING FAILED:', err.message);
  process.exit(1);
});
