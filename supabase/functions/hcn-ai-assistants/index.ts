// HCN-AI-OPS-001: Authenticated read-only assistant transport.
// Default: operational summaries generated LOCALLY (no AI model, $0).
// Vercel AI Gateway code path accepts only hardcoded synthetic demo prompts,
// and is disabled unless a future, separately approved paid release enables it.
// No PHI or caller-written free text may ever reach the demo gateway path.
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.98.0';

const SITE='https://www.haneencarenetwork.com';
const origins=new Set([SITE,'https://haneencarenetwork.com','http://localhost:5173','http://localhost:3000']);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const disclaimer="I'm an AI information assistant, not a medical professional. This is general educational information; patient-specific decisions belong with a qualified clinician.";
function headers(origin:string|null){
  return {'Access-Control-Allow-Origin':origins.has(origin??'')?origin!:SITE,
    'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
    'Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json',
    'Cache-Control':'no-store','Vary':'Origin'};
}
function response(origin:string|null,code:number,data:Record<string,unknown>){
  return new Response(JSON.stringify(data),{status:code,headers:headers(origin)});
}
function int(x:unknown){return typeof x==='number'&&Number.isFinite(x)?x:0;}
function educational(question:string){
  if(/dizz|lightheaded|vertigo/i.test(question))return disclaimer+
    ' Dizziness can be associated with dehydration, changes in blood pressure, medication effects, or other causes. Record the timing, symptoms, fluid intake, and any reported medication change; refer the information to the responsible clinician. Sudden severe symptoms, fainting, chest pain, difficulty breathing, or stroke-like signs require emergency services.';
  if(/continen|bladder|incontinen/i.test(question))return disclaimer+
    ' Continence concerns can involve mobility, medication effects, infection, hydration, or other factors. Document the episode, changes from the usual pattern, and related symptoms; request clinician review for patient-specific care.';
  if(/medicat|dose|side effect/i.test(question))return disclaimer+
    ' Medication changes can affect alertness, appetite, blood pressure, or other functions. Verify changes with the prescribing professional and document what was reported; caregivers must not independently change doses or prescribe treatment.';
  if(/food|hydration|nutriti|appetite|eating/i.test(question))return disclaimer+
    ' Food and fluid intake can affect general wellness. Document amounts, timing, swallowing concerns and changes from the usual pattern; refer patient-specific restrictions or feeding concerns to the care team.';
  return disclaimer+' For this question, the offline educational library has no verified explanation. Document the observation and refer to an appropriate licensed professional. The AI model is not enabled.';
}
function orgLink(path:string){return '/Professional/'+path;}
const HCN_GATEWAY_SYNTHETIC_PROMPT=
  'Using fictional example patient Ada Example only, explain why a caregiver should document observed dizziness and ask the licensed clinician for follow-up. Do not provide treatment orders.';
