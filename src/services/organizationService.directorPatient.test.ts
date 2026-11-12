import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  invoke: vi.fn(), rpc: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: mock.invoke }, rpc: mock.rpc, from: mock.from },
}));
import { createDirectorPatient, assignCaregiverToPatient,
  unassignCaregiverFromPatient, getOrgMembers } from './organizationService';

describe('HCN Director-controlled patient enrollment and employee inventory', () => {
  beforeEach(() => {
    mock.invoke.mockReset(); mock.rpc.mockReset(); mock.from.mockReset();
    mock.select.mockReset(); mock.eq.mockReset();
    mock.from.mockReturnValue({ select: mock.select });
    mock.select.mockReturnValue({ eq: mock.eq });
    mock.eq.mockImplementation((_column: string, _value: unknown) => ({
      eq: mock.eq,
    }));
    // The second .eq() ends the fluent query chain.
    mock.eq.mockImplementationOnce(() => ({ eq: mock.eq }));
    mock.eq.mockResolvedValue({data:[],error:null});
  });

  it('shows invited staff with readable names and email in the manager inventory', async () => {
    mock.rpc.mockResolvedValue({
      error:null,data:[{
        id:'mem1', user_id:'caregiver1',org_role:'caregiver',
        status:'invited',created_at:'2026-11-04',
        first_name:'Jamie', last_name:'Green',email:'jamie@example.test',
      }],
    });
    const members=await getOrgMembers('org1');
    expect(mock.rpc).toHaveBeenCalledWith('hcn_get_org_staff_roster',{p_org_id:'org1'});
    expect(members[0]).toMatchObject({
      userId:'caregiver1',status:'invited',firstName:'Jamie',
      lastName:'Green',email:'jamie@example.test',
    });
  });

  it('fails closed on denied inventory access; never reports zero staff', async () => {
    mock.rpc.mockResolvedValue({data:null,error:{message:'Forbidden organization'}});
    await expect(getOrgMembers('org1')).rejects.toThrow('Forbidden organization');
  });

  it('uses only the protected backend for patient signup and returns a patient reference', async () => {
    mock.invoke.mockResolvedValue({
      data:{success:true,patientId:'patient1',
        message:'Patient created. No caregiver access.'},error:null,
    });
    const result=await createDirectorPatient('org1',' Alex ',' Smith ',' ALEX@EXAMPLE.TEST ');
    expect(mock.invoke).toHaveBeenCalledWith('hcn-director-create-patient',{
      body:{organizationId:'org1',firstName:'Alex',lastName:'Smith',
        email:'alex@example.test',dateOfBirth:null},
    });
    expect(result).toMatchObject({patientId:'patient1',
      alreadyEnrolled:false,error:null});
  });

  it('never claims creation when email service reports a rate limit', async () => {
    mock.invoke.mockResolvedValue({
      data:null,error:{message:'FunctionsHttpError',
        context:{clone:()=>({json:async()=>({error:'SMTP rate limit reached'})})}},
    });
    const result=await createDirectorPatient('org1','Alex','Smith','alex@example.test');
    expect(result.patientId).toBeNull();
    expect(result.error).toContain('SMTP rate limit reached');
  });

  it('creates only the exact authorized caregiver-to-patient assignment', async () => {
    mock.rpc.mockResolvedValue({data:{id:'assignment1'},error:null});
    expect(await assignCaregiverToPatient('org1','caregiver1','patient1'))
      .toEqual({error:null});
    expect(mock.rpc).toHaveBeenCalledWith('hcn_assign_caregiver_to_patient',{
      p_org_id:'org1',p_caregiver_id:'caregiver1',p_patient_id:'patient1',
    });
  });

  it('returns server denial instead of granting assignment to an invited caregiver', async () => {
    mock.rpc.mockResolvedValue({data:null,error:{message:'Caregiver must complete password activation'}});
    const res=await assignCaregiverToPatient('org1','pending1','patient1');
    expect(res.error).toContain('password activation');
  });

  it('revokes a specific assignment without changing other patient links', async () => {
    mock.rpc.mockResolvedValue({data:true,error:null});
    expect(await unassignCaregiverFromPatient('org1','caregiver1','patient1'))
      .toEqual({error:null});
    expect(mock.rpc).toHaveBeenCalledWith('hcn_unassign_caregiver_from_patient',{
      p_org_id:'org1',p_caregiver_id:'caregiver1',p_patient_id:'patient1',
    });
  });
});