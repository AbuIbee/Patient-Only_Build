import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {sql} from './_runtime';

describe('Haneen previsit policy does not break older My Memoria visits',()=>{
 it('preserves prior caregiver authorization while blocking covered-patient bypass',()=>{
  const script=readFileSync(new URL('../database/hcn_legacy_visit_compatibility.sql',import.meta.url),'utf8');
  const rows=sql(script).split('\n').map(s=>s.trim()).filter(Boolean).map(line=>{
   const i=line.lastIndexOf('|');
   if(i<0)throw new Error('Unexpected visit compatibility output: '+line);
   return {name:line.slice(0,i),passed:line.slice(i+1)==='t'};
  });
  expect(rows).toHaveLength(3);
  for(const row of rows)expect(row.passed,row.name).toBe(true);
 });
});