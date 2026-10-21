from audit_runtime import *
import pathlib
assert sql('SELECT current_database();') == DB
for p in sorted(pathlib.Path('supabase/migrations').glob('07[678]*')):
    result=sql(p.read_text(encoding='utf-8'))
    (OUT/(p.stem+'.log')).write_text(result)
    print(p.name, 'APPLIED', flush=True)
sql("NOTIFY pgrst, 'reload schema';")
