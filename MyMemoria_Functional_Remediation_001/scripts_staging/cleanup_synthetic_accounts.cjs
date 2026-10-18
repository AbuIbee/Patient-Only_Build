// cleanup_synthetic_accounts.cjs
//
// Staging-only. Deletes every account/row this round's provisioning +
// testing created, using the service role (the same credential used to
// create them — only service role can delete an auth.users row directly).
// `profiles.id REFERENCES auth.users(id) ON DELETE CASCADE` (001's schema)
// means deleting the auth user cascades to profiles, and patients.id's own
// FK to auth.users cascades the patients row too; this script still
// explicitly deletes the dependent rows first and re-verifies zero remain
// afterward, rather than trusting cascade silently.
//
// Run with:
//   SUPABASE_URL=https://axurszlibxwwptkczztt.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<staging service_role key> \
//   node cleanup_synthetic_accounts.cjs

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.');
  process.exit(1);
}
if (!SUPABASE_URL.includes('axurszlibxwwptkczztt')) {
  console.error(`Refusing to run: SUPABASE_URL (${SUPABASE_URL}) is not the staging project.`);
  process.exit(1);
}

const accountsPath = path.join(__dirname, 'synthetic_accounts.json');
if (!fs.existsSync(accountsPath)) {
  console.error('synthetic_accounts.json not found — nothing to clean up, or it was already deleted.');
  process.exit(1);
}
const ACCTS = JSON.parse(fs.readFileSync(accountsPath, 'utf8'));
const ids = Object.values(ACCTS).map(a => a.id);

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

(async () => {
  console.log('Deleting dependent rows for ids:', ids);

  for (const table of ['medications', 'patient_document_uploads', 'media_uploads', 'care_partner_checkins']) {
    const { error } = await admin.from(table).delete().in('patient_id', ids);
    if (error) console.warn(`  ${table} delete warning:`, error.message);
  }

  const { error: capErr } = await admin.from('caregiver_patients')
    .delete()
    .or(ids.map(id => `patient_id.eq.${id}`).concat(ids.map(id => `caregiver_id.eq.${id}`)).join(','));
  if (capErr) console.warn('  caregiver_patients delete warning:', capErr.message);

  const { error: subErr } = await admin.from('subscriptions').delete().in('user_id', ids);
  if (subErr) console.warn('  subscriptions delete warning:', subErr.message);

  const { error: patErr } = await admin.from('patients').delete().in('id', ids);
  if (patErr) console.warn('  patients delete warning:', patErr.message);

  console.log('Deleting auth users (cascades profiles)...');
  for (const [label, acct] of Object.entries(ACCTS)) {
    const { error } = await admin.auth.admin.deleteUser(acct.id);
    if (error) console.error(`  FAILED to delete ${label} (${acct.email}, ${acct.id}):`, error.message);
    else console.log(`  deleted ${label} (${acct.email})`);
  }

  console.log('\nVerifying zero remaining rows for these ids...');
  const checks = {};
  for (const table of ['profiles', 'patients', 'medications', 'subscriptions', 'caregiver_patients']) {
    const col = table === 'caregiver_patients' ? 'caregiver_id' : (table === 'patients' || table === 'profiles' ? 'id' : 'patient_id');
    const { data, error } = await admin.from(table).select('id').in(col, ids);
    checks[table] = { remaining: data?.length ?? null, error: error?.message };
  }
  console.log(JSON.stringify(checks, null, 2));

  const anyRemaining = Object.values(checks).some(c => (c.remaining ?? 0) > 0);
  if (anyRemaining) {
    console.error('\nCLEANUP INCOMPLETE — some rows remain. Do not report cleanup as done.');
    process.exit(1);
  }

  fs.unlinkSync(accountsPath);
  const resultsPath = path.join(__dirname, 'authorization_test_results.json');
  if (fs.existsSync(resultsPath)) fs.unlinkSync(resultsPath);

  console.log('\nCleanup verified complete. synthetic_accounts.json and authorization_test_results.json removed.');
})().catch((err) => {
  console.error('CLEANUP FAILED:', err.message);
  process.exit(1);
});
