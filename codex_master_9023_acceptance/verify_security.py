from audit_runtime import *
import uuid
c=config(); P=uid('patientA'); A=uid('caregiverA'); B=uid('caregiverB'); T=uid('therapist')
# Renew real Auth JWTs; never synthesize an authenticated user's JWT.
for name,u in c['users'].items():
    st,d=http('POST','/auth/v1/token?grant_type=password',{'email':u['email'],'password':u.get('password',c['test_password'])},'anon')
    assert st==200,(name,st,d)
    u['token']=d['access_token']
CONFIG.write_text(json.dumps(c))
def check(id,condition,**ev):record(id,condition,ev)
for table,key in [('patients','id'),('patient_intake','patient_profile_id'),('mood_entries','patient_id'),('patient_notes','patient_id')]:
    st,d=http('GET',f'/rest/v1/{table}?{key}=eq.{P}',who='caregiverB');check('CROSS-'+table,st==200 and d==[],http=st,result=d)
for who in ['anon','caregiverB','caregiverA']:
    st,d=rpc('get_patient_help_activation_history',{'p_patient_id':P},who);check('HELP-'+who,st==200 if who=='caregiverA' else st>=400,http=st,result=d)
for table,body in [('patient_diagnoses',{'condition_name':'9023 direct forged'}),('patient_allergies',{'allergen':'9023 direct forged'}),('patient_vitals',{'pulse_bpm':71})]:
    for source in ['professional_observation','verified_source']:
        st,d=http('POST','/rest/v1/'+table,dict(body,patient_id=P,author_id=A,source=source));check('SEC03-DIRECT-'+table+'-'+source,st>=400,http=st,result=d)
for name,body,table in [('record_patient_diagnosis',{'p_condition_name':'9023 RPC forged'},'patient_diagnoses'),('record_patient_allergy',{'p_allergen':'9023 RPC forged'},'patient_allergies'),('record_patient_vitals',{'p_pulse_bpm':73},'patient_vitals')]:
    st,d=rpc(name,dict(body,p_patient_id=P,p_source='verified_source'))
    stored=sql(f"SELECT count(*) FROM {table} WHERE id='{d['id']}';") if st==200 else '0'
    check('SEC03-RPC-'+name,st>=400 and stored=='0',http=st,persisted=stored,result=d)
st,d=http('PATCH',f'/rest/v1/patients?id=eq.{P}',{'code_status':'dnr','code_status_source':'verified_source'},'patientA');check('SEC03-CODE-STATUS',st>=400,http=st,result=d,state=sql(f"SELECT code_status||'|'||code_status_source FROM patients WHERE id='{P}';"))
st,d=rpc('record_communication_needs',{'p_patient_id':P,'p_communication_needs':'9023 medical recommendation','p_source':'professional_observation'},'medical');check('SEC03-PRO-POSITIVE',st==200,http=st)
st,d=http('PATCH',f'/rest/v1/patients?id=eq.{P}',{'communication_needs':'9023 PATIENT REPLACED PROFESSIONAL TEXT'},'patientA')
check('SEC03-UNCHANGED-SOURCE-CONTENT',st>=400,http=st,state=sql(f"SELECT communication_needs||'|'||communication_needs_source FROM patients WHERE id='{P}';"))
st,d=http('PATCH',f'/rest/v1/patients?id=eq.{P}',{'communication_needs_source':'verified_source'},'patientA');check('SEC03-COMM-VERIFIED',st>=400,http=st,state=sql(f"SELECT communication_needs_source FROM patients WHERE id='{P}';"))
st,d=rpc('record_patient_care_plan',{'p_patient_id':P,'p_goals':'9023 legitimate plan'},'medical');assert st==200,d
plan=d['id'];before=sql(f"SELECT row_to_json(p) FROM patient_care_plans p WHERE id='{plan}';")
st,d=rpc('record_patient_care_plan',{'p_patient_id':P,'p_goals':'9023 ordinary forged plan'});check('SEC04-CAREPLAN',st>=400 and before==sql(f"SELECT row_to_json(p) FROM patient_care_plans p WHERE id='{plan}';"),http=st,approved_plan_unchanged=before==sql(f"SELECT row_to_json(p) FROM patient_care_plans p WHERE id='{plan}';"))
task=sql(f"SELECT id FROM tasks WHERE patient_id='{P}' AND title='AUDIT unfinished care list';")
st,d=http('PATCH',f'/rest/v1/tasks?id=eq.{task}',{'status':'completed','status_updated_by':B});actor=sql(f"SELECT status_updated_by FROM tasks WHERE id='{task}';");check('SEC05-ACTOR',st==200 and actor==A,http=st,persisted_actor=actor,expected=A)
st,d=http('PATCH',f'/rest/v1/tasks?id=eq.{task}',{'status_updated_by':B});check('SEC05-ACTOR-NO-STATUS',st==200 and sql(f"SELECT status_updated_by FROM tasks WHERE id='{task}';")==A,http=st)
http('PATCH',f'/rest/v1/tasks?id=eq.{task}',{'status':'pending'})
for who in ['caregiverA','directorA','caregiverB']:
    st,d=http('GET',f"/rest/v1/organization_licenses?organization_id=eq.{c['orgA']}",who=who);check('SEC06-'+who,st==200 and (len(d)==1 if who=='directorA' else d==[]),http=st,rows=len(d) if isinstance(d,list) else d)
