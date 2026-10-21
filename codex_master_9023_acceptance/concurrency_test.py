from audit_runtime import *
import time, subprocess, json, concurrent.futures

P=uid('patientA');T=uid('therapist')
sql(f"DELETE FROM public.therapist_relationships WHERE patient_id='{P}' AND therapist_id='{T}';")
st,invite=rpc('caregiver_invite_therapist',{'p_patient_id':P,'p_therapist_email':config()['users']['therapist']['email']})
assert st==200,invite
base=['docker','exec','-i',CONTAINER,'psql','-U','supabase_admin','-d',DB,'-At','-v','ON_ERROR_STOP=1']
statement=f"""SET application_name='codex-r7-accept-race'; BEGIN;
SELECT id FROM public.pending_therapist_connections WHERE id='{invite['id']}' FOR UPDATE;
SELECT pg_sleep(3);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','{T}',true);
SELECT (public.respond_to_therapist_invite('{invite['id']}',true)).status;
COMMIT;"""
p=subprocess.Popen(base,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
p.stdin.write(statement.encode());p.stdin.close()
deadline=time.monotonic()+10
while time.monotonic()<deadline:
    if sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='codex-r7-accept-race' AND wait_event='PgSleep');")=='t':break
    time.sleep(.05)
else:raise RuntimeError('No synchronized acceptance pause')
start=time.monotonic();status,data=rpc('revoke_therapist_connection',{'p_patient_id':P,'p_therapist_id':T});elapsed=time.monotonic()-start
p.wait(timeout=12);assert p.returncode==0,p.stderr.read().decode()
state=sql(f"SELECT p.status||'|'||t.is_active::text FROM public.pending_therapist_connections p JOIN public.therapist_relationships t USING(patient_id,therapist_id) WHERE p.id='{invite['id']}';")
record('SEC01-ACCEPT-REVOKE-RACE',status==200 and state=='revoked|false',{'revoke_http':status,'wait_seconds':round(elapsed,2),'final_state':state})
status,data=http('POST','/rest/v1/patient_notes',{'patient_id':P,'author_id':T,'note':'AUDIT professional write AFTER concurrent revoke','note_type':'therapist_session'},'therapist')
record('SEC01-RACE-WRITE-DENIED',status>=400,{'http':status,'persisted_rows':sql("SELECT count(*) FROM public.patient_notes WHERE note='AUDIT professional write AFTER concurrent revoke';")})
# Restore a clean ended connection for subsequent independent UI tests.
rpc('revoke_therapist_connection',{'p_patient_id':P,'p_therapist_id':T})

