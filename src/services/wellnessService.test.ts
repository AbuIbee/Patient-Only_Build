import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({getUser:vi.fn(),insert:vi.fn(),select:vi.fn(),single:vi.fn()}));
vi.mock('@/lib/supabase',()=>({supabase:{auth:{getUser:m.getUser},from:()=>({insert:m.insert})}}));
import {recordWellness,wellnessSourceLabel} from './wellnessService';
describe('wellness confirmation and source semantics',()=>{
  beforeEach(()=>{
    vi.clearAllMocks();m.getUser.mockResolvedValue({data:{user:{id:'actor'}},error:null});
    m.insert.mockReturnValue({select:m.select});m.select.mockReturnValue({single:m.single});
  });
  it('does not submit a claimed author and requires the returned authenticated author',async()=>{
    m.single.mockResolvedValue({data:{patient_id:'patient',author_user_id:'actor',author_role:'caregiver',entry_source:'caregiver_observed',organization_id:'org',created_at:'2026-11-07'},error:null});
    expect((await recordWellness({patientId:'patient',organizationId:'org',source:'caregiver_observed',mood:'calm',intensity:5})).error).toBeNull();
    expect(m.insert.mock.calls[0][0]).not.toHaveProperty('author_user_id');
    expect(m.insert.mock.calls[0][0]).not.toHaveProperty('created_at');
  });
  it('rejects false success when backend returns another author',async()=>{
    m.single.mockResolvedValue({data:{patient_id:'patient',author_user_id:'other',entry_source:'patient_reported',created_at:'today'},error:null});
    expect((await recordWellness({patientId:'patient',source:'patient_reported',mood:'calm',intensity:5})).error).toContain('attribution');
  });
  it('does not show success or issue a write when identity verification fails',async()=>{
    m.getUser.mockRejectedValue(new Error('offline'));
    expect((await recordWellness({patientId:'patient',source:'patient_reported',mood:'calm',intensity:5})).error).toContain('could not be confirmed');
    expect(m.insert).not.toHaveBeenCalled();
  });
  it.each([null,'caregiver'])('does not confirm a patient report with an invalid returned role: %s',async role=>{
    m.single.mockResolvedValue({data:{patient_id:'patient',author_user_id:'actor',author_role:role,entry_source:'patient_reported',created_at:'today'},error:null});
    expect((await recordWellness({patientId:'patient',source:'patient_reported',mood:'calm',intensity:5})).error).toContain('attribution');
  });
  it('distinguishes staff observation and historical uncertainty from patient self-report',()=>{
    expect(wellnessSourceLabel('caregiver_observed')).toBe('Caregiver observation');
    expect(wellnessSourceLabel('patient_reported')).toBe('Patient report');
    expect(wellnessSourceLabel('legacy_unattributed')).toContain('not verified');
  });
});
