import { supabase } from '@/lib/supabase';
import type { MoodType } from '@/types';

/** Category is a request; the database independently determines author/role/source. */
export async function recordWellness(input:{patientId:string;organizationId?:string|null;
  source:'patient_reported'|'caregiver_observed'|'professional_observed';mood:MoodType;intensity:number;note?:string|null;
  timeOfDay?:'morning'|'afternoon'|'evening'|'night'}) {
  try {
  const {data:identity,error:identityError}=await supabase.auth.getUser();
  if(identityError||!identity.user)return {data:null,error:'Sign in before recording wellness.'};
  const {data,error}=await supabase.from('mood_entries').insert({
    patient_id:input.patientId,organization_id:input.organizationId??null,entry_source:input.source,
    mood:input.mood,intensity:input.intensity,note:input.note??null,time_of_day:input.timeOfDay??null,
    recorded_by:'pending_server_attribution',
  }).select('*').single();
  if(error)return {data:null,error:error.message};
  const roles=input.source==='patient_reported'?['patient']:input.source==='caregiver_observed'?['caregiver']:
    ['medical_professional','therapist','clinical_supervisor'];
  if(!data||data.patient_id!==input.patientId||data.author_user_id!==identity.user.id||!roles.includes(data.author_role??'')||
    data.entry_source!==input.source||!data.created_at||
    (input.organizationId&&data.organization_id!==input.organizationId))
    return {data:null,error:'Save attribution could not be confirmed. Refresh before retrying.'};
  return {data,error:null};
  } catch {
    return {data:null,error:'Wellness save could not be confirmed. Refresh before retrying.'};
  }
}

export function wellnessSourceLabel(source?:string|null) {
  return source==='patient_reported'?'Patient report':source==='caregiver_observed'?'Caregiver observation':
    source==='professional_observed'?'Professional observation':'Historical entry — author not verified';
}
