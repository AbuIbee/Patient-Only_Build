// HCN-OPS-20261107: executes the exact rollback-only permission matrix against
// CI's explicitly disposable local Supabase stack. No persistent project touched.
import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {sql} from './_runtime';

describe('Haneen caregiver previsit + clinical escalation permission matrix',()=>{
  it('passes all 18 real Postgres acceptance checks in a rolled-back transaction',()=>{
    const fixture=readFileSync(new URL('../database/hcn_previsit_escalations.sql',import.meta.url),'utf8');
    const result=sql(fixture);
    const rows=result.split('\n').filter(x=>x.includes('|')&&!x.startsWith('NOTICE'));
    const parsed=rows.map(row=>{
      const split=row.split('|');return {name:split[0].trim(),passed:split[1]?.trim()==='t'};
    });
    expect(parsed.length).toBe(18);
    expect(parsed.filter(r=>!r.passed)).toEqual([]);
    expect(parsed.some(r=>r.name==='new handoff invalidates previous acknowledgment')).toBe(true);
    expect(parsed.some(r=>r.name==='medication change invalidates previsit acknowledgment')).toBe(true);
    expect(parsed.some(r=>r.name==='caregiver cannot masquerade as clinician')).toBe(true);
    expect(parsed.some(r=>r.name==='Director closes after clinician review')).toBe(true);
  });
});
