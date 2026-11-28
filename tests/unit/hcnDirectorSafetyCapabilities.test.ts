import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { OrgVisit } from '../../src/services/organizationDirectorOpsService';
import type { DashboardSources } from '../../src/services/hcnDirectorDashboardSources';
import type { HandoffReceipt, RequiredCareSlot, CaregiverAssistanceAlert } from '../../src/services/hcnDirectorSafetyService';
import {
  getUpcomingScheduleConflicts, getUnscheduledCareRequirements,
  getUnacknowledgedHandoffReceipts,
} from '../../src/services/hcnDirectorDashboardInsights';
import { buildAttentionRows } from '../../src/pages/enterprise/DirectorCommandCenter';

const NOW = Date.parse('2026-11-28T15:00:00.000Z');
const staff = [
  { userId:'care-a',orgRole:'caregiver',status:'active',firstName:'Sample',lastName:'One' },
  { userId:'care-b',orgRole:'caregiver',status:'active',firstName:'Sample',lastName:'Two' },
];
const assigned = [{ user_id:'care-a',patient_id:'patient-a',org_role:'caregiver',is_active:true }];
function visit(id:string,start:string,end:string,extra:Partial<OrgVisit>={}): OrgVisit {
  return {
    id, caregiverId:'care-a',patientId:'patient-a',caregiverName:'Sample One',
    patientName:'Fictional Patient',status:'scheduled',scheduledStart:start,scheduledEnd:end,
    actualStart:null,actualEnd:null,visitNotes:null,...extra,
  };
}
function required(id:string,start:string,end:string,status:'required'|'cancelled'='required'): RequiredCareSlot {
  return { id,organization_id:'org-a',patient_id:'patient-a',starts_at:start,ends_at:end,
    requirement_note:'Required fictional caregiver visit',status,created_at:'2026-11-28T14:00:00Z' };
}
function handoff(id:string,visitId:string,due:string,acknowledged_at:string|null=null): HandoffReceipt {
  return {
    id,organization_id:'org-a',patient_id:'patient-a',handoff_id:'h-'+id,
    incoming_caregiver_id:'care-a',incoming_visit_id:visitId,
    outgoing_caregiver_id:'care-b',handoff_created_at:'2026-11-28T14:00:00Z',
    handoff_summary:'Review fictional care priorities',
    acknowledge_by:due,acknowledged_at,
  };
}

