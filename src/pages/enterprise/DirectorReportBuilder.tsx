import {useEffect,useMemo,useState} from 'react';
import {BarChart3,Download,Loader2,Printer,RefreshCcw} from 'lucide-react';
import type {OrgCoveredPatient,OrgMembershipRow} from '@/services/organizationService';
import {getOrgVisitsWindow,getOrgIncidentReportsWindow,getOrgShiftHandoffsWindow,
 type OrgVisit,type OrgIncidentReport,type OrgShiftHandoff} from '@/services/organizationDirectorOpsService';

type ReportKind='visits'|'incidents'|'handoffs'|'staff'|'patients';
type ReportRow=Record<string,string>;
type Column={key:string;label:string};
const DEFINITIONS:Record<ReportKind,{title:string;columns:Column[]}> = {
  visits:{title:'Caregiver Visits & Time Records',columns:[
    {key:'date',label:'Scheduled date'},{key:'patient',label:'Patient'},{key:'caregiver',label:'Caregiver'},
    {key:'status',label:'Status'},{key:'scheduledStart',label:'Scheduled start'},{key:'scheduledEnd',label:'Scheduled end'},
    {key:'actualStart',label:'Clock in'},{key:'actualEnd',label:'Clock out'}]},
  incidents:{title:'Incident & Escalation Overview',columns:[
    {key:'date',label:'Occurred'},{key:'patient',label:'Patient'},{key:'caregiver',label:'Reported by'},
    {key:'status',label:'Status'},{key:'severity',label:'Severity'},{key:'type',label:'Incident type'},
    {key:'details',label:'Description'},{key:'resolution',label:'Resolution notes'}]},
  handoffs:{title:'Shift Handoffs',columns:[
    {key:'date',label:'Created'},{key:'patient',label:'Patient'},{key:'caregiver',label:'Author'},
    {key:'summary',label:'Summary'},{key:'tasks',label:'Pending tasks'},{key:'concerns',label:'Concerns'}]},
  staff:{title:'Organization Staff Roster',columns:[
    {key:'caregiver',label:'Staff name'},{key:'role',label:'Role'},{key:'status',label:'Status'},
    {key:'email',label:'Email'},{key:'date',label:'Created'}]},
  patients:{title:'Covered Patients',columns:[
    {key:'patient',label:'Patient name'},{key:'reference',label:'Patient reference'},
    {key:'status',label:'Coverage status'}]},
};
const toStamp=(v:string|null|undefined)=>v?new Date(v).toLocaleString():'';
const cleanCsv=(value:string)=>{
  const safe=/^[=+\-@\t\r]/.test(value)?'\''+value:value;
  return '"'+safe.replace(/"/g,'""')+'"';
};
const midnight=(day:string)=>new Date(day+'T00:00:00').toISOString();
function rowsFor(kind:ReportKind,data:{visits:OrgVisit[];incidents:OrgIncidentReport[];handoffs:OrgShiftHandoff[];
  members:Array<OrgMembershipRow & {firstName:string;lastName:string;email:string}>;patients:OrgCoveredPatient[]}):ReportRow[]{
  if(kind==='visits')return data.visits.map(v=>({
    date:v.scheduledStart?.slice(0,10)??'',patient:v.patientName,caregiver:v.caregiverName,
    status:v.status,scheduledStart:toStamp(v.scheduledStart),scheduledEnd:toStamp(v.scheduledEnd),
    actualStart:toStamp(v.actualStart),actualEnd:toStamp(v.actualEnd),
  }));
  if(kind==='incidents')return data.incidents.map(v=>({
    date:toStamp(v.occurredAt),patient:v.patientName,caregiver:v.reportedByName,status:v.resolutionStatus,
    severity:v.severity,type:v.incidentType,details:v.description,resolution:v.resolutionNotes??'',
  }));
  if(kind==='handoffs')return data.handoffs.map(v=>({
    date:toStamp(v.createdAt),patient:v.patientName,caregiver:v.authorName,
    summary:v.summary,tasks:v.pendingTasks??'',concerns:v.concerns??'',
  }));
  if(kind==='staff')return data.members.map(m=>({
    caregiver:(m.firstName+' '+m.lastName).trim(),role:m.orgRole,status:m.status,email:m.email,date:toStamp(m.createdAt),
  }));
  return data.patients.map(p=>({
    patient:p.preferredName||(p.firstName+' '+p.lastName).trim(),reference:p.patientId,status:p.status,
  }));
}
export default function DirectorReportBuilder({
  orgId,orgName,members,patients,
}:{
  orgId:string;orgName:string;
  members:Array<OrgMembershipRow & {firstName:string;lastName:string;email:string}>;
  patients:OrgCoveredPatient[];
}) {
  const now=new Date();
  const [kind,setKind]=useState<ReportKind>('visits');
  const [from,setFrom]=useState(()=>new Date(now.getFullYear(),now.getMonth(),1).toLocaleDateString('en-CA'));
  const [to,setTo]=useState(()=>new Date(now.getFullYear(),now.getMonth()+1,1).toLocaleDateString('en-CA'));
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState('all');
  const [patient,setPatient]=useState('all');
  const [staff,setStaff]=useState('all');
  const [columns,setColumns]=useState<string[]>(DEFINITIONS.visits.columns.map(c=>c.key));
  const [records,setRecords]=useState<{visits:OrgVisit[];incidents:OrgIncidentReport[];handoffs:OrgShiftHandoff[]}>({
    visits:[],incidents:[],handoffs:[],
  });
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [loadedKey,setLoadedKey]=useState('');
  const validRange=!!from&&!!to&&Number.isFinite(new Date(from).getTime())&&Number.isFinite(new Date(to).getTime())&&from<to;
  const activeDefinition=DEFINITIONS[kind];
  const load=async()=>{
    if(!validRange){setError('End date must be after start date. The end boundary is exclusive.');return;}
    setLoading(true);setError(null);setLoadedKey('');
    try{
      const a=midnight(from),b=midnight(to);
      const result=kind==='visits'?await getOrgVisitsWindow(orgId,a,b):
        kind==='incidents'?await getOrgIncidentReportsWindow(orgId,a,b):
        kind==='handoffs'?await getOrgShiftHandoffsWindow(orgId,a,b):null;
      if(result?.error){setError(result.error);return;}
      setRecords({
        visits:kind==='visits'?(result?.data as OrgVisit[]??[]):[],
        incidents:kind==='incidents'?(result?.data as OrgIncidentReport[]??[]):[],
        handoffs:kind==='handoffs'?(result?.data as OrgShiftHandoff[]??[]):[],
      });
      setLoadedKey(kind+'|'+from+'|'+to);
    }finally{setLoading(false);}
  };
  useEffect(()=>{
    setColumns(DEFINITIONS[kind].columns.map(c=>c.key));
    setSearch('');setStatus('all');setPatient('all');setStaff('all');
    setError(null);setLoadedKey('');
  },[kind]);
  useEffect(()=>{
    if(kind==='staff'||kind==='patients')setLoadedKey(kind+'|'+from+'|'+to);
  },[kind,from,to]);
  const data=useMemo(()=>rowsFor(kind,{...records,members,patients}),[kind,records,members,patients]);
  const availableStatuses=Array.from(new Set(data.map(r=>r.status).filter(Boolean))).sort();
  const displayed=useMemo(()=>data.filter(r=>
    (status==='all'||r.status===status)&&
    (patient==='all'||r.patient===patient)&&
    (staff==='all'||r.caregiver===staff)&&
    (!search.trim()||Object.values(r).some(v=>v.toLowerCase().includes(search.trim().toLowerCase())))),
    [data,status,patient,staff,search]);
  const loaded=loadedKey===kind+'|'+from+'|'+to&&(!error);
  const selected=activeDefinition.columns.filter(c=>columns.includes(c.key));
  const exportCsv=()=>{
    if(!loaded||!selected.length)return;
    const text=[selected.map(c=>cleanCsv(c.label)).join(','),
      ...displayed.map(row=>selected.map(c=>cleanCsv(row[c.key]??'')).join(','))].join('\r\n');
    const blob=new Blob(['\uFEFF'+text],{type:'text/csv;charset=utf-8'});
    const href=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=href;link.download='HCN-'+kind+'-'+from+'-'+to+'.csv';link.click();
    URL.revokeObjectURL(href);
  };
  const input='w-full rounded-lg border border-ent-line bg-white px-3 py-2 text-sm text-ent-ink';
  return <div className="space-y-4">
    <section className="rounded-2xl border border-ent-line bg-ent-panel p-5 space-y-4 print:border-none">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="flex items-center gap-2 font-bold text-ent-ink"><BarChart3 className="h-5 w-5 text-ent-bronze"/>Reports &amp; Insights</h2>
          <p className="text-sm text-ent-muted">Build an organization-scoped report from verified records, customize columns, filter and print.</p></div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button type="button" onClick={exportCsv} disabled={!loaded||selected.length===0} className="flex items-center gap-2 rounded-lg border border-ent-line p-2 text-sm disabled:opacity-40"><Download className="h-4 w-4"/>CSV</button>
          <button type="button" onClick={()=>window.print()} disabled={!loaded||selected.length===0} className="flex items-center gap-2 rounded-lg border border-ent-line p-2 text-sm disabled:opacity-40"><Printer className="h-4 w-4"/>Print</button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3 print:hidden">
        <label className="text-xs font-semibold">Report category<select aria-label="Report category" value={kind} className={input} onChange={e=>setKind(e.target.value as ReportKind)}>
          {(Object.keys(DEFINITIONS) as ReportKind[]).map(k=><option key={k} value={k}>{DEFINITIONS[k].title}</option>)}
        </select></label>
        <label className="text-xs font-semibold">From (inclusive)<input type="date" value={from} onChange={e=>{setFrom(e.target.value);setLoadedKey('');}} className={input}/></label>
        <label className="text-xs font-semibold">To (exclusive)<input type="date" value={to} onChange={e=>{setTo(e.target.value);setLoadedKey('');}} className={input}/></label>
      </div>
      {kind!=='staff'&&kind!=='patients'&&<button type="button" onClick={()=>{void load();}} disabled={loading||!validRange}
        className="flex items-center gap-2 rounded-lg bg-ent-bronze px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 print:hidden">
        {loading?<Loader2 className="h-4 w-4 animate-spin"/>:<RefreshCcw className="h-4 w-4"/>}Generate Report
      </button>}
      {error&&<p role="alert" className="text-sm text-ent-rust">{error}. Export and printing are disabled.</p>}
      {kind!=='staff'&&kind!=='patients'&&<p className="text-xs text-ent-muted">Choose dates and click Generate Report. Reports never infer missing data. Maximum 5,000 rows per category per date range; larger ranges are rejected rather than truncated.</p>}
      <div className="grid gap-3 sm:grid-cols-4 print:hidden">
        <label className="text-xs font-semibold">Search any field<input value={search} onChange={e=>setSearch(e.target.value)} className={input} placeholder="Name, detail, reference…"/></label>
        <label className="text-xs font-semibold">Status<select value={status} onChange={e=>setStatus(e.target.value)} className={input}>
          <option value="all">All statuses</option>{availableStatuses.map(v=><option key={v} value={v}>{v}</option>)}
        </select></label>
        <label className="text-xs font-semibold">Patient<select value={patient} onChange={e=>setPatient(e.target.value)} className={input}>
          <option value="all">All patients</option>{Array.from(new Set(data.map(r=>r.patient).filter(Boolean))).sort().map(v=><option key={v} value={v}>{v}</option>)}
        </select></label>
        <label className="text-xs font-semibold">Staff member<select value={staff} onChange={e=>setStaff(e.target.value)} className={input}>
          <option value="all">All staff</option>{Array.from(new Set(data.map(r=>r.caregiver).filter(Boolean))).sort().map(v=><option key={v} value={v}>{v}</option>)}
        </select></label>
      </div>
      <fieldset className="rounded-lg border border-ent-line p-3 print:hidden"><legend className="px-1 text-xs font-bold">Included columns</legend>
        <div className="flex flex-wrap gap-4">{activeDefinition.columns.map(c=><label key={c.key} className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={columns.includes(c.key)} onChange={e=>setColumns(v=>e.target.checked?[...v,c.key]:v.filter(k=>k!==c.key))}/>{c.label}
        </label>)}</div>
      </fieldset>
      <div aria-label="Printable report" className="space-y-2">
        <div><h3 className="font-bold text-ent-ink">{orgName}: {activeDefinition.title}</h3>
          <p className="text-xs text-ent-muted">{kind==='staff'||kind==='patients'?'Current authorized snapshot':`Period: ${from} through ${to} (exclusive)`} · {loaded?displayed.length+' matching records':'Not generated'}</p></div>
        {!loaded?<p role="status" className="text-sm text-ent-muted">{loading?'Loading authorized records…':'Generate a report to see its records.'}</p>:
          <div className="overflow-x-auto"><table className="w-full border-collapse text-left text-xs">
            <thead><tr className="bg-ent-pale">{selected.map(c=><th scope="col" key={c.key} className="border border-ent-line p-2">{c.label}</th>)}</tr></thead>
            <tbody>{displayed.map((row,i)=><tr key={i}>{selected.map(c=><td key={c.key} className="break-words border border-ent-line p-2 align-top">{row[c.key]??''}</td>)}</tr>)}</tbody>
          </table>{displayed.length===0&&<p className="p-4 text-sm text-ent-muted">No authorized records match these filters.</p>}</div>}
      </div>
    </section>
    <p className="text-xs text-ent-muted">Data categories available: visits/time records, incidents, handoffs, staff and covered patients. Clinical records, billing, financial reports, trend analytics and credential audits require separate authorized reporting datasets; they are not represented as complete here. Printouts and CSV files may contain sensitive information—handle under your organization's privacy policy.</p>
  </div>;
}
