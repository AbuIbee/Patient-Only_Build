import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {sql} from './_runtime';

describe('Haneen operations protected reads',()=>{
  it('permits assigned licensed caregivers and denies unrelated/revoked/expired access',()=>{
    const script=readFileSync(new URL('../database/hcn_ops_rls_revocation.sql',import.meta.url),'utf8');
    const lines=sql(script).split('\n').map(s=>s.trim()).filter(Boolean);
    const rows=lines.map(line=>{
      const cut=line.lastIndexOf('|');
      if(cut<0)throw new Error('Unexpected RLS test output: '+line);
      return {name:line.slice(0,cut),passed:line.slice(cut+1)==='t'};
    });
    expect(rows).toHaveLength(8);
    for(const row of rows) expect(row.passed,row.name).toBe(true);
  });
});