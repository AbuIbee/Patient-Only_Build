import {useState} from 'react';
import {supabase} from '@/lib/supabase';
import {Sparkles,Loader2} from 'lucide-react';

type AssistantRole='director'|'caregiver';
type AssistantResult={
  mode:'local_readonly';modelUsed:false;gatewayConnected:false;role:AssistantRole;
  summary:string;education:string|null;sources:{label:string;url:string}[];
  generatedAt:string;notes:string;
};
const prompts={
  director:['What needs attention in care operations?','Summarize scheduling and coverage','Show administration workload'],
  caregiver:['Prepare my pre-visit care brief','Explain dizziness generally','What handoffs need review?'],
};
export default function HaneenAssistantPanel({
  role,organizationId,patients=[],
}:{
  role:AssistantRole;organizationId:string;patients?:{id:string;name:string}[];
}) {
  const [patientId,setPatientId]=useState('');
  const [question,setQuestion]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [result,setResult]=useState<AssistantResult|null>(null);
  const ask=async(prompt=question)=>{
    if(busy||role==='caregiver'&&!patientId)return;
    setBusy(true);setError(null);setResult(null);
    try{
      const {data,error:serviceError}=await supabase.functions.invoke<AssistantResult & {error?:string}>('hcn-ai-assistants',{
        body:{organizationId,role,patientId:role==='caregiver'?patientId:undefined,question:prompt},
      });
      if(serviceError||!data||data.error){setError(data?.error||serviceError?.message||'Assistant unavailable');return;}
      if(data.mode!=='local_readonly'||data.modelUsed!==false||data.gatewayConnected!==false){
        setError('Unexpected assistant provider mode. No output displayed.');return;
      }
      setResult(data);
    }catch{setError('Unable to generate authorized operational summary.');}
    finally{setBusy(false);}
  };
  const title=role==='director'?"Director's Assistant":'Caregiver Helper';
  return <section aria-label={title} className="rounded-2xl border border-ent-line bg-white p-4 space-y-3">
    <div className="flex flex-wrap justify-between gap-2 items-center">
      <h2 className="flex gap-2 items-center text-lg font-bold text-ent-ink">
        <Sparkles className="w-5 h-5 text-ent-bronze"/>{title}
      </h2>
    </div>
    <p className="text-sm text-ent-muted">Review role-scoped scheduling and care-operation summaries. Confirm details in the linked records before taking action.</p>
    {role==='caregiver'&&
      <label className="block text-sm font-semibold text-ent-ink">Assigned patient
        <select value={patientId} onChange={e=>{setPatientId(e.target.value);setResult(null);}}
          className="mt-1 block w-full rounded-xl border border-ent-line p-3">
          <option value="">Choose patient…</option>
          {patients.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>}
    <div className="flex flex-wrap gap-2">
      {prompts[role].map(prompt=><button key={prompt} type="button" disabled={busy||(role==='caregiver'&&!patientId)}
        onClick={()=>{setQuestion(prompt);void ask(prompt);}}
        className="rounded-xl border border-ent-line bg-ent-pale px-3 py-2 text-xs font-semibold disabled:opacity-50">
        {prompt}
      </button>)}
    </div>
    <form onSubmit={e=>{e.preventDefault();void ask();}} className="flex flex-col gap-2 sm:flex-row">
      <input type="search" value={question} onChange={e=>setQuestion(e.target.value)}
        aria-label="Ask assistant about operations or general education" maxLength={400}
        placeholder={role==='director'?'Ask about operations, scheduling, administration…':'Ask about assigned patient updates or a term…'}
        className="min-w-0 flex-1 rounded-xl border border-ent-line px-3 py-2 text-sm"/>
      <button type="submit" disabled={busy||!question.trim()||(role==='caregiver'&&!patientId)}
        className="rounded-xl bg-ent-bronze px-4 py-2 text-white font-semibold disabled:opacity-50">
        {busy?<><Loader2 className="mr-2 inline h-4 w-4 animate-spin"/>Checking…</>:'Ask'}
      </button>
    </form>
    {error&&<p role="alert" className="text-sm text-ent-rust">{error} No result is assumed.</p>}
    {result&&<div aria-live="polite" className="space-y-2 rounded-xl bg-ent-pale p-3">
      <p className="text-sm whitespace-pre-wrap text-ent-ink">{result.summary}</p>
      {result.education&&<p className="text-sm whitespace-pre-wrap text-ent-ink">{result.education}</p>}
      <div className="flex flex-wrap gap-3">
        {result.sources.map((source,i)=><a key={i} href={source.url} className="text-xs font-semibold text-ent-bronze underline">{source.label}</a>)}
      </div>
      <p className="text-xs text-ent-muted">Checked {new Date(result.generatedAt).toLocaleString()}. {result.notes}</p>
    </div>}
  </section>;
}
