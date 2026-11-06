import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertCircle, Loader2, PencilLine, Phone, RefreshCcw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import HealthcareContacts from '@/components/healthcare/HealthcareContacts';
import { loadPatientInformation, savePatientInformation, type PatientInformationDetails, type PatientInformationSnapshot } from '@/services/patientInformationService';

type Section = 'identity' | 'needs' | 'providers' | 'representatives' | 'emergency';
const SECTIONS: {key:Section;label:string;description:string}[] = [
  {key:'identity',label:'Identity & Contact',description:'Patient email, address and telephone numbers'},
  {key:'needs',label:'Conditions & Care Needs',description:'Documented conditions, allergies and care needs'},
  {key:'providers',label:'Healthcare Providers',description:'Doctors, specialists, hospitals and clinics'},
  {key:'representatives',label:'Responsible Persons',description:'Healthcare proxy authorization and contact details'},
  {key:'emergency',label:'Emergency Contacts',description:'Primary and additional emergency contacts'},
];
const EDIT_FIELDS:Record<'identity'|'needs'|'emergency',Array<{key:keyof PatientInformationDetails;label:string;long?:boolean}>> = {
  identity:[
    {key:'patient_email',label:'Patient email'}, {key:'home_phone',label:'Home telephone'},
    {key:'mobile_phone',label:'Mobile telephone'}, {key:'street_address',label:'Street address'},
    {key:'city',label:'City'}, {key:'state',label:'State'},
    {key:'postal_code',label:'ZIP / postal code'},
  ],
  needs:[
    {key:'medical_care_needs',label:'Medical care needs (reported)',long:true},
    {key:'mental_health_needs',label:'Mental health needs (reported)',long:true},
    {key:'physical_care_needs',label:'Physical care needs (reported)',long:true},
  ],
  emergency:[
    {key:'additional_emergency_name',label:'Additional contact name'},
    {key:'additional_emergency_relationship',label:'Relationship'},
    {key:'additional_emergency_phone',label:'Home telephone'},
    {key:'additional_emergency_mobile',label:'Mobile telephone'},
    {key:'additional_emergency_email',label:'Email'},
  ],
};
const show = (x:unknown) => typeof x==='string' && x.trim()?x:'Not recorded';
const dial = (s:string) => s.replace(/[^+\d]/g,'');
function Field({label,value}:{label:string;value:unknown}) {
  const text=show(value);
  const phone=/telephone|phone|mobile/i.test(label)&&text!=='Not recorded';
  return <div className="min-w-0 rounded-lg border border-ent-line bg-white p-3">
    <dt className="text-xs font-semibold text-ent-muted">{label}</dt>
    <dd className="mt-1 break-words text-sm font-medium text-ent-ink">
      {phone?<a href={`tel:${dial(text)}`} className="inline-flex items-center gap-1 text-ent-bronze"><Phone className="h-3 w-3"/>{text}</a>:text}
    </dd>
  </div>;
}
function PatientInformationBody({patientId,orgId}:{patientId:string;orgId:string}) {
  const [data,setData]=useState<PatientInformationSnapshot|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [section,setSection]=useState<Section>('identity');
  const [query,setQuery]=useState('');
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState<Partial<PatientInformationDetails>>({});
  const [saving,setSaving]=useState(false);
  const refresh=useCallback(async()=>{
    setLoading(true);
    const response=await loadPatientInformation(orgId,patientId);
    if(response.error){setError(response.error);setData(null);}
    else {setData(response.data);setError(null);}
    setLoading(false);
  },[orgId,patientId]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{
    const channel=supabase.channel(`hcn-patient-info-${orgId}-${patientId}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'patient_care_providers',filter:`patient_id=eq.${patientId}`},()=>{void refresh();})
      .subscribe();
    const focus=()=>{void refresh();};
    window.addEventListener('focus',focus);
    return ()=>{window.removeEventListener('focus',focus);void supabase.removeChannel(channel);};
  },[orgId,patientId,refresh]);
  const value=(field:keyof PatientInformationDetails) => {
    if(!data)return '';
    const d=data.details,i=data.intake,p=data.patient;
    if(d[field]!=null)return String(d[field]);
    if(field==='patient_email')return i.patient_email||'';
    if(field==='home_phone')return i.patient_phone||'';
    if(field==='street_address')return i.patient_street_address||p.address||'';
    if(field==='city')return i.patient_city||'';
    if(field==='state')return i.patient_state||'';
    if(field==='postal_code')return i.patient_zip_code||'';
    return '';
  };
  const startEdit=()=>{
    if(section!=='identity'&&section!=='needs'&&section!=='emergency')return;
    const form:Partial<PatientInformationDetails>={};
    for(const field of EDIT_FIELDS[section]) {
      if(field.key==='version')continue;
      (form as Record<string,string>)[field.key]=value(field.key);
    }
    setDraft(form);setEditing(true);
  };
  const submit=async(event:FormEvent)=>{
    event.preventDefault();if(!data||saving)return;
    setSaving(true);
    const r=await savePatientInformation(orgId,patientId,draft,data.details.version??null);
    setSaving(false);
    if(r.error){toast.error(r.error);await refresh();return;}
    toast.success('Patient information saved.');setEditing(false);setDraft({});await refresh();
  };
  const searchResults=useMemo(()=>{
    if(!data||!query.trim())return [];
    const d=data.details,p=data.patient,i=data.intake;
    const content:Record<Section,string>={
      identity:JSON.stringify([p.first_name,p.last_name,p.preferred_name,p.date_of_birth,p.address,i.patient_email,i.patient_phone,i.patient_street_address,d.patient_email,d.home_phone,d.mobile_phone,d.city,d.state,d.postal_code]),
      needs:JSON.stringify([data.diagnoses,data.allergies,data.care_plans,d.medical_care_needs,d.mental_health_needs,d.physical_care_needs]),
      providers:JSON.stringify([data.providers,p.preferred_hospital,i.preferred_hospital]),
      representatives:JSON.stringify(data.representatives),
      emergency:JSON.stringify([p.emergency_contact_name,p.emergency_contact_phone,i.emergency_contact_full_name,i.emergency_contact_phone,d.additional_emergency_name,d.additional_emergency_phone,d.additional_emergency_mobile]),
    };
    const q=query.trim().toLowerCase();
    return SECTIONS.filter(s=>s.label.toLowerCase().includes(q)||s.description.toLowerCase().includes(q)||content[s.key].toLowerCase().includes(q));
  },[data,query]);
  const choose=(key:Section)=>{setSection(key);setEditing(false);setDraft({});setQuery('');};
  return <section aria-label="Patient Information" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="text-lg font-bold text-ent-ink">Patient Information</h2>
        <p className="text-xs text-ent-muted">One patient record; provider information is shared with Healthcare Contacts.</p></div>
      <button type="button" onClick={()=>{void refresh();}} className="inline-flex items-center gap-2 rounded-lg border border-ent-line px-3 py-2 text-sm"><RefreshCcw className="h-4 w-4"/>Refresh</button>
    </div>
    <label className="flex items-center gap-2 rounded-xl border border-ent-line bg-white px-3 py-2">
      <Search className="h-4 w-4 text-ent-muted" aria-hidden="true"/>
      <span className="sr-only">Search Patient Information</span>
      <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search contacts, allergies, doctors, needs..." className="min-w-0 w-full bg-transparent text-sm outline-none" type="search"/>
    </label>
    {query.trim()&&<div aria-label="Patient Information search results" className="rounded-xl border border-ent-line bg-white p-3">
      <p className="mb-2 text-xs font-semibold text-ent-muted">Matching sections ({searchResults.length})</p>
      {searchResults.length?searchResults.map(s=><button type="button" key={s.key} onClick={()=>choose(s.key)}
        className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-ent-pale">
        <strong>{s.label}</strong><span className="ml-2 text-ent-muted">{s.description}</span></button>):
        <p className="text-sm text-ent-muted">No matching information in this authorized record.</p>}
    </div>}
    <nav aria-label="Patient Information sections" className="grid grid-cols-2 gap-2 lg:grid-cols-5">
      {SECTIONS.map(s=><button type="button" key={s.key} onClick={()=>choose(s.key)} aria-current={section===s.key?'page':undefined}
        className={`min-h-12 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-colors ${section===s.key?'border-ent-bronze bg-ent-pale text-ent-ink':'border-ent-line bg-white text-ent-muted hover:bg-ent-pale'}`}>
        {s.label}</button>)}
    </nav>
    {loading?<div role="status" className="flex items-center gap-2 text-sm text-ent-muted"><Loader2 className="h-4 w-4 animate-spin"/>Loading patient information…</div>:
      error?<div role="alert" className="flex items-center gap-2 rounded-xl border border-red-300 p-4 text-sm text-red-700"><AlertCircle className="h-4 w-4"/>{error}</div>:
      data&&<div className="rounded-2xl border border-ent-line bg-ent-panel p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-ent-ink">{SECTIONS.find(s=>s.key===section)?.label}</h3>
          {!editing&&(['identity','needs','emergency'] as Section[]).includes(section)&&
            <button type="button" onClick={startEdit} className="inline-flex items-center gap-2 rounded-lg bg-ent-bronze px-3 py-2 text-sm font-semibold text-white">
              <PencilLine className="h-4 w-4"/>Edit information</button>}
        </div>
        {editing&&(['identity','needs','emergency'] as Section[]).includes(section)?<form onSubmit={e=>{void submit(e);}} className="space-y-3">
          <p className="text-xs text-ent-muted">Changes are audited and shared with authorized offices. Do not enter unverified diagnoses as established medical facts.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {EDIT_FIELDS[section as 'identity'|'needs'|'emergency'].map(f=><label key={f.key} className={`space-y-1 text-xs font-semibold text-ent-muted ${f.long?'sm:col-span-2':''}`}>
              {f.label}
              {f.long?<textarea rows={3} maxLength={2000} value={String(draft[f.key]??'')} onChange={e=>setDraft(prev=>({...prev,[f.key]:e.target.value}))}
                className="w-full rounded-lg border border-ent-line bg-white p-3 text-sm text-ent-ink"/>:
              <input maxLength={2000} value={String(draft[f.key]??'')} onChange={e=>setDraft(prev=>({...prev,[f.key]:e.target.value}))}
                className="w-full rounded-lg border border-ent-line bg-white p-3 text-sm text-ent-ink"/>}
            </label>)}
          </div>
          <div className="flex gap-2"><button type="submit" disabled={saving} className="rounded-lg bg-ent-bronze px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving?'Saving…':'Save changes'}</button><button type="button" disabled={saving} onClick={()=>setEditing(false)} className="rounded-lg border border-ent-line px-4 py-2 text-sm">Cancel</button></div>
        </form>:null}
        {!editing&&section==='identity'&&<dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Legal name" value={[data.patient.first_name,data.patient.last_name].filter(Boolean).join(' ')}/>
          <Field label="Preferred name" value={data.patient.preferred_name}/>
          <Field label="Date of birth" value={data.patient.date_of_birth}/>
          <Field label="Email" value={value('patient_email')}/>
          <Field label="Home telephone" value={value('home_phone')}/>
          <Field label="Mobile telephone" value={value('mobile_phone')}/>
          <Field label="Street address" value={value('street_address')}/>
          <Field label="City" value={value('city')}/>
          <Field label="State" value={value('state')}/>
          <Field label="ZIP / postal code" value={value('postal_code')}/>
        </dl>}
        {!editing&&section==='needs'&&<div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Medical care needs (reported)" value={value('medical_care_needs')}/>
            <Field label="Mental health needs (reported)" value={value('mental_health_needs')}/>
            <Field label="Physical care needs (reported)" value={value('physical_care_needs')}/>
          </div>
          <h4 className="font-semibold text-ent-ink">Documented conditions</h4>
          {data.diagnoses.length?<ul className="space-y-2">{data.diagnoses.map((d,i)=><li key={i} className="rounded-lg bg-white p-3 text-sm">
            <strong>{show(d.condition_name)}</strong> <span className="text-ent-muted">· {show(d.source)}{d.diagnosed_date?` · ${d.diagnosed_date}`:''}</span>
            {d.notes&&<p className="mt-1 text-ent-muted">{d.notes}</p>}</li>)}</ul>:
            <p className="text-sm text-ent-muted">No conditions recorded in the authorized clinical record.</p>}
          <h4 className="font-semibold text-ent-ink">Allergies</h4>
          {data.allergies.length?<ul className="space-y-2">{data.allergies.map((a,i)=><li key={i} className="rounded-lg bg-white p-3 text-sm">
            <strong>{show(a.allergen)}</strong> · {show(a.reaction)} · {show(a.severity)} <span className="text-ent-muted">({show(a.source)})</span></li>)}</ul>:
            <p className="text-sm text-ent-muted">No allergies recorded. This does not confirm that the patient has no allergies.</p>}
          <h4 className="font-semibold text-ent-ink">Active care plans</h4>
          {data.care_plans.length?data.care_plans.map((p,i)=><div key={i} className="rounded-lg bg-white p-3 text-sm">
            <p><strong>Goals:</strong> {show(p.goals)}</p><p><strong>Permitted tasks:</strong> {show(p.permitted_tasks)}</p>
            <p className="text-ent-muted">Effective: {show(p.effective_date)}</p></div>):
            <p className="text-sm text-ent-muted">No active care plan documented.</p>}
        </div>}
        {section==='providers'&&<div className="space-y-4">
          <p className="text-sm text-ent-muted">This section uses the same provider records as Healthcare Contacts. Changes appear in both views.</p>
          {data.providers.length>0?<dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">{data.providers.map(p=><div key={String(p.id)} className="rounded-xl border border-ent-line bg-white p-4">
            <dt className="font-semibold text-ent-ink">{show(p.name)}</dt><dd className="text-xs text-ent-muted">{show(p.role)}{p.is_preferred_hospital?' · Preferred hospital':''}</dd>
            <dd className="text-sm">{show(p.practice_name)} · {show(p.phone)}</dd><dd className="text-xs text-ent-muted">{show(p.verification_status)}</dd>
          </div>)}</dl>:<p className="text-sm text-ent-muted">No active provider directory records yet.</p>}
          {!data.providers.some(p=>p.is_preferred_hospital) &&(data.patient.preferred_hospital||data.intake.preferred_hospital)&&
            <p className="text-sm text-ent-muted">Historical hospital information (not yet reconciled): {data.patient.preferred_hospital||data.intake.preferred_hospital}</p>}
          <HealthcareContacts patientId={patientId} onSaved={()=>{void refresh();}} />
        </div>}
        {section==='representatives'&&<div className="space-y-3">
          <p className="text-xs text-ent-muted">The Director verifies healthcare proxy authorization. A pending representative does not receive portal access merely by being listed here.</p>
          {data.representatives.length?data.representatives.map(r=><div key={r.id} className="rounded-xl border border-ent-line bg-white p-4">
            <p className="mb-3 font-bold text-ent-ink">{show(r.name)} <span className="text-xs font-normal text-ent-muted">· {show(r.status)} / {show(r.verification_status)}</span></p>
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2"><Field label="Relationship" value={r.relationship}/><Field label="Healthcare proxy authority" value={r.authorization_basis}/>
              <Field label="Email" value={r.email}/><Field label="Phone" value={r.phone}/><Field label="Home telephone" value={r.home_phone}/>
              <Field label="Mobile telephone" value={r.mobile_phone}/><Field label="Home address" value={r.address}/></dl>
          </div>):<p className="text-sm text-ent-muted">No active or pending responsible person is on file for this organization.</p>}
          <p className="text-xs text-ent-muted">Secondary representative activation and Director change-request management remain separate authorization workflows; no self-service removal is permitted.</p>
        </div>}
        {!editing&&section==='emergency'&&<div className="space-y-4">
          <h4 className="font-semibold text-ent-ink">Primary emergency contact</h4>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Name" value={data.patient.emergency_contact_name||data.intake.emergency_contact_full_name}/>
            <Field label="Relationship" value={data.patient.emergency_contact_relationship||data.intake.emergency_contact_relationship}/>
            <Field label="Phone" value={data.patient.emergency_contact_phone||data.intake.emergency_contact_phone}/>
            <Field label="Email" value={data.patient.emergency_contact_email||data.intake.emergency_contact_email}/>
          </dl>
          <h4 className="font-semibold text-ent-ink">Additional emergency contact</h4>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {EDIT_FIELDS.emergency.map(f=><Field key={f.key} label={f.label} value={value(f.key)}/>)}
          </dl>
        </div>}
        <p className="mt-4 text-xs text-ent-muted">Information retrieved {new Date(data.as_of).toLocaleString()}. Missing entries are not proof that a condition or contact does not exist.</p>
      </div>}
  </section>;
}
export default function PatientInformation({patientId,orgId}:{patientId:string;orgId:string}) {
  // Remount on subject/org switch to avoid stale cross-patient edit drafts or results.
  return <PatientInformationBody key={`${orgId}:${patientId}`} patientId={patientId} orgId={orgId}/>;
}