describe('HCN five Director safety capabilities',()=>{
  it('detects genuine same-caregiver overlapping windows, not adjacent or other staff',()=>{
    const a=visit('a','2026-11-28T16:00:00Z','2026-11-28T17:00:00Z');
    const b=visit('b','2026-11-28T16:30:00Z','2026-11-28T17:30:00Z');
    const adjacent=visit('c','2026-11-28T17:30:00Z','2026-11-28T18:00:00Z');
    const other=visit('d','2026-11-28T16:30:00Z','2026-11-28T17:30:00Z',{caregiverId:'care-b'});
    const cancelled=visit('e','2026-11-28T16:45:00Z','2026-11-28T17:00:00Z',{status:'canceled'});
    const conflicts=getUpcomingScheduleConflicts([a,b,adjacent,other,cancelled],NOW);
    expect(conflicts).toHaveLength(1);
    expect([conflicts[0].first.id,conflicts[0].second.id]).toEqual(['a','b']);
  });
  it('detects overlaps beyond the legacy 50-row sample, and ignores past/future intervals',()=>{
    const future=Array.from({length:100},(_,i)=>visit('future-'+i,
      '2026-11-30T23:00:00Z','2026-12-01T00:00:00Z',{caregiverId:'other-'+i}));
    const pair=[
      visit('first','2026-11-28T15:30:00Z','2026-11-28T16:30:00Z'),
      visit('second','2026-11-28T16:15:00Z','2026-11-28T16:45:00Z'),
    ];
    expect(getUpcomingScheduleConflicts([...future,...pair],NOW)).toHaveLength(1);
  });
  it('flags a required slot with no visit, with partial coverage or invalid caregiver assignment',()=>{
    const slot=required('req','2026-11-28T16:00:00Z','2026-11-28T17:00:00Z');
    const partial=visit('part','2026-11-28T16:00:00Z','2026-11-28T16:15:00Z');
    const full=visit('full','2026-11-28T16:00:00Z','2026-11-28T17:00:00Z');
    expect(getUnscheduledCareRequirements([slot],[],staff,assigned,NOW)).toHaveLength(1);
    expect(getUnscheduledCareRequirements([slot],[partial],staff,assigned,NOW)).toHaveLength(1);
    expect(getUnscheduledCareRequirements([slot],[full],staff,[],NOW)).toHaveLength(1);
    expect(getUnscheduledCareRequirements([slot],[full],[{...staff[0],status:'invited'}],assigned,NOW)).toHaveLength(1);
    expect(getUnscheduledCareRequirements([slot],[full],staff,assigned,NOW)).toHaveLength(0);
    const firstHalf=visit('one','2026-11-28T16:00:00Z','2026-11-28T16:30:00Z');
    const secondHalf=visit('two','2026-11-28T16:30:00Z','2026-11-28T17:00:00Z',{caregiverId:'care-b'});
    const bothAssigned=[...assigned,{user_id:'care-b',patient_id:'patient-a',org_role:'caregiver',is_active:true}];
    expect(getUnscheduledCareRequirements([slot],[firstHalf,secondHalf],staff,bothAssigned,NOW)).toHaveLength(0);
    const gap=visit('gap','2026-11-28T16:31:00Z','2026-11-28T17:00:00Z');
    expect(getUnscheduledCareRequirements([slot],[firstHalf,gap],staff,assigned,NOW)).toHaveLength(1);
  });
  it('does not fabricate care requirements from visits and honors cancelled or past slots',()=>{
    const slots=[
      required('cancelled','2026-11-28T16:00:00Z','2026-11-28T17:00:00Z','cancelled'),
      required('past','2026-11-27T16:00:00Z','2026-11-27T17:00:00Z'),
      required('beyond','2026-12-03T16:00:00Z','2026-12-03T17:00:00Z'),
    ];
    expect(getUnscheduledCareRequirements(slots,[],staff,assigned,NOW)).toHaveLength(0);
  });
  it('shows expected incoming caregiver handoffs from 30 minutes before shift, unless acknowledged or canceled',()=>{
    const shift=visit('shift','2026-11-28T15:25:00Z','2026-11-28T16:25:00Z');
    const receipt=handoff('r','shift','2026-11-28T15:25:00Z');
    expect(getUnacknowledgedHandoffReceipts([receipt],[shift],NOW)).toHaveLength(1);
    expect(getUnacknowledgedHandoffReceipts([{...receipt,acknowledge_by:'2026-11-28T15:31:00Z'}],[shift],NOW)).toHaveLength(0);
    expect(getUnacknowledgedHandoffReceipts([handoff('acked','shift','2026-11-28T15:25:00Z','2026-11-28T14:59:00Z')],[shift],NOW)).toHaveLength(0);
    expect(getUnacknowledgedHandoffReceipts([receipt],[{...shift,status:'canceled'}],NOW)).toHaveLength(0);
  });
  it('sorts caregiver assistance above all other alerts and embeds all five in one queue',()=>{
    const safetyAlert:CaregiverAssistanceAlert={
      id:'help-1',organization_id:'org-a',patient_id:'patient-a',created_by:'care-a',
      reason:'Fictional immediate help needed',status:'open',created_at:'2026-11-28T14:55:00Z',
      acknowledged_by:null,acknowledged_at:null,contacted_by:null,contacted_at:null,
      contact_method:null,contact_note:null,resolved_by:null,resolved_at:null,resolution_note:null,
    };
    const visits=[
      visit('clash1','2026-11-28T15:20:00Z','2026-11-28T16:20:00Z'),
      visit('clash2','2026-11-28T15:30:00Z','2026-11-28T16:30:00Z'),
    ];
    const data={visits:{data:visits,error:null},assignments:{data:assigned,error:null},
      activeVisits:{data:[],error:null},credentials:{data:[],error:null},acknowledgments:{data:[],error:null},
      clinicalRequests:{data:[],error:null},coordinationTasks:{data:[],error:null},
      escalations:{data:[],error:null},incidents:{data:[],error:null},
      urgentConversations:{data:[],error:null},refreshedAt:NOW,
      safety:{assistance:{data:[safetyAlert],error:null},
        requiredCare:{data:[required('req','2026-11-28T15:30:00Z','2026-11-28T16:50:00Z')],error:null},
        handoffReceipts:{data:[handoff('h','clash1','2026-11-28T15:20:00Z')],error:null}},
    } as DashboardSources;
    const rows=buildAttentionRows(data,staff.map(p=>({...p,email:'',id:p.userId,organizationId:'org-a'})) as never,[], 'UTC',NOW);
    expect(rows[0].category).toBe('assistance');
    expect(rows.some(r=>r.id==='requirement:req')).toBe(true);
    expect(rows.some(r=>r.id.startsWith('conflict:'))).toBe(true);
    expect(rows.some(r=>r.id==='handoff:h')).toBe(true);
    expect(rows.some(r=>r.id.startsWith('visit:'))).toBe(false);
  });
  it('preserves homepage webparts and uses exact record navigation, not another dashboard panel',()=>{
    const path=(p:string)=>readFileSync(resolve(process.cwd(),p),'utf8');
    const home=path('src/pages/enterprise/OrganizationDirectorDashboard.tsx');
    const queue=path('src/pages/enterprise/DirectorCommandCenter.tsx');
    const care=path('src/pages/enterprise/EnterpriseCaregiverDashboard.tsx');
    const operations=path('src/pages/enterprise/DirectorAttendancePanel.tsx');
    const schedule=path('src/pages/enterprise/DirectorScheduleCalendar.tsx');
    expect(home.indexOf('Director Quick Actions')).toBeLessThan(home.indexOf('Needs Your Attention'));
    expect(home.indexOf('Recent Staff Activity')).toBeLessThan(home.indexOf('<DirectorCommandCenter'));
    expect(home).toContain('onOpenScheduleRecord={onOpenScheduleRecord}');
    expect(home).toContain('focusedVisitId={focusedVisitId}');
    expect(queue).toContain('DirectorAssistanceActions');
    expect(queue).toContain("category: 'assistance'");
    expect(queue).toContain("category: 'handoffs'");
    expect(queue).toContain("category: 'conflicts'");
    expect(queue).not.toContain('Director Operational Command Center');
    expect(care).toContain('<CaregiverAssistanceAction');
    expect(operations).toContain('focused={focusedVisitId === visit.id}');
    expect(schedule).toContain('Selected scheduling issue'); // destination-focused schedule contract
    expect(schedule).toContain('Define required patient care before assigning visits');
  });
  it('requires RLS and separately grants only safe writes; all Director changes are audited',()=>{
    const migration=readFileSync(resolve(process.cwd(),
      'supabase/migrations/20261128110000_hcn_director_assistance_coverage_and_handoff.sql'),'utf8');
    for(const table of ['hcn_caregiver_assistance_alerts','hcn_required_care_slots','hcn_handoff_receipt_targets','hcn_director_visit_actions'])
      expect(migration).toContain('ALTER TABLE public.'+table+' ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('hcn_private.current_staff_patient_v1');
    expect(migration).toContain('hcn_private.current_director_patient_v1');
    expect(migration).toContain('REVOKE ALL ON public.hcn_required_care_slots');
    expect(migration).toContain('hcn_director_action_assistance_alert');
    expect(migration).toContain('hcn_director_cancel_scheduled_visit');
  });
});
