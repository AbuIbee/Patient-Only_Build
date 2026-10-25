// Shared helpers for tests/integration/**. Targets the local
// supabase_db_repo stack reachable at 127.0.0.1:55321 via Docker by
// DEFAULT. NEVER targets staging/production -- there is no
// staging/production credential anywhere in this file.
//
// MMA-ENT-CAREGIVER-MASTER-003, Phase D: supabase_db_repo is the
// owner's own persistent local dev database (confirmed: 1,190 real
// auth.users rows, migration history frozen at 104 prior to this
// branch's own migrations landing on it) -- NOT a disposable fixture
// store, even though it happens to be what this suite has historically
// targeted. MMA_TEST_API_BASE/MMA_TEST_DB_CONTAINER let a disposable,
// throwaway stack (see scripts/disposable_supabase.mjs) be substituted
// for both the REST/Auth base URL and the `docker exec` target WITHOUT
// touching any call site below -- `npm run test:integration` keeps its
// existing default behavior unchanged when neither is set.
import { execSync, spawn } from 'node:child_process';

export const BASE = process.env.MMA_TEST_API_BASE || 'http://127.0.0.1:55321';
const DB_CONTAINER = process.env.MMA_TEST_DB_CONTAINER || 'supabase_db_repo';
// Standard Supabase CLI local-dev demo keys (iss: "supabase-demo"), HS256,
// publicly documented -- not a secret, and meaningless against any real
// project. Every default-config local Supabase stack (disposable ones
// included) shares this same demo JWT secret, so these keys are valid
// against any of them.
export const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
export const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

export function sql(statement: string): string {
  // -q (quiet): without it, psql appends a command-completion tag (e.g.
  // "INSERT 0 1") after any INSERT/UPDATE/DELETE ... RETURNING value,
  // silently corrupting the captured result with a trailing newline +
  // tag. -At alone only suppresses result-set formatting, not this.
  return execSync(`docker exec -i ${DB_CONTAINER} psql -U postgres -d postgres -At -q -v ON_ERROR_STOP=1`, {
    input: statement,
  })
    .toString()
    .trim();
}

export async function authSignUp(email: string, password: string): Promise<string> {
  const r = await fetch(`${BASE}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error('signup failed: ' + JSON.stringify(data));
  return data.id as string;
}

export async function authDeleteUser(id: string): Promise<void> {
  await fetch(`${BASE}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
}

export async function login(email: string, password: string): Promise<string> {
  const r = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error('login failed: ' + JSON.stringify(data));
  return data.access_token as string;
}

export async function http(
  method: string,
  path: string,
  data: unknown,
  token: string,
): Promise<[number, unknown]> {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const text = await r.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return [r.status, body];
}

export async function rpc(name: string, args: unknown, token: string): Promise<[number, unknown]> {
  return http('POST', `/rest/v1/rpc/${name}`, args, token);
}

// CODEX F-10 (migration 130): submit_professional_application()/
// resubmit_application() now server-side validate the ENTIRE six-step
// Director payload, not just legal_name/contact_email. Every test that
// submits (not merely drafts) a real director application must send a
// complete, valid step1..step6 object or the RPC now correctly rejects
// it -- this helper is the one shared "known-good" shape, with the
// identity fields (fullLegalName/verifiedBusinessEmail) deliberately
// left to the caller since those must match the submission's own
// p_legal_name/p_contact_email arguments.
export function validDirectorApplicationDetails(opts: {
  fullLegalName: string;
  verifiedBusinessEmail: string;
  originatingQuoteId?: string;
}) {
  return {
    originatingQuoteId: opts.originatingQuoteId,
    currentStep: 6,
    step1: {
      legalBusinessName: 'Al-Noor Family Care Services', dba: '', legalForm: 'LLC', businessClassification: 'Home care agency',
      formationJurisdiction: 'Texas', registrationNumber: 'TX-0001', ein: '12-3456789', registeredAddress: '100 Main St, Austin, TX',
      operatingSameAsRegistered: true, operatingAddress: '', mailingAddress: '', businessEmail: opts.verifiedBusinessEmail,
      businessPhone: '512-555-0100', website: '', yearEstablished: '2024', numLocations: '1',
      seatsAdmin: '1', seatsCaregiver: '2', seatsTherapist: '1', seatsMedical: '1',
    },
    step2: {
      fullLegalName: opts.fullLegalName, preferredName: '', verifiedBusinessEmail: opts.verifiedBusinessEmail, mobile: '512-555-0101',
      title: 'Founder', relationshipToEntity: 'Owner', authorizedSignatory: true, authorityAttestation: true, alternateAdmin: '',
    },
    step3: { requestedActivationDate: '', migrationStatus: 'no_migration', migrationDetails: '', poRequired: false, buyerBillingContact: 'Billing Contact' },
    step4: {
      services: 'Residential dementia care', careSetting: 'In-home', jurisdictions: 'Texas', phiIntendedUse: 'yes' as const,
      hipaaDeclaration: 'covered_entity' as const, privacyContact: 'Privacy Contact', securityContact: 'Security Contact',
      baaSignatory: opts.fullLegalName, orgRegistration: '', orgNpi: '', migrationConsent: false,
    },
    step5: { billingLegalEntity: 'Al-Noor Family Care Services', billingContact: 'Billing Contact', billingAddress: '100 Main St, Austin, TX', billingEmail: opts.verifiedBusinessEmail, currency: 'USD', cadence: 'annual', taxExempt: false, poNumber: '' },
    step6: { accuracyAttestation: true, authorizedSignatoryConfirmed: true, privacyAck: true, signatureName: opts.fullLegalName },
  };
}

// Holds a FOR UPDATE lock on a pending_therapist_connections row for
// `sleepSeconds`, then (still inside the SAME transaction/session, so no
// self-deadlock) accepts the invitation as the therapist, then commits.
// Mirrors the exact interleaving the original Codex concurrency finding
// used (concurrency_test.py), so SEC-01's regression test reproduces the
// identical race, not a weakened approximation of it.
export function runConcurrentAcceptHoldingLock(connectionId: string, therapistId: string, sleepSeconds: number) {
  const statement = `SET application_name='r7mc-accept-race'; BEGIN;
SELECT id FROM public.pending_therapist_connections WHERE id='${connectionId}' FOR UPDATE;
SELECT pg_sleep(${sleepSeconds});
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','${therapistId}',true);
SELECT (public.respond_to_therapist_invite('${connectionId}',true)).status;
COMMIT;`;
  const proc = spawn(
    'docker',
    ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'],
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
        if (
          sql(
            "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='r7mc-accept-race' AND wait_event='PgSleep');",
          ) === 't'
        )
          return;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error('No synchronized acceptance pause observed within ' + timeoutMs + 'ms');
    },
    waitForExit: () => new Promise<void>((resolve) => proc.on('close', () => resolve())),
    stderr: () => stderrBuf,
  };
}
