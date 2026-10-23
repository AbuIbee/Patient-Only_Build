// Codex MMA-CODEX-16 — "Download auditing," migration 103. Append-only:
// a caller may insert their OWN access record and nothing else. They
// may also read back their own entries (required for PostgREST's
// default INSERT ... RETURNING to succeed at all -- caught live by this
// file's own first run, see migration 103's comment) but never anyone
// else's; only the Platform Owner may read the full log.
//
// Requires the local Docker Supabase stack. Run with
// `npm run test:integration`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, http, login, sql } from './_runtime';

const PW = 'DocAudit9!';
const stamp = Date.now();

const emails = {
  owner: `daa-owner-${stamp}@local.test`,
  caregiver: `daa-caregiver-${stamp}@local.test`,
  outsider: `daa-outsider-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}');
    UPDATE profiles SET role='admin' WHERE id='${ids.owner}';
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
}, 30000);

afterAll(async () => {
  sql(`DELETE FROM document_access_audit WHERE accessed_by IN ('${Object.values(ids).join("','")}');`);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

describe('Codex MMA-CODEX-16 — document_access_audit (migration 103)', () => {
  it('a caller can log their own document access', async () => {
    const [status] = await http('POST', '/rest/v1/document_access_audit', {
      accessed_by: ids.caregiver, bucket_id: 'patient-documents', storage_path: 'patient-x/intake.pdf',
    }, tok.caregiver) as [number, unknown];
    expect(status).toBe(201);
    expect(sql(`SELECT count(*) FROM document_access_audit WHERE accessed_by='${ids.caregiver}';`)).toBe('1');
  });

  it('a caller cannot log access as a DIFFERENT user (forged accessed_by rejected)', async () => {
    const [status] = await http('POST', '/rest/v1/document_access_audit', {
      accessed_by: ids.outsider, bucket_id: 'patient-documents', storage_path: 'patient-x/intake.pdf',
    }, tok.caregiver) as [number, unknown];
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it('a caller can read back their OWN entries but not someone else\'s', async () => {
    const own = await http('GET', `/rest/v1/document_access_audit?accessed_by=eq.${ids.caregiver}`, undefined, tok.caregiver) as [number, unknown[]];
    expect(own[0]).toBe(200);
    expect((own[1] as unknown[]).length).toBeGreaterThanOrEqual(1);

    const others = await http('GET', `/rest/v1/document_access_audit?accessed_by=eq.${ids.owner}`, undefined, tok.caregiver) as [number, unknown[]];
    expect(others[0]).toBe(200);
    expect(others[1]).toEqual([]); // RLS silently hides someone else's entries, not an error
  });

  it('the Platform Owner can read the full audit log', async () => {
    const [status, body] = await http('GET', `/rest/v1/document_access_audit?accessed_by=eq.${ids.caregiver}`, undefined, tok.owner) as [number, Array<{ bucket_id: string }>];
    expect(status).toBe(200);
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body[0].bucket_id).toBe('patient-documents');
  });

  it('a nonsense bucket_id is rejected by the CHECK constraint', async () => {
    const [status] = await http('POST', '/rest/v1/document_access_audit', {
      accessed_by: ids.caregiver, bucket_id: 'patient-media', storage_path: 'x',
    }, tok.caregiver) as [number, unknown];
    expect(status).toBeGreaterThanOrEqual(400);
  });
});
