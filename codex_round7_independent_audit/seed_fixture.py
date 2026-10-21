from audit_runtime import *
import uuid

c=config();u={name:value['id'] for name,value in c['users'].items()}
A='aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';B='bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'
statements=["SET search_path=public,extensions;", "UPDATE profiles SET must_change_password=false,provisioning_status='complete';",f"UPDATE profiles SET role='therapist' WHERE id='{u['therapist']}';"]
for org,name,director in [(A,'Codex Audit Org Alpha','directorA'),(B,'Codex Audit Org Beta','directorB')]:
    statements.append(f"INSERT INTO organizations(id,name,package_type,created_by) VALUES('{org}','{name}','integrated_care','{u[director]}');")
    statements.append(f"INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,status) VALUES('{org}',20,20,'active');")
for user,org,role in [('directorA',A,'director'),('directorB',B,'director'),('caregiverA',A,'caregiver'),('caregiverB',B,'caregiver'),('medical',A,'medical_professional')]:
    statements.append(f"INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('{org}','{u[user]}','{role}','active');")
for user,org,director,label in [('patientA',A,'directorA','AlphaPatient'),('patientB',B,'directorB','BetaPatient')]:
    statements.append(f"INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES('{u[user]}','Audit','{label}','{label}','123 Synthetic Avenue','Audit Facility');")
    statements.append(f"INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('{org}','{u[user]}','active','{u[director]}');")
for user,org,patient,role,director in [('caregiverA',A,'patientA','caregiver','directorA'),('caregiverB',B,'patientB','caregiver','directorB'),('medical',A,'patientA','medical_professional','directorA')]:
    statements.append(f"INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES('{org}','{u[user]}','{u[patient]}','{role}',true,'{u[director]}');")
statements += [
f"INSERT INTO caregiver_credentials(user_id,organization_id,credential_name,issued_at,expires_at) VALUES('{u['caregiverA']}','{A}','AUDIT Dementia Care Certificate','2026-01-01','2026-12-31');",
f"INSERT INTO tasks(patient_id,title,status,is_active,status_updated_by,status_updated_at) VALUES('{u['patientA']}','AUDIT unfinished care list','pending',true,'{u['caregiverA']}',now()),('{u['patientA']}','AUDIT completed task','completed',true,'{u['caregiverA']}',now()-interval '1 hour'),('{u['patientB']}','FOREIGN task must stay hidden','pending',true,'{u['caregiverB']}',now());",
f"INSERT INTO patient_notes(patient_id,author_id,note,note_type) VALUES('{u['patientA']}','{u['caregiverA']}','AUDIT ordinary note original','general');",
f"INSERT INTO patient_intake(id,patient_profile_id,created_by,patient_first_name,patient_last_name,patient_dementia_stage,patient_diagnosis_date,patient_street_address,patient_city,patient_state,patient_zip_code,patient_phone,patient_email,preferred_hospital,doctor_therapist_name,doctor_therapist_phone,caregiver_name,caregiver_relationship,caregiver_phone,medications_and_dosage,emergency_contact_full_name,emergency_contact_phone,emergency_contact_email,emergency_contact_relationship,intake_completed) VALUES(gen_random_uuid(),'{u['patientA']}','{u['patientA']}','Audit','AlphaPatient','moderate','2025-05-01','100 Intake Lane','FixtureCity','NY','10000','555-0100','intake@audit.invalid','AUDIT Intake Hospital','AUDIT Dr Provider','555-0101','AUDIT Intake Caregiver','daughter','555-0102','AUDIT medication 5mg daily','AUDIT Emergency Person','555-0103','emergency@audit.invalid','son',true);",
f"INSERT INTO mood_entries(patient_id,mood,intensity,note,triggers,recorded_by,timestamp) SELECT '{u['patientA']}','calm',5,'AUDIT mood '||lpad(n::text,2,'0'),ARRAY['AUDIT trigger'],'enterprise_staff',now()-n*interval '1 hour' FROM generate_series(1,15)n;",
]
for delta,label in [(0,'today'),(1,'tomorrow'),(-1,'yesterday')]:
    statements.append(f"INSERT INTO caregiver_visits(organization_id,patient_id,caregiver_id,scheduled_start,scheduled_end,status) VALUES('{A}','{u['patientA']}','{u['caregiverA']}',date_trunc('day',now())+interval '{delta} day'+interval '16 hours',date_trunc('day',now())+interval '{delta} day'+interval '17 hours','scheduled');")
statements.append(f"INSERT INTO caregiver_visits(organization_id,patient_id,caregiver_id,scheduled_start,scheduled_end,status,actual_start,actual_end) VALUES('{A}','{u['patientA']}','{u['caregiverA']}',now()-interval '2 days',now()-interval '47 hours','completed',now()-interval '2 days',now()-interval '47 hours');")
sql("DELETE FROM organizations WHERE id IN ('"+A+"','"+B+"'); DELETE FROM patients WHERE id IN ('"+u['patientA']+"','"+u['patientB']+"');"); sql('BEGIN;\n'+'\n'.join(statements)+'\nCOMMIT;');c['orgA']=A;c['orgB']=B;CONFIG.write_text(json.dumps(c));print('Synthetic fixture seeded; source/existing databases untouched')
