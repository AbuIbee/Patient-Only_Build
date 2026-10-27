// CODEX F-09 (P1, partial) — "License and office entitlements are
// not enforced comprehensively." Independent audit
// MMA_ENT_SALES_007_CODEX_INDEPENDENT_ACCEPTANCE.md, target commit
// b362e119. Specific sub-item fixed in migration 129: "org_configure_
// license() checks active before updating without locking the
// license row, leaving a configure-versus-activation race."
//
// Reproduces the EXACT race, not a simulated approximation: a real
// second psql session holds the organization_licenses row's FOR
// UPDATE lock (inside activate_enterprise_license_from_quote() itself)
// while the main test's org_configure_license() RPC call is in
// flight. Before migration 129, org_configure_license()'s own
// unlocked read could observe status='proposed' and later overwrite
// the just-activated license's real, quote-derived commercial terms.
// After the fix, org_configure_license() blocks on the same row lock
// and correctly rejects once it sees status='active'.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql, DB_CONTAINER } from './_runtime';
import { spawn } from 'node:child_process';

const PW = 'CodexF09Fix9!';
const stamp = Date.now();

const emails = {
  owner: `f09-owner-${stamp}@local.test`,
  bilal: `f09-bilal-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
let orgId: string;
let quoteId: string;

function runConcurrentActivateHoldingLock(targetOrgId: string, targetQuoteId: string, sleepSeconds: number) {
  const statement = `SET application_name='f09-activate-race'; BEGIN;
SELECT id FROM organization_licenses WHERE organization_id='${targetOrgId}' FOR UPDATE;
SELECT pg_sleep(${sleepSeconds});
SELECT (activate_enterprise_license_from_quote('${targetQuoteId}')).status;
COMMIT;`;
  // MMA-ENTERPRISE-ULTIMATE-MASTER-010 Section 3.3/16.4: see
  // lastSeatApprovalConcurrency.test.ts for the full rationale -- this
  // hardcoded 'supabase_db_repo' regardless of MMA_TEST_DB_CONTAINER,
  // spawning an unwanted session (including a real RPC call, which
  // raised "quote not found" and rolled back only because the UUID is
  // synthetic) against the owner's real database whenever it happened
  // to be running. Fixed to use DB_CONTAINER.
  const proc = spawn(
    'docker',
    ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  proc.stdin.write(statement);
  proc.stdin.end();
  let stderrBuf = '';
  proc.stderr.on('data', (d) => (stderrBuf += d));
  return {
    waitForSleep: async (timeoutMs: number) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='f09-activate-race' AND wait_event='PgSleep');") === 't') return;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error('No synchronized activation pause observed within ' + timeoutMs + 'ms');
    },
    waitForExit: () => new Promise<void>((resolve) => proc.on('close', () => resolve())),
    stderr: () => stderrBuf,
  };
}

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}');
    UPDATE profiles SET role='admin' WHERE id='${ids.owner}';
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);

  const [, prospect] = (await rpc('platform_owner_create_prospect', {
    p_contact_name: 'F09 Test', p_contact_email: emails.bilal, p_contact_phone: null, p_prospective_organization_name: `F09 Race Org ${stamp}`, p_notes: null,
  }, tok.owner)) as [number, { id: string }];
  const [, quote] = (await rpc('platform_owner_create_quote', {
    p_prospect_id: prospect.id, p_package_type: 'integrated_care', p_proposed_licensed_seats: 8,
    p_proposed_covered_patient_capacity: 40, p_annual_license_fee: 30000, p_billing_cadence: 'annual',
    p_quote_term_months: 12, p_discount_notes: null, p_valid_until: null,
  }, tok.owner)) as [number, { id: string }];
  quoteId = quote.id;
  await rpc('platform_owner_send_quote', { p_quote_id: quoteId }, tok.owner);

  const appId = sql(`
    INSERT INTO professional_applications (applicant_user_id, requested_office, proposed_organization_name, proposed_package_type, legal_name, contact_email, status, platform_owner_approval_required, application_details)
    VALUES ('${ids.bilal}', 'director', 'F09 Race Org ${stamp}', 'integrated_care', 'F09 Bilal', '${emails.bilal}', 'pending_review', true, '{"originatingQuoteId":"${quoteId}"}'::jsonb)
    RETURNING id;
  `);
  const [, org] = (await rpc('platform_owner_approve_director_application', { p_application_id: appId }, tok.owner)) as [number, { id: string }];
  orgId = org.id;
  expect(sql(`SELECT status FROM organization_licenses WHERE organization_id='${orgId}';`)).toBe('proposed');

  // Confirmed payment and both mandatory agreements (migration 123) --
  // activate_enterprise_license_from_quote() will succeed once it
  // actually runs.
  sql(`
    INSERT INTO enterprise_billing_accounts (quote_id, billing_contact_email, currency, unit_amount_cents, billing_interval, status, created_by)
    VALUES ('${quoteId}', '${emails.bilal}', 'usd', 3000000, 'year', 'active', '${ids.bilal}');
  `);
  for (const contractType of ['saas_license', 'baa'] as const) {
    const [, contract] = (await rpc('platform_owner_create_contract', {
      p_quote_id: quoteId, p_contract_type: contractType, p_template_version: 'v1', p_signatory_name: 'F09 Bilal', p_signatory_title: null,
    }, tok.owner)) as [number, { id: string }];
    await rpc('platform_owner_present_contract', { p_contract_id: contract.id }, tok.owner);
    await rpc('platform_owner_record_contract_execution', { p_contract_id: contract.id, p_execution_method: 'manual', p_execution_evidence_reference: `f09-${contractType}` }, tok.owner);
  }
}, 30000);

afterAll(async () => {
  sql(`
    DELETE FROM enterprise_contracts WHERE created_by='${ids.owner}';
    DELETE FROM enterprise_billing_accounts WHERE created_by='${ids.bilal}';
    DELETE FROM organization_licenses WHERE organization_id='${orgId}';
    DELETE FROM organization_memberships WHERE organization_id='${orgId}';
    DELETE FROM organizations WHERE id='${orgId}';
    DELETE FROM professional_applications WHERE applicant_user_id='${ids.bilal}';
    DELETE FROM sales_quotes WHERE created_by='${ids.owner}';
    DELETE FROM sales_prospects WHERE created_by='${ids.owner}';
  `);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

describe('CODEX F-09 FIX (migration 129) — org_configure_license() is serialized against activation, not racy', () => {
  it('PACKAGE 1 migration 143 superseded this race entirely: org_configure_license is rejected on authorization grounds alone, before the row lock (or the Director identity check it depends on) is ever reached by any reachable caller', async () => {
    // This test originally proved: a configure call that starts while
    // activation holds the row lock blocks, then correctly rejects once
    // activation has committed (migration 129's fix). That proof
    // required calling org_configure_license as the real, authenticated
    // Director (tok.bilal) -- the only way the function's own internal
    // `is_active_org_director(p_org_id)` check (which reads auth.uid())
    // could ever pass far enough to reach the FOR UPDATE lock line at
    // all.
    //
    // PACKAGE 1 (migration 143) revoked the authenticated EXECUTE grant
    // entirely, so that path now 403s before the function body runs --
    // confirmed first, not assumed. An attempt was made to preserve the
    // race proof by calling as service_role instead (service_role still
    // has EXECUTE) -- empirically verified NOT to work: service_role
    // has no real auth.uid(), so is_active_org_director() returns false
    // and the function raises its OWN "Only an active director..."
    // exception in ~8ms, never reaching the lock either. Directly
    // confirmed via raw SQL (SET ROLE service_role; SELECT
    // org_configure_license(...)) outside this test file before
    // settling on this honest resolution, rather than leaving a test
    // that looked like it proved concurrency safety but silently didn't.
    //
    // The underlying FOR UPDATE lock in the function body is UNCHANGED
    // and remains real defense-in-depth -- it is simply no longer
    // reachable by ANY caller this test harness can legitimately
    // authenticate as, which is itself the correct, intended outcome of
    // migration 143 (there is no longer a legitimate authenticated
    // caller for this function at all). Also confirmed directly: even a
    // raw SQL `SET ROLE authenticated` session gets a real Postgres
    // "permission denied for function org_configure_license" -- the
    // grant boundary holds beneath the HTTP/PostgREST layer too, not
    // only at the API gateway.
    const holder = runConcurrentActivateHoldingLock(orgId, quoteId, 2);
    await holder.waitForSleep(5000);

    const startedAt = Date.now();
    const [configureStatus] = await rpc('org_configure_license', {
      p_org_id: orgId, p_licensed_seats: 999, p_covered_patient_capacity: 999, p_annual_license_fee: 1,
    }, tok.bilal);
    const elapsedMs = Date.now() - startedAt;

    await holder.waitForExit();
    expect(holder.stderr()).toBe('');

    // Rejected on authorization grounds alone -- instantly, never
    // blocking on the activation holder's lock (there is nothing left
    // to race: the Director path never reaches the lock at all now).
    expect(configureStatus).toBe(403);
    expect(elapsedMs).toBeLessThan(1000);

    // The holder's activation still runs to completion in the
    // background and the license still carries the REAL, quote-derived
    // terms -- confirms this migration didn't silently break the
    // activation path itself.
    const final = sql(`SELECT status, licensed_seats, covered_patient_capacity, annual_license_fee FROM organization_licenses WHERE organization_id='${orgId}';`);
    expect(final).toBe('active|8|40|30000.00');
  });
});
