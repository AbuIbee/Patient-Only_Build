import csv,json,pathlib,re,collections
out=pathlib.Path(__file__).resolve().parent
path=pathlib.Path('MyMemoria_Functional_Remediation_001/28_ENTERPRISE_CAREGIVER_TRACEABILITY_MATRIX.csv')
rows=[]
with path.open(encoding='utf-8-sig',newline='') as f:
    reader=csv.reader(f,strict=True);header=next(reader)
    for row in reader:rows.append({'line':reader.line_num,'fields':len(row),'id':row[0],'row':row})
spec=pathlib.Path('codex_round7_independent_audit/LOCKED_REQUIREMENTS_REFERENCE.md').read_text(encoding='utf-8')
ids=re.findall(r'^### ([A-Z]\d\d)\s',spec,re.M)
result={'header':header,'rows':len(rows),'unique_ids':len(set(r['id'] for r in rows)),'missing':sorted(set(ids)-set(r['id'] for r in rows)),'extra':sorted(set(r['id'] for r in rows)-set(ids)),'malformed':[r for r in rows if r['fields']!=len(header)],'valid_status_counts':dict(collections.Counter(r['row'][10] for r in rows if r['fields']==len(header))),'all_rows':rows}
(out/'matrix_results.json').write_text(json.dumps(result,indent=2))
print(json.dumps({k:v for k,v in result.items() if k not in ['all_rows','malformed','header']}));print('MALFORMED',[(r['line'],r['id'],r['fields']) for r in result['malformed']])
