import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sql } from './_runtime';

describe('HCN contact verification provenance at the authenticated RLS boundary', () => {
  it('rejects a forged verified status while preserving authorized unverified reports', () => {
    const script = readFileSync(new URL('../database/hcn_contact_verification_provenance.sql', import.meta.url), 'utf8');
    const rows = sql(script).split('\n').filter(Boolean).map(line => JSON.parse(line) as {
      check_name: string; passed: boolean;
    });
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.passed, row.check_name).toBe(true);
  });
});
