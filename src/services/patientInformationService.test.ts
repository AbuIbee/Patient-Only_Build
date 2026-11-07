import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mock.rpc } }));
import { loadPatientInformation, savePatientInformation } from './patientInformationService';

const valid = {patient:{id:'patient-1',first_name:'Mary'},intake:{},details:{},
  representatives:[],providers:[],diagnoses:[],allergies:[],care_plans:[],as_of:'2026-11-06T00:00:00Z'};

describe('patient information and record search security contracts',()=>{
  beforeEach(()=>mock.rpc.mockReset());
  it('uses patient and org scoped RPC; does not select unrestricted tables',async()=>{
    mock.rpc.mockResolvedValue({data:valid,error:null});
    const result=await loadPatientInformation('org-1','patient-1');
    expect(result.error).toBeNull();
    expect(result.data?.patient.id).toBe('patient-1');
    expect(mock.rpc).toHaveBeenCalledWith('hcn_get_patient_information',{
      p_org_id:'org-1',p_patient_id:'patient-1'
    });
  });
  it('fails closed if RPC returns a different patient',async()=>{
    mock.rpc.mockResolvedValue({data:{...valid,patient:{id:'patient-2'}},error:null});
    expect((await loadPatientInformation('org-1','patient-1')).error).toContain('mismatch');
  });
  it('returns permission denial, not an empty dossier',async()=>{
    mock.rpc.mockResolvedValue({data:null,error:{message:'Not authorized for patient information'}});
    const response=await loadPatientInformation('org-1','patient-1');
    expect(response.data).toBeNull();
    expect(response.error).toContain('Not authorized');
  });
  it('edits only approved fields, requires server-side optimistic version and verifies response',async()=>{
    mock.rpc.mockResolvedValue({data:{patient_id:'patient-1',organization_id:'org-1',version:8},error:null});
    const result=await savePatientInformation('org-1','patient-1',{mobile_phone:'555-0199'},7);
    expect(result.version).toBe(8);
    expect(mock.rpc).toHaveBeenCalledWith('hcn_save_patient_information',{
      p_org_id:'org-1',p_patient_id:'patient-1',p_changes:{mobile_phone:'555-0199'},p_expected_version:7
    });
  });
  it('does not send unknown or unbounded fields to server',async()=>{
    const bad=await savePatientInformation('org-1','patient-1',{patient_email:'x'.repeat(2100)},null);
    expect(bad.error).toContain('Invalid');
    const unknown=await savePatientInformation('org-1','patient-1',{bypass:true} as never,null);
    expect(unknown.error).toContain('Invalid');
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});
