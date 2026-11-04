// Enterprise A–G dropdown vocabulary. Keep in sync with the existing
// Patient CarePartnerCheckin choices and care_partner_checkins column names.
export interface AGField {
  key: string;
  label: string;
  options: readonly string[];
}
export interface AGGroup {
  code: 'A'|'B'|'C'|'D'|'E'|'F'|'G';
  title: string;
  fields: readonly AGField[];
  commentKey: string;
}
export const AG_DROPDOWN_GROUPS: readonly AGGroup[] = [
  { code:'A',title:'Daily Function',commentKey:'fn_comments',fields:[
    {key:'fn_dressing',label:'Dressing',options:['Independent','Needs cues','Needs hands-on help','Dependent']},
    {key:'fn_bathing',label:'Bathing',options:['Independent','Needs cues','Needs help','Refused']},
    {key:'fn_toileting',label:'Toileting',options:['Independent','Needs help','Incontinent episode','Refused']},
    {key:'fn_transfers',label:'Transfers (bed/chair)',options:['Independent','Supervision','Assist','Unable']},
    {key:'fn_mobility',label:'Mobility',options:['Independent','Walker','Wheelchair','Bedbound']},
    {key:'fn_medication',label:'Medication Adherence',options:['Took as directed','Missed','Refused','Unknown']},
  ]},
  { code:'B',title:'Nutrition & Hydration',commentKey:'nu_comments',fields:[
    {key:'nu_appetite',label:'Appetite',options:['Normal','Decreased','Increased']},
    {key:'nu_meal_pct',label:'% of Meal Eaten',options:['0%','25%','50%','75%','100%']},
    {key:'nu_fluids',label:'Fluids',options:['Adequate','Low','Refused','Unknown']},
    {key:'nu_swallowing',label:'Swallowing',options:['No issues','Coughing/choking','Pocketing food','Needs soft diet','Unknown']},
  ]},
  { code:'C',title:'Continence',commentKey:'co_comments',fields:[
    {key:'co_urinary',label:'Urinary Continence',options:['Continent','Occasional accidents','Frequent accidents','Unknown']},
    {key:'co_bowel',label:'Bowel Continence',options:['Continent','Occasional accidents','Frequent accidents','Unknown']},
    {key:'co_skin',label:'Skin Concerns',options:['None','Redness','Rash','Breakdown','Unknown']},
  ]},
  { code:'D',title:'Safety Events',commentKey:'sa_comments',fields:[
    {key:'sa_falls',label:'Falls Today',options:['None','Near-fall','Fall — no injury','Fall — injury']},
    {key:'sa_wandering',label:'Wandering / Elopement Risk',options:['None','Attempted','Left home','Unknown']},
  ]},
  { code:'E',title:'Behavior & Responsiveness',commentKey:'be_comments',fields:[
    {key:'be_agitation',label:'Agitation Level',options:['None observed','Mild — easily redirected','Moderate — persistent','Severe — unable to redirect','Unknown']},
    {key:'be_wandering_risk',label:'Wandering / Elopement Risk',options:['None observed','Pacing only','Attempted door exit','Left the area','Unknown']},
    {key:'be_responsiveness',label:'Responsiveness',options:['Alert and oriented','Confused but responsive','Lethargic','Unresponsive','Unknown']},
    {key:'be_hallucinations',label:'Hallucinations / Delusions',options:['None observed','Possible — unsure','Visual hallucinations','Auditory hallucinations','Delusions / paranoia','Unknown']},
  ]},
  { code:'F',title:'Mood & Social Engagement',commentKey:'mo_comments',fields:[
    {key:'mo_mood',label:'Mood',options:['Calm','Anxious','Depressed','Irritable','Elevated','Labile','Unknown']},
    {key:'mo_social',label:'Social Engagement',options:['Normal','Withdrawn','Seeking attention','Overstimulated','Unknown']},
    {key:'mo_sleep',label:'Sleep (last 24h)',options:['Normal','Slept too much','Slept too little','Day-night reversal','Unknown']},
  ]},
  { code:'G',title:'Symptoms & Comfort',commentKey:'sy_comments',fields:[
    {key:'sy_pain',label:'Pain / Discomfort',options:['None reported','Mild — managed well','Moderate — affecting daily activity','Severe — significant distress','Unknown']},
    {key:'sy_respiratory',label:'Respiratory',options:['Normal','Mild shortness of breath','Moderate shortness of breath','Labored breathing / wheezing','Unknown']},
    {key:'sy_gi',label:'GI Symptoms',options:['None','Nausea','Vomiting','Diarrhea','Constipation','Multiple GI issues','Unknown']},
    {key:'sy_neurological',label:'Neurological / Confusion',options:['Baseline','Mildly increased confusion','Significantly increased confusion','New neurological symptom','Unknown']},
    {key:'sy_severity',label:'Overall Symptom Severity',options:['Mild — well managed','Moderate — monitor closely','Severe — contact care team']},
  ]},
] as const;
export const AG_ALLOWED_FIELD_KEYS = new Set(AG_DROPDOWN_GROUPS.flatMap(g=>[...g.fields.map(f=>f.key),g.commentKey]));
export function normalizeAGValues(values: Record<string,string>): Record<string,string> {
  const result: Record<string,string> = {};
  for (const group of AG_DROPDOWN_GROUPS) {
    for (const field of group.fields) {
      const value=values[field.key];
      if (value && field.options.includes(value)) result[field.key]=value;
    }
    const note=(values[group.commentKey]??'').trim();
    if (note) result[group.commentKey]=note.slice(0,1000);
  }
  // Injury narrative and other symptom details only when they are
  // specifically tied to a chosen category; never allow extra DB columns.
  if (['Fall — no injury','Fall — injury'].includes(result.sa_falls??'')) {
    const injury=(values.sa_injury_details??'').trim();
    if(injury)result.sa_injury_details=injury.slice(0,1000);
  }
  const symptom=(values.sy_other??'').trim();
  if(symptom) result.sy_other=symptom.slice(0,1000);
  return result;
}
