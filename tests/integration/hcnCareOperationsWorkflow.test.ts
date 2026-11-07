import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';
import { sql } from './_runtime';

describe('Haneen pre-visit acknowledgment and care escalation permission contract',()=>{
  it('requires complete review before visits and enforces Director / clinician ownership of escalation steps',()=>{
    const script=readFileSync(new URL('../database/hcn_previsit_escalations.sql',import.meta.url),'utf8');
    const result=sql(script);
    const rows=result.split('\n').map(v=>v.trim()).filter(Boolean).map(line=>{
      const pos=line.lastIndexOf('|');
      if(pos<0)throw new Error('Unrecognized check result: '+line);
      return {name:line.slice(0,pos),passed:line.slice(pos+1)==='t'};
    });
    expect(rows).toHaveLength(16);
    for(const row of rows)expect(row.passed,row.name).toBe(true);
  });
});