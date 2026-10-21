from audit_runtime import *
import uuid

c=config();P=uid('patientA');Q=uid('patientB');A=uid('caregiverA');B=uid('caregiverB');T=uid('therapist');org=c['orgA']
for table in ['patients','tasks','patient_intake','mood_entries','patient_notes']:
    key='id' if table=='patients' else 'patient_profile_id' if table=='patient_intake' else 'patient_id'
    st,data=http('GET',f'/rest/v1/{table}?{key}=eq.{P}','' if False else None,'caregiverB')
    record('CROSS-'+table,st==200 and data==[],{'status':st,'rows':len(data) if isinstance(data,list) else data})

st,data=rpc('get_patient_help_activation_history',{'p_patient_id':P},'anon');record('HELP-ANON',st>=400,{'status':st,'result':data})
st,data=rpc('get_patient_help_activation_history',{'p_patient_id':P},'caregiverB');record('HELP-CROSS',st>=400,{'status':st,'result':data})
st,data=rpc('get_patient_help_activation_history',{'p_patient_id':P});record('HELP-ASSIGNED',st==200,{'status':st,'rows':len(data) if isinstance(data,list) else data})

for function,params in [
 ('caregiver_authorize_destructive_deletion',{'p_registration_id':str(uuid.uuid4()),'p_operation_id':str(uuid.uuid4())}),
 ('caregiver_record_deletion_outcome',{'p_registration_id':str(uuid.uuid4()),'p_operation_id':str(uuid.uuid4()),'p_outcome':'confirmed_deleted'}),
 ('caregiver_finish_registration_deletion',{'p_registration_id':str(uuid.uuid4()),'p_operation_id':str(uuid.uuid4())})]:
    st,data=rpc(function,params);record('DEL-PRIV-'+function,st>=400 and 'permission denied' in str(data),{'status':st,'result':data})

st,data=rpc('caregiver_invite_therapist',{'p_patient_id':P,'p_therapist_email':c['users']['caregiverB']['email']});record('THER-CAREGIVER-DENIED',st>=400,{'status':st,'result':data})
st,invite=rpc('caregiver_invite_therapist',{'p_patient_id':P,'p_therapist_email':c['users']['therapist']['email']});record('THER-INVITE',st==200,{'status':st,'id':invite.get('id')})
if st!=200:raise RuntimeError(invite)
st,data=rpc('respond_to_therapist_invite',{'p_connection_id':invite['id'],'p_accept':True},'outsider');record('THER-WRONG-RECIPIENT',st>=400,{'status':st,'result':data})
st,data=rpc('respond_to_therapist_invite',{'p_connection_id':invite['id'],'p_accept':True},'therapist');record('THER-ACCEPT',st==200 and data.get('status')=='accepted',{'status':st,'result':data.get('status')})
st,data=http('POST','/rest/v1/patient_notes',{'patient_id':P,'author_id':T,'note':'AUDIT therapist legitimate','note_type':'therapist_session'},'therapist');record('NOTE-PROFESSIONAL-ALLOWED',st==201,{'status':st})
st,data=http('POST','/rest/v1/patient_notes',{'patient_id':P,'author_id':P,'note':'AUDIT forged','note_type':'therapist_session'},'patientA');record('NOTE-PATIENT-FORGERY-DENIED',st>=400,{'status':st,'result':data})
st,data=rpc('revoke_therapist_connection',{'p_patient_id':P,'p_therapist_id':T});record('THER-REVOKE',st==200,{'status':st})
st,data=http('GET',f'/rest/v1/patient_notes?patient_id=eq.{P}&note_type=eq.therapist_session',who='therapist');record('NOTE-REVOKED-READ-DENIED',st==200 and data==[],{'status':st,'rows':data})
st,data=http('POST','/rest/v1/patient_notes',{'patient_id':P,'author_id':T,'note':'AUDIT revoked attempt','note_type':'therapist_session'},'therapist');record('NOTE-REVOKED-WRITE-DENIED',st>=400,{'status':st})
st,data=http('POST','/rest/v1/therapist_relationships',{'patient_id':P,'therapist_id':B,'caregiver_id':A,'is_active':True});record('THER-DIRECT-INSERT-DENIED',st>=400,{'status':st})
st,data=http('GET','/rest/v1/pending_therapist_connections',who='outsider');record('INVITATION-UNRELATED-INVISIBLE',st==200 and data==[],{'status':st,'rows':data})