st,d=rpc('get_organization_coverage_status',{'p_org_id':c['orgA']});check('SEC06-COVERAGE',st==200 and d[0]['status']=='active' and 'annual_license_fee' not in d[0],http=st,result=d)
vid=str(uuid.uuid4());sql(f"INSERT INTO caregiver_visits(id,organization_id,patient_id,caregiver_id,status,scheduled_start) VALUES('{vid}','{c['orgA']}','{P}','{A}','scheduled',now());")
sql(f"UPDATE staff_patient_assignments SET is_active=false WHERE user_id='{A}' AND patient_id='{P}';")
st,d=rpc('record_note_amendment',{'p_original_note_id':c['ordinary_note_id'],'p_corrected_note':'9023 revoked amendment'});check('SEC02-AMEND',st>=400 and sql("SELECT count(*) FROM patient_notes WHERE note='9023 revoked amendment';")=='0',http=st,result=d)
st,d=rpc('start_caregiver_visit',{'p_visit_id':vid});check('SEC02-START',st>=400 and sql(f"SELECT status FROM caregiver_visits WHERE id='{vid}';")=='scheduled',http=st,result=d)
sql(f"UPDATE caregiver_visits SET status='in_progress' WHERE id='{vid}';")
st,d=rpc('end_caregiver_visit',{'p_visit_id':vid,'p_visit_notes':'9023 revoked end'});check('SEC02-END',st>=400 and sql(f"SELECT status FROM caregiver_visits WHERE id='{vid}';")=='in_progress',http=st,result=d)
st,d=rpc('search_my_conversations',{'p_search_term':'historical-only-needle'});check('FUNC04-REVOKED-SEARCH',st>=400 or d==[],http=st,result=d)
st,d=rpc('get_my_conversations',{'p_patient_id':P});check('FUNC04-REVOKED-LIST',st>=400 or d==[],http=st,rows=len(d) if isinstance(d,list) else d)
sql(f"UPDATE staff_patient_assignments SET is_active=true WHERE user_id='{A}' AND patient_id='{P}';")
for notes in [None,'   ','9023 valid required documentation']:
    args={'p_visit_id':vid};args.update({} if notes is None else {'p_visit_notes':notes})
    st,d=rpc('end_caregiver_visit',args);state=sql(f"SELECT status FROM caregiver_visits WHERE id='{vid}';")
    check('FUNC01-'+('valid' if notes and notes.strip() else 'blank' if notes else 'omitted'),st==200 and state=='completed' if notes and notes.strip() else st>=400 and state=='in_progress',http=st,state=state)
# Keep a normal in-progress visit for the actual UI completion test.
sql(f"UPDATE caregiver_visits SET status='in_progress',visit_notes=NULL,actual_end=NULL WHERE id='{vid}';")
c=config();c['ui_visit_id']=vid;CONFIG.write_text(json.dumps(c))
st,d=rpc('search_my_conversations',{'p_search_term':'historical-only-needle'});check('FUNC04-AUTHORIZED-OLD',st==200 and len(d)>0,http=st,result=d)
st,d=rpc('search_my_conversations',{'p_search_term':'historical-only-needle'},'caregiverB');check('FUNC04-CROSS-TENANT',st==200 and d==[],http=st,result=d)
st,d=rpc('get_my_conversations',{'p_patient_id':P});check('FUNC03-FOLLOWUP',st==200 and any(x['has_open_follow_up'] and x['unread_count']==0 for x in d),http=st,rows=[{'subject':x['subject'],'followup':x['has_open_follow_up'],'unread':x['unread_count'],'urgent':x['last_message_urgent']} for x in d])
