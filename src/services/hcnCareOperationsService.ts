import {supabase} from '@/lib/supabase';

export const PREVISIT_SECTIONS = [
  {id:'patient_updates',label:'Patient-reported updates, wellness and recent notes'},
  {id:'care_plan',label:'Current care plan, tasks and visit needs'},
  {id:'medications',label:'Medication list and reported changes (no treatment decisions)'},
  {id:'healthcare_contacts',label:'Healthcare contacts, hospital and escalation instructions'},
  {id:'handoffs',label:'Shift handoffs and outstanding messages'},
] as const;
export const PREVISIT_ATTESTATION =
  'I reviewed the available records and understand that this acknowledgment does not authorize clinical decisions.';

export type CareEscalation = {
  id:string;organizationId:string;patientId:string;createdBy:string;
  reason:string;urgency:'routine'|'priority'|'urgent';
  status:'director_pending'|'clinical_review_requested'|'clinical_reviewed'|'resolved';
  createdAt:string;directorNote:string|null;clinicalNote:string|null;
  resolutionNote:string|null;
};

const rpcError=(error:{message:string}|null,fallback:string)=>error?.message??fallback;

export async function acknowledgePrevisit(visitId:string,sections:string[]){
  const {data,error}=await supabase.rpc('hcn_acknowledge_previsit',{
    p_visit_id:visitId,p_sections:sections,p_attestation:PREVISIT_ATTESTATION,
  });
  return {id:data,error:error?.message??null};
}
export async function previsitIsCurrent(visitId:string){
  const {data,error}=await supabase.rpc('hcn_is_previsit_current',{p_visit_id:visitId});
  return {current:data===true,error:error?.message??null};
}
export async function getCareEscalations(orgId:string,patientId?:string){
  let query=supabase.from('hcn_care_escalations')
    .select('id,organization_id,patient_id,created_by,reason,urgency,status,created_at,director_note,clinical_note,resolution_note')
    .eq('organization_id',orgId).order('created_at',{ascending:false}).limit(100);
  if(patientId) query=query.eq('patient_id',patientId);
  const {data,error}=await query;
  if(error) return {data:null as CareEscalation[]|null,error:rpcError(error,'Unable to load escalations')};
  return {data:(data??[]).map(r=>({
    id:r.id,organizationId:r.organization_id,patientId:r.patient_id,createdBy:r.created_by,
    reason:r.reason,urgency:r.urgency as CareEscalation['urgency'],
    status:r.status as CareEscalation['status'],
    createdAt:r.created_at,directorNote:r.director_note,clinicalNote:r.clinical_note,
    resolutionNote:r.resolution_note,
  })),error:null as string|null};
}
export async function submitCareEscalation(orgId:string,patientId:string,reason:string,urgency:CareEscalation['urgency']){
  const {data,error}=await supabase.rpc('hcn_submit_care_escalation',{
    p_org_id:orgId,p_patient_id:patientId,p_reason:reason,p_urgency:urgency,
  });
  return {id:data,error:error?.message??null};
}
export async function triageCareEscalation(id:string,action:'request_clinical_review'|'resolve_nonclinical',note:string){
  const {data,error}=await supabase.rpc('hcn_director_triage_escalation',{p_id:id,p_action:action,p_note:note});
  return {ok:data===true,error:error?.message??null};
}
export async function clinicianReviewEscalation(id:string,note:string){
  const {data,error}=await supabase.rpc('hcn_clinician_review_escalation',{p_id:id,p_note:note});
  return {ok:data===true,error:error?.message??null};
}
export async function closeCareEscalation(id:string,note:string){
  const {data,error}=await supabase.rpc('hcn_director_close_escalation',{p_id:id,p_note:note});
  return {ok:data===true,error:error?.message??null};
}
