from audit_runtime import *
import pathlib, subprocess
name='codex_9023_fresh'
assert sql("SELECT NOT EXISTS(SELECT 1 FROM pg_database WHERE datname='codex_9023_fresh');")=='t'
sql('CREATE DATABASE '+name+' TEMPLATE template1;')
log=[]
for p in sorted(pathlib.Path('supabase/migrations').glob('*.sql')):
    # Standard Supabase template has Auth/Storage but no application tables.
    r=subprocess.run(['docker','exec','-i',CONTAINER,'psql','-U','supabase_admin','-d',name,'-v','ON_ERROR_STOP=1'],input=('SET search_path=public,extensions;\n'+p.read_text(encoding='utf-8')).encode(),capture_output=True)
    row={'migration':p.name,'exit':r.returncode,'stdout':r.stdout.decode(),'stderr':r.stderr.decode()};log.append(row)
    print(p.name,r.returncode,flush=True)
    if r.returncode:break
(OUT/'fresh_install_results.json').write_text(json.dumps(log,indent=2))
