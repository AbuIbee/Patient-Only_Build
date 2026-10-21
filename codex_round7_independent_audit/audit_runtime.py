"""Disposable local audit helpers. Never targets the existing stacks."""
import json, pathlib, subprocess, urllib.request, urllib.error

OUT = pathlib.Path(__file__).resolve().parent
CONFIG = OUT / 'ephemeral_local_config.json'
DB = 'codex_r7_ready'
CONTAINER = 'mymemoria-r7-audit-db'

def config():
    return json.loads(CONFIG.read_text())

def sql(statement):
    info = json.loads(subprocess.check_output(['docker','inspect',CONTAINER]))[0]
    assert info['Config']['Labels']['audit'] == 'codex-round7-b7352408'
    command = ['docker','exec','-i',CONTAINER,'psql','-U','supabase_admin','-d',DB,'-At','-v','ON_ERROR_STOP=1']
    result = subprocess.run(command,input=statement.encode(),capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr.decode())
    return result.stdout.decode().strip()

def http(method,path,data=None,who='caregiverA',service=False):
    c=config()
    token=c['service'] if service else c['anon'] if who=='anon' else c['users'][who]['token']
    is_auth=path.startswith('/auth/v1/')
    url=('http://127.0.0.1:55441'+path[len('/auth/v1'):]) if is_auth else ('http://127.0.0.1:55442'+path[len('/rest/v1'):])
    headers={'Authorization':'Bearer '+token,'apikey':c['anon'],'Content-Type':'application/json','Prefer':'return=representation'}
    req=urllib.request.Request(url,data=None if data is None else json.dumps(data).encode(),headers=headers,method=method)
    try:
        with urllib.request.urlopen(req,timeout=15) as response:
            raw=response.read();return response.status,json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raw=error.read()
        try:return error.code,json.loads(raw)
        except ValueError:return error.code,raw.decode()[:500]

def rpc(name,data,who='caregiverA',service=False):
    return http('POST','/rest/v1/rpc/'+name,data,who,service)

def uid(name):
    return config()['users'][name]['id']

def record(label,condition,evidence):
    path=OUT/'executed_results.jsonl'
    row={'id':label,'assertion_met':bool(condition),'evidence':evidence}
    with path.open('a',encoding='utf-8') as stream:stream.write(json.dumps(row,ensure_ascii=True)+'\n')
    print(label, 'OBSERVED' if condition else 'ASSERTION FAILED',str(evidence)[:220],flush=True)
    return condition
