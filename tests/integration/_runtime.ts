// Shared helpers for tests/integration/**. Targets ONLY the local
// supabase_db_repo stack reachable at 127.0.0.1:55321 via Docker.
// NEVER targets staging/production -- there is no staging/production
// credential anywhere in this file.
import { execSync, spawn } from 'node:child_process';

export const BASE = 'http://127.0.0.1:55321';
// Standard Supabase CLI local-dev demo keys (iss: "supabase-demo"), HS256,
// publicly documented -- not a secret, and meaningless against any real
// project.
export const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
export const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

export function sql(statement: string): string {
  return execSync('docker exec -i supabase_db_repo psql -U postgres -d postgres -At -v ON_ERROR_STOP=1', {
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
    ['exec', '-i', 'supabase_db_repo', 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'],
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
