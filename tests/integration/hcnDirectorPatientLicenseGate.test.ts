import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sql } from './_runtime';

describe('HCN Director patient authorization requires an active organization license', () => {
  it('permits active licensed coverage and rejects inactive licenses, unrelated users/patients, revoked membership and ended coverage', () => {
    const script = readFileSync(new URL('../database/hcn_director_patient_license_gate.sql', import.meta.url), 'utf8');
    const rows = sql(script).split('\n').filter(Boolean).map(line => JSON.parse(line) as {
      check_name: string; actual: boolean; expected: boolean; passed: boolean;
    });
    expect(rows).toHaveLength(13);
    for (const row of rows) expect(row.passed, row.check_name).toBe(true);
  });
});
