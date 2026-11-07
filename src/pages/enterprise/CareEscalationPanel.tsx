import {useCallback,useEffect,useState} from 'react';
import {toast} from 'sonner';
import {ShieldAlert,RefreshCw} from 'lucide-react';
import {
  type CareEscalation,getCareEscalations,submitCareEscalation,
  triageCareEscalation,clinicianReviewEscalation,closeCareEscalation,
} from '@/services/hcnCareOperationsService';

type Role='caregiver'|'director'|'clinical';
export default function CareEscalationPanel({
  orgId,role,patients=[],
}:{
  orgId:string;role:Role;patients?:{id:string;name:string}[];
}) {
  const [cases,setCases]=useState<CareEscalation[]>([]);
  const [error,setError]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [patientId,setPatientId]=useState('');
  const [reason,setReason]=useState('');
  const [urgency,setUrgency]=useState<CareEscalation['urgency']>('routine');
  const [notes,setNotes]=useState<Record<string,string>>({});
  const refresh=useCallback(async()=>{
    setLoading(true);
    try{
      const result=await getCareEscalations(orgId);
      setCases(result.data??[]);
      setError(result.error);
    }finally{setLoading(false);}
  },[orgId]);
  useEffect(()=>{void refresh();},[refresh]);
  const submit=async()=>{
    if(busy||!patientId||reason.trim().length<10)return;
    setBusy(true);
    try{
      const r=await submitCareEscalation(orgId,patientId,reason.trim(),urgency);
      if(r.error){toast.error(r.error);return;}
      toast.success('Concern submitted to the Director queue.');
      setReason('');await refresh();
    }finally{setBusy(false);}
  };
  const act=async(item:CareEscalation,action:'clinical'|'nonclinical'|'review'|'close')=>{
    const note=(notes[item.id]??'').trim();
    if(note.length<10){toast.error('Enter a review note of at least 10 characters.');return;}
    setBusy(true);
    try{
      const result=action==='clinical'
        ? await triageCareEscalation(item.id,'request_clinical_review',note)
        : action==='nonclinical'
          ? await triageCareEscalation(item.id,'resolve_nonclinical',note)
          : action==='review'
            ? await clinicianReviewEscalation(item.id,note)
            : await closeCareEscalation(item.id,note);
      if(result.error){toast.error(result.error);return;}
      toast.success('Escalation status updated.');
      setNotes(v=>({...v,[item.id]:''}));await refresh();
    }finally{setBusy(false);}
  };
  return (
    <section aria-label="Care review and escalation queue" className="rounded-2xl border border-ent-line bg-white p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold text-ent-ink"><ShieldAlert className="h-5 w-5"/>Care Review & Escalations</h2>
        <button type="button" aria-label="Refresh care escalations" onClick={()=>{void refresh();}} className="rounded-xl border border-ent-line p-2"><RefreshCw className="h-4 w-4"/></button>
      </div>
      <p className="text-xs text-ent-muted">
        Caregivers report observations; Directors coordinate follow-up; authorized clinicians document clinical review.
        This queue is not an emergency response service. Call emergency services for immediate danger.
      </p>
      {role==='caregiver' && (
        <div className="rounded-xl border border-ent-line bg-ent-pale p-3 space-y-3">
          <h3 className="font-semibold text-sm">Notify Director of a care concern</h3>
          <label className="block text-sm">Assigned patient
            <select className="block w-full rounded-lg border border-ent-line p-2" value={patientId} onChange={e=>setPatientId(e.target.value)}>
              <option value="">Select assigned patient…</option>
              {patients.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">Priority
            <select className="block w-full rounded-lg border border-ent-line p-2" value={urgency} onChange={e=>setUrgency(e.target.value as CareEscalation['urgency'])}>
              <option value="routine">Routine</option><option value="priority">Priority</option><option value="urgent">Urgent — follow emergency protocol if needed</option>
            </select>
          </label>
          <label className="block text-sm">Observation and requested follow-up
            <textarea className="block w-full rounded-lg border border-ent-line p-2" rows={3} value={reason} onChange={e=>setReason(e.target.value)}
              placeholder="Record observed symptoms, patient-reported changes, timeline and whom you contacted. Do not diagnose."/>
          </label>
          <button type="button" className="rounded-lg bg-ent-bronze px-4 py-2 font-semibold text-white disabled:opacity-50"
            disabled={busy||!patientId||reason.trim().length<10} onClick={()=>{void submit();}}>Send to Director Queue</button>
        </div>
      )}
      {error&&<p role="alert" className="text-sm text-ent-rust">Could not verify the escalation queue: {error}</p>}
      {loading?<p role="status">Loading authorized care concerns…</p>:
      error?null:cases.length===0?<p className="text-sm text-ent-muted">No care escalations recorded for your authorized patients.</p>:
      <ul className="space-y-3">
        {cases.map(item=>{
          const canDirectorReview=role==='director'&&item.status==='director_pending';
          const canClinicianReview=role==='clinical'&&item.status==='clinical_review_requested';
          const canDirectorClose=role==='director'&&item.status==='clinical_reviewed';
          return <li key={item.id} className="rounded-xl border border-ent-line p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm text-ent-ink">{patients.find(p=>p.id===item.patientId)?.name??'Assigned patient'}</strong>
              <span className="text-xs font-semibold capitalize text-ent-bronze">{item.urgency} · {item.status.replaceAll('_',' ')}</span>
            </div>
            <p className="text-sm whitespace-pre-wrap">{item.reason}</p>
            <p className="text-xs text-ent-muted">Filed {new Date(item.createdAt).toLocaleString()}</p>
            {item.directorNote&&<p className="text-sm"><strong>Director:</strong> {item.directorNote}</p>}
            {item.clinicalNote&&<p className="text-sm"><strong>Clinical reviewer:</strong> {item.clinicalNote}</p>}
            {item.resolutionNote&&<p className="text-sm"><strong>Closed:</strong> {item.resolutionNote}</p>}
            {(canDirectorReview||canClinicianReview||canDirectorClose)&&(
              <div className="space-y-2">
                <label className="block text-xs font-semibold">Decision or clinical review note
                  <textarea rows={2} className="block w-full rounded-lg border border-ent-line p-2 text-sm" value={notes[item.id]??''}
                    onChange={e=>setNotes(v=>({...v,[item.id]:e.target.value}))}/>
                </label>
                <div className="flex flex-wrap gap-2">
                  {canDirectorReview&&<>
                    <button type="button" disabled={busy} className="rounded-lg bg-ent-bronze px-3 py-2 text-xs text-white" onClick={()=>{void act(item,'clinical');}}>Request Clinical Review</button>
                    <button type="button" disabled={busy} className="rounded-lg border border-ent-line px-3 py-2 text-xs" onClick={()=>{void act(item,'nonclinical');}}>Resolve Nonclinical Concern</button>
                  </>}
                  {canClinicianReview&&<button type="button" disabled={busy} className="rounded-lg bg-ent-bronze px-3 py-2 text-xs text-white" onClick={()=>{void act(item,'review');}}>Submit Clinical Review</button>}
                  {canDirectorClose&&<button type="button" disabled={busy} className="rounded-lg bg-ent-bronze px-3 py-2 text-xs text-white" onClick={()=>{void act(item,'close');}}>Close After Clinical Review</button>}
                </div>
              </div>
            )}
          </li>;
        })}
      </ul>}
    </section>
  );
}
