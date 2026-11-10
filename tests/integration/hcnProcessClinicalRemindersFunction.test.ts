// HCN-CLINICAL-MASTER-002-CONTINUATION Phase 4 -- real HTTP proof of
// the hcn-process-clinical-reminders Edge Function's own auth
// boundary (the underlying hcn_process_due_clinical_reminders RPC's
// idempotency/retry/reporting behavior is already proven directly in
// hcnClinicalRemindersAndReporting.test.ts -- this file covers only
// what's specific to the Edge Function wrapper itself).
import { describe, expect, it } from 'vitest';
import { SERVICE } from './_runtime';

const FUNCTIONS_BASE = process.env.MMA_TEST_FUNCTIONS_BASE;
if (!FUNCTIONS_BASE) {
  throw new Error('MMA_TEST_FUNCTIONS_BASE must be set (e.g. http://127.0.0.1:57321/functions/v1).');
}
const URL_ = `${FUNCTIONS_BASE}/hcn-process-clinical-reminders`;

describe('HCN-CLINICAL-MASTER-002-CONTINUATION Phase 4 -- reminders Edge Function auth boundary', () => {
  it('rejects a request with no service-role authentication', async () => {
    const res = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(401);
  });

  it('rejects a request with a plausible-looking but wrong bearer token', async () => {
    const res = await fetch(URL_, { method: 'POST', headers: { Authorization: 'Bearer not-the-real-service-key', 'Content-Type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(401);
  });

  it('accepts the real service-role key and returns a structured summary', async () => {
    const res = await fetch(URL_, { method: 'POST', headers: { Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ cooldownHours: 24 }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.checked).toBe('number');
    expect(typeof body.remindersSent).toBe('number');
    expect(Array.isArray(body.skipped)).toBe(true);
  });
});
