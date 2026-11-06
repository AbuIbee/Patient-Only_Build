import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/supabase';

export type PatientInformationDetails = {
  version?: number | null;
  patient_email?: string | null;
  home_phone?: string | null; mobile_phone?: string | null;
  street_address?: string | null; city?: string | null; state?: string | null; postal_code?: string | null;
  medical_care_needs?: string | null; mental_health_needs?: string | null; physical_care_needs?: string | null;
  additional_emergency_name?: string | null; additional_emergency_relationship?: string | null;
  additional_emergency_phone?: string | null; additional_emergency_mobile?: string | null;
  additional_emergency_email?: string | null;
};
export interface PatientInformationSnapshot {
  patient: Record<string,string|null>;
  intake: Record<string,string|null>;
  details: PatientInformationDetails;
  representatives: Array<Record<string,string|null>>;
  providers: Array<Record<string,string|boolean|null>>;
  diagnoses: Array<Record<string,string|null>>;
  allergies: Array<Record<string,string|null>>;
  care_plans: Array<Record<string,string|null>>;
  as_of: string;
}
export async function loadPatientInformation(orgId:string,patientId:string):
  Promise<{data:PatientInformationSnapshot|null;error:string|null}> {
  if(!orgId||!patientId) return {data:null,error:'Patient and organization are required.'};
  try {
    const {data,error}=await supabase.rpc('hcn_get_patient_information',{p_org_id:orgId,p_patient_id:patientId});
    if(error) return {data:null,error:error.message};
    if(!data || typeof data!=='object'||Array.isArray(data)) return {data:null,error:'Invalid patient response.'};
    const d=data as unknown as PatientInformationSnapshot;
    if(d.patient?.id!==patientId||!Array.isArray(d.providers)||!Array.isArray(d.representatives)||
      !Array.isArray(d.diagnoses)||!Array.isArray(d.allergies)||!Array.isArray(d.care_plans))
      return {data:null,error:'Patient record mismatch.'};
    return {data:{...d,intake:d.intake??{},details:d.details??{}},error:null};
  } catch {return {data:null,error:'Patient information could not be loaded. Retry.'};}
}
const allowed=new Set(['patient_email','home_phone','mobile_phone','street_address','city','state','postal_code',
  'medical_care_needs','mental_health_needs','physical_care_needs','additional_emergency_name',
  'additional_emergency_relationship','additional_emergency_phone','additional_emergency_mobile','additional_emergency_email']);
export async function savePatientInformation(orgId:string,patientId:string,changes:Partial<PatientInformationDetails>,
  expectedVersion:number|null):Promise<{version:number|null;error:string|null}> {
  if(!orgId||!patientId||!Object.keys(changes).length) return {version:null,error:'No changes supplied.'};
  if(Object.entries(changes).some(([k,v])=>!allowed.has(k)||(v!=null&&(typeof v!=='string'||v.length>2000))))
    return {version:null,error:'Invalid patient information field.'};
  try {
    const {data,error}=await supabase.rpc('hcn_save_patient_information',{
      p_org_id:orgId,p_patient_id:patientId,p_changes:changes as Json,p_expected_version:expectedVersion,
    });
    if(error) return {version:null,error:error.message};
    if(!data||typeof data!=='object'||Array.isArray(data)) return {version:null,error:'Unconfirmed save.'};
    const d=data as {patient_id?:unknown;organization_id?:unknown;version?:unknown};
    if(d.patient_id!==patientId||d.organization_id!==orgId||typeof d.version!=='number')
      return {version:null,error:'Save result does not match this patient.'};
    return {version:d.version,error:null};
  } catch {return {version:null,error:'Save result uncertain. Refresh before retrying.'};}
}