async function syntheticGatewayDemo(){
  const enabled=Deno.env.get('HCN_AI_GATEWAY_ENABLED')==='true';
  const approved=Deno.env.get('HCN_AI_GATEWAY_APPROVED')==='true';
  const budget=Number(Deno.env.get('HCN_AI_GATEWAY_BUDGET_USD')??'0');
  const key=Deno.env.get('AI_GATEWAY_API_KEY')??'';
  const model=Deno.env.get('HCN_AI_GATEWAY_MODEL')??'';
  // $0 means 0 calls, even if the key accidentally exists. Model/provider
  // contract approval and routing/fallback review remain separate gates.
  if(!enabled||!approved||!(budget>0)||!key||!['openai/gpt-5-mini'].includes(model)){
    return {disabled:true,reason:'AI Gateway is disabled (zero budget / contract or provider controls not authorized).'};
  }
  const controller=new AbortController();
  const abort=setTimeout(()=>controller.abort(),12000);
  try{
    const r=await fetch('https://ai-gateway.vercel.sh/v1/chat/completions',{
      method:'POST',signal:controller.signal,
      headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify({model,messages:[
        {role:'system',content:'Use only the provided fictional case. No real patient information. Provide general, non-prescriptive education.'},
        {role:'user',content:HCN_GATEWAY_SYNTHETIC_PROMPT}
      ],max_tokens:250,temperature:0}),
    });
    if(!r.ok)return {disabled:true,reason:'Synthetic-only AI Gateway demo unavailable'};
    const data=await r.json();
    return {disabled:false,syntheticOnly:true,
      output:String(data?.choices?.[0]?.message?.content??'').slice(0,1800)};
  }finally{clearTimeout(abort);}
}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('Origin');
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(origin)});
  if(req.method!=='POST')return response(origin,405,{error:'POST required'});
  if(origin&&!origins.has(origin))return response(origin,403,{error:'Origin not authorized'});
  const bearer=req.headers.get('Authorization')??'';
  if(!bearer.startsWith('Bearer '))return response(origin,401,{error:'Authenticated session required'});
  const url=Deno.env.get('SUPABASE_URL')??'',anon=Deno.env.get('SUPABASE_ANON_KEY')??'';
  if(!url||!anon)return response(origin,503,{error:'Haneen assistant service unavailable'});
  try{
    const payload=await req.json();
    const orgId=typeof payload.organizationId==='string'?payload.organizationId:'';
    const patientId=typeof payload.patientId==='string'?payload.patientId:'';
    const role=payload.role;
    const query=typeof payload.question==='string'?payload.question.slice(0,400):'';
    if(!UUID.test(orgId)||!['director','caregiver'].includes(role)
      ||(role==='caregiver'&&!UUID.test(patientId))){
      return response(origin,400,{error:'Invalid organization, role or patient selection'});
    }
    const token=bearer.slice(7);
    const db=createClient(url,anon,{global:{headers:{Authorization:'Bearer '+token}},
      auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error:authError}=await db.auth.getUser(token);
    if(authError||!user)return response(origin,401,{error:'Session expired'});
    const {data:memberships,error:membershipError}=await db.rpc('get_my_organizations');
    if(membershipError)return response(origin,503,{error:'Could not verify organization license and membership'});
    if(!Array.isArray(memberships)||!memberships.some((m:any)=>
      m.organization_id===orgId&&m.org_role===role)){
      return response(origin,403,{error:'Active licensed office access required'});
    }
    // No paid model calls in the $0 configuration.
    const sourceLinks: {label:string;url:string}[]=[];
    let summary='';
    if(role==='director'){
      const [visits,incidents,escalations,staff]=await Promise.all([
        db.from('caregiver_visits').select('id,status').eq('organization_id',orgId).limit(500),
        db.from('incident_reports').select('id,resolution_status').eq('organization_id',orgId).limit(500),
        db.from('hcn_care_escalations').select('id,status').eq('organization_id',orgId).limit(500),
        db.from('organization_memberships').select('id,status,org_role').eq('organization_id',orgId).limit(500),
      ]);
      if(visits.error||incidents.error||escalations.error||staff.error)
        return response(origin,503,{error:'Operational records could not be verified; no summary was generated'});
      const scheduled=(visits.data??[]).filter(x=>x.status==='scheduled').length;
      const openInc=(incidents.data??[]).filter(x=>x.resolution_status!=='resolved').length;
      const review=(escalations.data??[]).filter(x=>x.status!=='resolved').length;
      const pendingStaff=(staff.data??[]).filter(x=>x.status==='invited').length;
      const focus=/schedule|visit|coverage/i.test(query)?'scheduling':
        /admin|staff|licens|invite/i.test(query)?'administration':'care operations';
      summary=`Director's Assistant (read-only local mode): ${scheduled} scheduled visits, ${openInc} unresolved incidents, ${review} open care escalations, ${pendingStaff} pending staff activations. Focus: ${focus}. Review the linked operational queues before taking action; this mode cannot change assignments, licenses or patient records.`;
      sourceLinks.push({label:'Scheduling Oversight',url:orgLink('Admin/scheduling')},
        {label:'Incidents and Escalations',url:orgLink('Admin/incidents')},
        {label:'Staff Management',url:orgLink('Admin/staff')});
    }else{
      const {data:assignments,error:assignmentError}=await db.rpc('get_my_staff_patients');
      if(assignmentError)return response(origin,503,{error:'Patient assignment could not be verified'});
      if(!Array.isArray(assignments)||!assignments.some((x:any)=>
        x.organization_id===orgId&&x.patient_id===patientId&&x.org_role==='caregiver')){
        return response(origin,403,{error:'Patient is not actively assigned to this caregiver'});
      }
      const [visits,handoffs,escalations,notes,moods,medications]=await Promise.all([
        db.from('caregiver_visits').select('id,status,scheduled_start,actual_end')
          .eq('organization_id',orgId).eq('patient_id',patientId)
          .eq('caregiver_id',user.id).order('created_at',{ascending:false}).limit(30),
        db.from('shift_handoffs').select('id,created_at').eq('organization_id',orgId)
          .eq('patient_id',patientId).order('created_at',{ascending:false}).limit(30),
        db.from('hcn_care_escalations').select('id,status,urgency').eq('organization_id',orgId)
          .eq('patient_id',patientId).limit(50),
        db.from('patient_notes').select('id,note,note_type,updated_at').eq('patient_id',patientId)
          .not('note_type','in','("therapist_session","clinical_observation","care_partner_personal")')
          .order('updated_at',{ascending:false}).limit(25),
        db.from('mood_entries').select('id,mood,note,created_at').eq('patient_id',patientId)
          .order('created_at',{ascending:false}).limit(5),
        db.from('medications').select('id,name,updated_at').eq('patient_id',patientId)
          .order('updated_at',{ascending:false}).limit(25)
      ]);
      if(visits.error||handoffs.error||escalations.error||notes.error||moods.error||medications.error)
        return response(origin,503,{error:'One or more authorized patient record sources could not be verified; no brief was generated'});
      const scheduled=(visits.data??[]).filter(x=>x.status==='scheduled').length;
      const open=(escalations.data??[]).filter(x=>x.status!=='resolved').length;
      const latest=(handoffs.data??[])[0]?.created_at??null;
      const lastCompleted=(visits.data??[]).filter(v=>v.actual_end)
        .map(v=>new Date(v.actual_end).getTime()).filter(Number.isFinite).sort((a,b)=>b-a)[0];
      const since=new Date(lastCompleted??Date.now()-7*24*60*60*1000);
      const changedNotes=(notes.data??[]).filter(n=>new Date(n.updated_at)>=since).slice(0,4);
      const recentMoods=(moods.data??[]).filter(m=>new Date(m.created_at)>=since).slice(0,3);
      const recentMedicationChanges=(medications.data??[]).filter(m=>new Date(m.updated_at)>=since).slice(0,5);
      const noteSummaries=changedNotes.map(n=>new Date(n.updated_at).toLocaleDateString('en-US')+': '+String(n.note).slice(0,240)).join(' | ');
      const moodSummaries=recentMoods.map(m=>new Date(m.created_at).toLocaleDateString('en-US')+': '+String(m.mood).slice(0,60)).join(' | ');
      const medSummaries=recentMedicationChanges.map(m=>String(m.name).slice(0,80)+' (record changed '+new Date(m.updated_at).toLocaleDateString('en-US')+')').join(' | ');
      summary=`Caregiver Helper (read-only local mode): ${scheduled} scheduled visits; ${open} unresolved care escalations; latest handoff ${latest?new Date(latest).toISOString():'not recorded'}. Records reviewed since ${since.toISOString()}${lastCompleted?' (last completed visit)':' (7-day first-visit fallback)'}.
Patient and caregiver notes: ${noteSummaries||'No authorized updates in this window'}.
Patient wellness reports: ${moodSummaries||'No recorded mood updates in this window'}.
Medication-record changes: ${medSummaries||'No medication-record changes in this window'}. Changes to the record are not confirmed medication orders. Review the source records before acting. Continence and meal intake require explicit record entries and are never inferred.`;
      sourceLinks.push({label:'Patient Information',url:orgLink('Caregiver/patients/'+patientId)+'?org='+orgId},
        {label:'My Schedule',url:orgLink('Caregiver/schedule')},
        {label:'Alerts and Escalations',url:orgLink('Caregiver/alerts')});
    }
    return response(origin,200,{mode:'local_readonly',modelUsed:false,gatewayConnected:false,
      role,summary,education:/dizz|medicat|continen|hydrat|nutri|appetite|food|symptom/i.test(query)?educational(query):null,
      sources:sourceLinks,generatedAt:new Date().toISOString(),
      notes:'No model output, autonomous action or third-party patient-data transmission. No counts imply absent records if queries fail.'});
  }catch{
    return response(origin,500,{error:'Assistant request could not be processed'});
  }
});

// The Gateway adapter is deliberately not invoked by the public route in the
// $0 release. This exported function exists for synthetic-only unit tests
// and a later separately authorized gateway rollout.
export {syntheticGatewayDemo};
