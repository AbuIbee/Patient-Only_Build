import {useCallback,useEffect,useMemo,useState} from 'react';
import {CalendarDays,ChevronLeft,ChevronRight,Loader2,Printer} from 'lucide-react';
import {toast} from 'sonner';
import {getOrgStaffPatientAssignments,type OrgCoveredPatient,type OrgMembershipRow,type StaffPatientAssignment} from '@/services/organizationService';
import {getOrgVisitsWindow,scheduleAssignedCaregiverVisit,type OrgVisit} from '@/services/organizationDirectorOpsService';

type CalendarMode='month'|'week'|'day';
type RepeatMode='once'|'daily'|'weekly';
const dateKey=(d:Date)=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const localDate=(key:string)=>new Date(key+'T12:00:00');
const addDays=(d:Date,n:number)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;};
const startOfWeek=(d:Date)=>addDays(d,-d.getDay());
const dateTime=(d:Date)=>dateKey(d)+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
const formatDate=(d:Date)=>d.toLocaleDateString(undefined,{month:'long',year:'numeric'});
const formatShort=(d:Date)=>d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
const cls='w-full rounded-xl border border-ent-line bg-white px-3 py-2 text-sm text-ent-ink';
interface Props {
  orgId:string; patients:OrgCoveredPatient[];
  members:Array<OrgMembershipRow & {firstName:string;lastName:string;email:string}>;
  onChanged:()=>void;
}
export default function DirectorScheduleCalendar({orgId,patients,members,onChanged}:Props){
  const [mode,setMode]=useState<CalendarMode>('month');
  const [anchor,setAnchor]=useState(()=>new Date());
  const [visits,setVisits]=useState<OrgVisit[]>([]);
  const [loading,setLoading]=useState(true);
  const [readError,setReadError]=useState<string|null>(null);
  const [assignments,setAssignments]=useState<StaffPatientAssignment[]>([]);
  const [assignmentsReady,setAssignmentsReady]=useState(false);
  const [assignmentError,setAssignmentError]=useState<string|null>(null);
  const [patientId,setPatientId]=useState('');
  const [caregiverIds,setCaregiverIds]=useState<string[]>([]);
  const [startTime,setStartTime]=useState('09:00');
  const [endTime,setEndTime]=useState('10:00');
  const [repeat,setRepeat]=useState<RepeatMode>('once');
  const [occurrences,setOccurrences]=useState(4);
  const [saving,setSaving]=useState(false);
  const [statusFilter,setStatusFilter]=useState('all');
  const [staffFilter,setStaffFilter]=useState('all');
  const startDay=mode==='month'?new Date(anchor.getFullYear(),anchor.getMonth(),1):
    mode==='week'?startOfWeek(anchor):new Date(anchor.getFullYear(),anchor.getMonth(),anchor.getDate());
  const endDay=mode==='month'?new Date(anchor.getFullYear(),anchor.getMonth()+1,1):
    addDays(startDay,mode==='week'?7:1);
  const gridStart=mode==='month'?startOfWeek(startDay):startDay;
  const gridEnd=mode==='month'?addDays(startOfWeek(addDays(endDay,6)),7):endDay;
  const rangeStart=dateKey(gridStart)+'T00:00:00';
  const rangeEnd=dateKey(gridEnd)+'T00:00:00';
  const load=useCallback(async()=>{
    setLoading(true);const result=await getOrgVisitsWindow(orgId,new Date(rangeStart).toISOString(),new Date(rangeEnd).toISOString());
    setVisits(result.data??[]);setReadError(result.error);setLoading(false);
  },[orgId,rangeStart,rangeEnd]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{
    let active=true;setAssignmentsReady(false);
    getOrgStaffPatientAssignments(orgId).then(rows=>{if(active){setAssignments(rows);setAssignmentError(null);}})
      .catch(()=>{if(active){setAssignmentError('Cannot confirm caregiver assignments.');setAssignments([]);}})
      .finally(()=>{if(active)setAssignmentsReady(true);});
    return ()=>{active=false;};
  },[orgId]);
  const eligible=useMemo(()=>assignments.filter(a=>
    a.patientId===patientId && a.orgRole==='caregiver' && a.isActive &&
    members.some(m=>m.userId===a.userId && m.orgRole==='caregiver' && m.status==='active')),
    [assignments,members,patientId]);
  const eligibleIds=eligible.map(a=>a.userId);
  const selectedIds=caregiverIds.filter(id=>eligibleIds.includes(id));
  const caregiverName=(id:string)=>{
    const a=members.find(x=>x.userId===id);
    return a?(`${a.firstName} ${a.lastName}`).trim()||a.email:'Assigned caregiver';
  };
  const occurrencesClamped=repeat==='once'?1:Math.min(31,Math.max(1,occurrences));
  const intervals=useMemo(()=>{
    const days=repeat==='once'?0:repeat==='daily'?1:7;
    const batches:Array<{start:Date;end:Date}>=[];
    const [sh,sm]=startTime.split(':').map(Number),[eh,em]=endTime.split(':').map(Number);
    for(let i=0;i<occurrencesClamped;i++){
      const base=addDays(anchor,days*i);
      const first=new Date(base.getFullYear(),base.getMonth(),base.getDate(),sh,sm,0);
      const last=new Date(base.getFullYear(),base.getMonth(),base.getDate(),eh,em,0);
      batches.push({start:first,end:last});
    }
    return batches;
  },[anchor,startTime,endTime,repeat,occurrencesClamped]);
  const validWindow=intervals.length>0&&intervals.every(i=>Number.isFinite(i.start.getTime())&&
    Number.isFinite(i.end.getTime())&&i.end.getTime()>i.start.getTime()&&
    i.end.getTime()-i.start.getTime()<=86400000);
  const previewCount=selectedIds.length*intervals.length;
  const conflicting=validWindow&&intervals.some(i=>selectedIds.some(id=>
    visits.some(v=>v.caregiverId===id&&['scheduled','in_progress'].includes(v.status)&&
      v.scheduledStart&&v.scheduledEnd&&new Date(v.scheduledStart)<i.end&&new Date(v.scheduledEnd)>i.start)));
  const beyondVisibleRange=intervals.some(i=>i.start<gridStart||i.start>=gridEnd);
  const canSave=!saving&&!loading&&!readError&&assignmentsReady&&!assignmentError&&
    !!patientId&&selectedIds.length>0&&validWindow&&!conflicting&&!beyondVisibleRange&&previewCount<=60;
  const save=async()=>{
    if(!canSave)return;
    setSaving(true);let saved=0;let failure:string|null=null;
    try{
      for(const interval of intervals){
        for(const id of selectedIds){
          const result=await scheduleAssignedCaregiverVisit(orgId,patientId,id,interval.start.toISOString(),interval.end.toISOString());
          if(result.error){failure=result.error;break;}
          saved++;
        }
        if(failure)break;
      }
      if(saved){toast.success(`${saved} visit${saved===1?'':'s'} scheduled.`);await load();onChanged();}
      if(failure)toast.error(`Scheduling stopped after ${saved} of ${previewCount} visits: ${failure}. Review the calendar before retrying.`);
      else setCaregiverIds([]);
    }finally{setSaving(false);}
  };
  const go=(direction:number)=>{
    const d=new Date(anchor);
    if(mode==='month')d.setMonth(d.getMonth()+direction);
    else d.setDate(d.getDate()+direction*(mode==='week'?7:1));
    setAnchor(d);
  };
  const days=Array.from({length:Math.round((gridEnd.getTime()-gridStart.getTime())/86400000)},
    (_,i)=>addDays(gridStart,i));
  const visible=visits.filter(v=>(statusFilter==='all'||v.status===statusFilter)&&
    (staffFilter==='all'||v.caregiverId===staffFilter));
  const visitsOn=(day:Date)=>visible.filter(v=>v.scheduledStart&&dateKey(new Date(v.scheduledStart))===dateKey(day));
  const allCaregivers=members.filter(m=>m.orgRole==='caregiver'&&m.status==='active');
  return <div className="space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-lg font-bold text-ent-ink"><CalendarDays className="h-5 w-5 text-ent-bronze"/>Scheduling Calendar</h2>
        <p className="text-xs text-ent-muted">Month is the default view. Only Directors can assign visits; caregivers see their own schedules.</p></div>
      <div className="flex flex-wrap gap-2">
        {(['month','week','day'] as CalendarMode[]).map(m=><button type="button" key={m} onClick={()=>setMode(m)}
          aria-pressed={mode===m} className={`rounded-lg border px-3 py-2 text-sm font-semibold capitalize ${mode===m?'border-ent-bronze bg-ent-pale text-ent-ink':'border-ent-line bg-white'}`}>{m}</button>)}
        <button type="button" onClick={()=>window.print()} className="flex items-center gap-1 rounded-lg border border-ent-line px-3 py-2 text-sm print:hidden"><Printer className="h-4 w-4"/>Print</button>
      </div>
    </header>
    <section aria-label="Director create schedule" className="space-y-3 rounded-xl border border-ent-line bg-ent-bg p-4 print:hidden">
      <h3 className="font-semibold text-ent-ink">Assign visits to one or more caregivers</h3>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm">Patient<select className={cls} value={patientId} onChange={e=>{setPatientId(e.target.value);setCaregiverIds([]);}}>
          <option value="">Choose covered patient</option>{patients.map(p=><option key={p.patientId} value={p.patientId}>{p.preferredName||p.firstName+' '+p.lastName}</option>)}
        </select></label>
        <label className="text-sm">Start time<input type="time" className={cls} value={startTime} onChange={e=>setStartTime(e.target.value)}/></label>
        <label className="text-sm">End time<input type="time" className={cls} value={endTime} onChange={e=>setEndTime(e.target.value)}/></label>
      </div>
      {patientId&&<fieldset className="rounded-xl border border-ent-line bg-white p-3">
        <legend className="px-1 text-sm font-semibold">Select assigned caregiver(s)</legend>
        {!assignmentsReady?<p className="text-sm">Loading verified assignments…</p>:eligible.length===0?
          <p className="text-sm text-ent-rust">No active caregivers assigned to this patient. Use Assignments &amp; Coverage first.</p>:
          <div className="flex flex-wrap gap-4">{eligible.map(a=><label key={a.userId} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={selectedIds.includes(a.userId)} onChange={e=>setCaregiverIds(prev=>e.target.checked?[...prev,a.userId]:prev.filter(id=>id!==a.userId))}/>
            {caregiverName(a.userId)}
          </label>)}</div>}
      </fieldset>}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">First visit date<input type="date" className={cls} value={dateKey(anchor)}
          onChange={e=>{if(e.target.value)setAnchor(localDate(e.target.value));}}/></label>
        <label className="text-sm">Repeat<select className={cls} value={repeat} onChange={e=>setRepeat(e.target.value as RepeatMode)}>
          <option value="once">One visit</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
        {repeat!=='once'&&<label className="text-sm">Number of dates (max 31)
          <input type="number" min={1} max={31} value={occurrences} onChange={e=>setOccurrences(Number(e.target.value))} className={cls}/></label>}
      </div>
      <p className="text-xs text-ent-muted">Preview: {previewCount} appointment(s) across {intervals.length} date(s). Each caregiver receives a separate visit. Repeats must remain inside the currently loaded calendar range.</p>
      {(!validWindow||conflicting||beyondVisibleRange||previewCount>60||assignmentError||readError)&&
        <p role="alert" className="text-sm text-ent-rust">{assignmentError||readError||
          (!validWindow?'End time must be after start time (maximum 24 hours).':
            conflicting?'At least one caregiver has an overlapping appointment.':
            beyondVisibleRange?'Switch to the relevant month/week/day or reduce the repeat count so all visits remain visible.':
            'Maximum 60 appointments per batch.')}</p>}
      <button type="button" disabled={!canSave} onClick={()=>{void save();}}
        className="rounded-xl bg-ent-bronze px-4 py-2 font-semibold text-white disabled:opacity-40">{saving?'Scheduling…':`Schedule ${previewCount} visit${previewCount===1?'':'s'}`}</button>
    </section>
    <section aria-label="Calendar timeline" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={()=>go(-1)} aria-label="Previous period" className="rounded-lg border border-ent-line p-2"><ChevronLeft className="h-4 w-4"/></button>
          <button type="button" onClick={()=>setAnchor(new Date())} className="rounded-lg border border-ent-line px-3 py-2 text-xs">Today</button>
          <button type="button" onClick={()=>go(1)} aria-label="Next period" className="rounded-lg border border-ent-line p-2"><ChevronRight className="h-4 w-4"/></button>
          <strong className="text-ent-ink">{mode==='month'?formatDate(anchor):mode==='week'?formatShort(startDay)+' – '+formatShort(addDays(endDay,-1)):formatShort(anchor)}</strong>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <select aria-label="Filter caregiver" className={cls} value={staffFilter} onChange={e=>setStaffFilter(e.target.value)}>
            <option value="all">All caregivers</option>{allCaregivers.map(m=><option value={m.userId} key={m.userId}>{caregiverName(m.userId)}</option>)}
          </select>
          <select aria-label="Filter visit status" className={cls} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>{['scheduled','in_progress','completed','missed','canceled'].map(s=><option key={s} value={s}>{s.replace('_',' ')}</option>)}
          </select>
        </div>
      </div>
      {readError&&<p role="alert" className="text-ent-rust">Could not load complete calendar: {readError}</p>}
      {loading?<p className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin"/>Loading calendar…</p>:
        <div className={`grid gap-1 ${mode==='day'?'grid-cols-1':'grid-cols-7'}`}>
          {mode!=='day'&&['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=><div key={d} className="p-2 text-center text-xs font-semibold text-ent-muted">{d}</div>)}
          {days.map(day=><button type="button" key={dateKey(day)} onClick={()=>setAnchor(day)}
            aria-label={`Select ${formatShort(day)}`}
            className={`min-h-24 space-y-1 rounded-xl border p-2 text-left align-top ${dateKey(day)===dateKey(anchor)?'border-ent-bronze bg-ent-pale':'border-ent-line bg-white'} ${day.getMonth()!==anchor.getMonth()&&mode==='month'?'opacity-60':''}`}>
            <span className="text-xs font-bold text-ent-ink">{day.getDate()}</span>
            {visitsOn(day).slice(0,mode==='month'?3:15).map(v=><div key={v.id} className="rounded-md border border-ent-line bg-ent-bg p-1 text-[10px] text-ent-ink">
              {v.scheduledStart&&new Date(v.scheduledStart).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}
              {' '}{v.caregiverName} · {v.patientName}
              <span className="block capitalize text-ent-muted">{v.status.replace('_',' ')}</span>
            </div>)}
            {visitsOn(day).length>(mode==='month'?3:15)&&<span className="text-xs text-ent-muted">+{visitsOn(day).length-(mode==='month'?3:15)} more</span>}
          </button>)}
        </div>}
      <p className="text-xs text-ent-muted">{visible.length} authorized visits shown in this calendar window. Selecting a day changes the focused date for scheduling.</p>
    </section>
  </div>;
}