# Preserve rows and compare post-denial state, not merely HTTP status.
ordinary=json.loads(sql(f"SELECT row_to_json(n) FROM public.patient_notes n WHERE patient_id='{P}' AND note='AUDIT ordinary note original';"))
sql(f"UPDATE public.staff_patient_assignments SET is_active=false WHERE user_id='{A}' AND patient_id='{P}';")
st,data=http('PATCH',f'/rest/v1/tasks?patient_id=eq.{P}',{'status':'completed'});unchanged=sql(f"SELECT status FROM public.tasks WHERE title='AUDIT unfinished care list';")=='pending'
record('TASK-REVOKED-STATE-UNCHANGED',st==200 and data==[] and unchanged,{'status':st,'rows':data,'database_pending':unchanged})
st,data=rpc('record_note_amendment',{'p_original_note_id':ordinary['id'],'p_corrected_note':'AUDIT amendment AFTER REVOCATION'})
exists=sql(f"SELECT count(*) FROM public.patient_notes WHERE amends_note_id='{ordinary['id']}' AND note='AUDIT amendment AFTER REVOCATION';")=='1'
record('DEFECT-AMENDMENT-AFTER-REVOCATION',st==200 and exists,{'status':st,'new_row_persisted':exists})
visit=sql(f"SELECT id FROM public.caregiver_visits WHERE caregiver_id='{A}' AND status='scheduled' ORDER BY scheduled_start LIMIT 1;")
st,data=rpc('start_caregiver_visit',{'p_visit_id':visit});record('DEFECT-VISIT-START-AFTER-REVOCATION',st==200 and data.get('status')=='in_progress',{'status':st,'persisted':sql(f"SELECT status FROM public.caregiver_visits WHERE id='{visit}';")})
st,data=rpc('end_caregiver_visit',{'p_visit_id':visit,'p_visit_notes':'AUDIT ended after revocation'});record('DEFECT-VISIT-END-AFTER-REVOCATION',st==200 and data.get('status')=='completed',{'status':st,'persisted':sql(f"SELECT status FROM public.caregiver_visits WHERE id='{visit}';")})
sql(f"UPDATE public.staff_patient_assignments SET is_active=true WHERE user_id='{A}' AND patient_id='{P}';")

# New safety fields: test direct table authorization as well as RPC guards.
st,data=rpc('record_patient_safety_plan',{'p_patient_id':P,'p_code_status':'dnr','p_code_status_source':'verified_source'});record('SAFETY-RPC-VERIFICATION-DENIED',st>=400,{'status':st,'result':data})
st,data=http('PATCH',f'/rest/v1/patients?id=eq.{P}',{'code_status':'dnr','code_status_source':'verified_source'},'patientA')
forged=sql(f"SELECT code_status||'|'||code_status_source FROM public.patients WHERE id='{P}';")=='dnr|verified_source'
record('DEFECT-DIRECT-VERIFIED-CODE-STATUS',st==200 and forged,{'status':st,'persisted_verified_dnr':forged})
sql(f"UPDATE public.patients SET code_status='unknown',code_status_source='unknown' WHERE id='{P}';")

# Normal visit persistence, missing-note validation and scheduling mismatch.
st,data=rpc('schedule_caregiver_visit',{'p_org_id':org,'p_patient_id':P,'p_scheduled_start':'2026-10-22T16:00:00Z','p_scheduled_end':'2026-10-22T17:00:00Z'});record('DEFECT-CAREGIVER-SCHEDULE-CTA-DENIED',st>=400,{'status':st,'result':data})
st,data=rpc('schedule_caregiver_visit',{'p_org_id':org,'p_patient_id':P,'p_scheduled_start':'2026-10-22T16:00:00Z','p_scheduled_end':'2026-10-22T17:00:00Z'},'directorA');record('VISIT-DIRECTOR-SCHEDULE',st==200,{'status':st})
if st==200:
    vid=data['id'];st,data=rpc('start_caregiver_visit',{'p_visit_id':vid});record('VISIT-START',st==200 and bool(data.get('actual_start')),{'status':st})
    st,data=rpc('end_caregiver_visit',{'p_visit_id':vid});record('DEFECT-VISIT-NOTES-NOT-REQUIRED',st==200 and data.get('visit_notes') is None,{'status':st,'database':sql(f"SELECT status||'|'||(visit_notes IS NULL)::text FROM public.caregiver_visits WHERE id='{vid}';")})

c['ordinary_note_id']=ordinary['id'];c['invite_id']=invite['id'];CONFIG.write_text(json.dumps(c))
