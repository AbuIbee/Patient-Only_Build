// ROUND 6 — the full tabbed Patient Health Record (P01-P22), matching
// the locked requirement's own named architecture: "UI grouping:
// Patient-specific tabs: Overview | Medical | Medications | A–G |
// Care Plan | Appointments | Documents | Safety | Communications |
// Timeline." Replaces the Round 5 flat, appended-sections layout.
//
// Every section queries a real table/RPC scoped by has_patient_access()
// (migration 070) or staff_patient_assignments (migrations 067/068/069),
// never mocked. Access verification (the "denied" state) is delegated
// to EnterpriseStaffPatientView, which already performs the real
// staff_patient_assignments check before this component's own tabs
// render any data.
import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import {
  ArrowLeft, Loader2, ClipboardList, ClipboardCheck, Calendar, MapPin, Stethoscope, Send,
  ShieldAlert, FileText, Pill, Heart, Activity, Target, Clock, Globe, Upload, Download, AlertTriangle, PencilLine,
} from 'lucide-react';
import type { StaffRole } from '@/services/organizationService';
import type { MoodType, TaskStatus } from '@/types/supabase';
import { CoverageBanner, type PatientHeader } from './EnterpriseStaffPatientView';
import { getProfessionalNotes, addProfessionalNote, type ProfessionalNote } from '@/services/professionalNotesService';
import CareConversations from '@/components/communications/CareConversations';
import { getHelpActivationHistory, type HelpActivationHistoryEntry } from '@/services/helpActivationService';
import {
  getPatientDiagnoses, recordPatientDiagnosis, getPatientAllergies, recordPatientAllergy,
  getPatientCarePlans, recordPatientCarePlan, getPatientVitals, recordPatientVitals,
  getTherapyGoals, recordTherapyGoal, getCarePreferences, recordCarePreference,
  getPatientProviders, recordPatientProvider,
  recordCommunicationNeeds, recordPatientSafetyPlan, recordNoteAmendment, acknowledgeHelpActivation,
  type PatientDiagnosis, type PatientAllergy, type PatientCarePlan, type PatientVitals, type TherapyGoal, type CarePreference, type PatientCareProvider,
} from '@/services/patientClinicalRecordService';
import {
  getMyVisits, getPatientShiftHandoffs, getPatientIncidentReports, reportScopeConcern,
  type CaregiverVisit, type IncidentReport,
} from '@/services/enterpriseCaregiverWorkToolsService';

type TabKey = 'overview' | 'medical' | 'medications' | 'tasks' | 'ag' | 'carePlan' | 'appointments' | 'documents' | 'safety' | 'communications' | 'timeline';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' }, { key: 'medical', label: 'Medical' }, { key: 'medications', label: 'Medications' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'ag', label: 'A–G' }, { key: 'carePlan', label: 'Care Plan' }, { key: 'appointments', label: 'Appointments' },
  { key: 'documents', label: 'Documents' }, { key: 'safety', label: 'Safety' }, { key: 'communications', label: 'Communications' },
  { key: 'timeline', label: 'Timeline' },
];

function SectionCard({ title, icon: Icon, children }: { title: string; icon: typeof FileText; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-3">
      <div className="flex items-center gap-2"><Icon className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">{title}</h2></div>
      {children}
    </div>
  );
}

export default function EnterprisePatientRecordTabs({ patientId, patientHeader, staffRole, orgId, onBack }: {
  patientId: string; patientHeader: PatientHeader; staffRole: StaffRole; orgId: string; onBack: () => void;
}) {
  const [tab, setTab] = useState<TabKey>('overview');
  const displayName = patientHeader.preferredName || `${patientHeader.firstName} ${patientHeader.lastName}`;

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-medium-gray hover:text-charcoal px-3 py-1.5 -ml-3 rounded-lg hover:bg-soft-taupe/30">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-2">
        <h1 className="text-xl font-bold text-charcoal">{displayName}</h1>
        <p className="text-sm text-medium-gray">{patientHeader.firstName} {patientHeader.lastName}</p>
        <CoverageBanner status={patientHeader.coverageStatus} />
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map((t) => (
          <button
            key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`flex-shrink-0 px-3 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors ${
              tab === t.key ? 'bg-warm-bronze text-white' : 'bg-white text-charcoal border border-soft-taupe hover:bg-warm-ivory'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {tab === 'overview' && <OverviewTab patientId={patientId} patientHeader={patientHeader} />}
        {tab === 'medical' && <MedicalTab patientId={patientId} staffRole={staffRole} />}
        {tab === 'medications' && <MedicationsTab patientId={patientId} />}
        {tab === 'tasks' && <TasksTab patientId={patientId} />}
        {tab === 'ag' && <AGTab patientId={patientId} />}
        {tab === 'carePlan' && <CarePlanTab patientId={patientId} orgId={orgId} />}
        {tab === 'appointments' && <AppointmentsTab patientId={patientId} orgId={orgId} />}
        {tab === 'documents' && <DocumentsTab patientId={patientId} />}
        {tab === 'safety' && <SafetyTab patientId={patientId} patientHeader={patientHeader} />}
        {tab === 'communications' && <CareConversations patientId={patientId} patientName={displayName} />}
        {tab === 'timeline' && <TimelineTab patientId={patientId} orgId={orgId} />}
      </div>
    </div>
  );
}

// W03 — fast, attributed, timestamped capture across the six permitted
// observation kinds. Mood/pain go through their own already-reviewed
// tables (mood_entries, patient_vitals via recordPatientVitals);
// hydration/appetite/mobility/sleep go into care_partner_checkins'
// matching single column, relying on migration 072's new staff INSERT
// policy on that table.
type QuickObsKind = 'mood' | 'pain' | 'hydration' | 'appetite' | 'mobility' | 'sleep';
const QUICK_OBS_KINDS: { key: QuickObsKind; label: string }[] = [
  { key: 'mood', label: 'Mood' }, { key: 'pain', label: 'Pain' }, { key: 'hydration', label: 'Hydration' },
  { key: 'appetite', label: 'Appetite' }, { key: 'mobility', label: 'Mobility' }, { key: 'sleep', label: 'Sleep' },
];
function QuickObservationForm({ patientId }: { patientId: string }) {
  const [kind, setKind] = useState<QuickObsKind>('mood');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!value.trim()) return;
    setSaving(true);
    try {
      if (kind === 'mood') {
        const { error } = await supabase.from('mood_entries').insert({
          patient_id: patientId, mood: value as MoodType, intensity: 5, recorded_by: 'enterprise_staff',
        });
        if (error) { toast.error(error.message); return; }
      } else if (kind === 'pain') {
        const { error } = await recordPatientVitals(patientId, { painLevel: Number(value) });
        if (error) { toast.error(error); return; }
      } else {
        const column = { hydration: 'nu_fluids', appetite: 'nu_appetite', mobility: 'fn_mobility', sleep: 'mo_sleep' }[kind as 'hydration' | 'appetite' | 'mobility' | 'sleep'];
        const { data: userData } = await supabase.auth.getUser();
        const authorId = userData?.user?.id;
        if (!authorId) { toast.error('Not signed in.'); return; }
        const { error } = await supabase.from('care_partner_checkins').insert({
          patient_id: patientId, submitted_by: authorId, submitted_by_name: 'Enterprise Staff', check_in_date: new Date().toISOString().slice(0, 10),
          [column]: value,
        });
        if (error) { toast.error(error.message); return; }
      }
      setValue('');
      toast.success('Observation recorded.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="Quick Observation Entry" icon={Heart}>
      <div className="flex flex-wrap gap-2">
        <select value={kind} onChange={(e) => { setKind(e.target.value as QuickObsKind); setValue(''); }} className="px-2 py-2 rounded-xl border border-soft-taupe text-sm">
          {QUICK_OBS_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
        {kind === 'mood' ? (
          <select value={value} onChange={(e) => setValue(e.target.value)} className="flex-1 px-3 py-2 rounded-xl border border-soft-taupe text-sm">
            <option value="">Select mood…</option>
            {['happy', 'calm', 'sad', 'anxious', 'angry', 'confused', 'scared', 'worried'].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        ) : kind === 'pain' ? (
          <input value={value} onChange={(e) => setValue(e.target.value)} type="number" min={0} max={10} placeholder="Pain level 0-10" className="flex-1 px-3 py-2 rounded-xl border border-soft-taupe text-sm" />
        ) : (
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={`Describe ${kind}…`} className="flex-1 px-3 py-2 rounded-xl border border-soft-taupe text-sm" />
        )}
        <button type="button" onClick={() => { void submit(); }} disabled={saving || !value.trim()} className="px-3 py-2 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white text-sm font-semibold disabled:opacity-60">Record</button>
      </div>
      <p className="text-[11px] text-medium-gray">Mood and pain appear in Medical; hydration/appetite/mobility/sleep appear in A–G.</p>
    </SectionCard>
  );
}

// P07 — read-only intake summary, admin-reviewed data surfaced to
// authorized staff for the first time this round (migration 072).
// ROUND 7 CORRECTIVE — P07: surfaces the complete care-relevant
// as-submitted intake record (previously only 4 of its ~20 fields),
// still read-only — intake remains admin-reviewed/editable only. No
// backend change: the RLS SELECT already covers every column.
interface IntakeRow {
  patient_dementia_stage: string | null; patient_diagnosis_date: string | null;
  patient_street_address: string | null; patient_city: string | null; patient_state: string | null; patient_zip_code: string | null;
  patient_phone: string | null; patient_email: string | null;
  preferred_hospital: string | null; doctor_therapist_name: string | null; doctor_therapist_phone: string | null;
  caregiver_name: string | null; caregiver_relationship: string | null; caregiver_phone: string | null;
  medications_and_dosage: string | null;
  emergency_contact_full_name: string | null; emergency_contact_phone: string | null; emergency_contact_email: string | null; emergency_contact_relationship: string | null;
  created_at: string | null;
}
function IntakeSummaryCard({ patientId }: { patientId: string }) {
  const [intake, setIntake] = useState<IntakeRow | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void supabase.from('patient_intake').select(
      'patient_dementia_stage, patient_diagnosis_date, patient_street_address, patient_city, patient_state, patient_zip_code, patient_phone, patient_email, preferred_hospital, doctor_therapist_name, doctor_therapist_phone, caregiver_name, caregiver_relationship, caregiver_phone, medications_and_dosage, emergency_contact_full_name, emergency_contact_phone, emergency_contact_email, emergency_contact_relationship, created_at'
    ).eq('patient_profile_id', patientId).maybeSingle()
      .then(({ data }) => { setIntake(data ?? null); setLoading(false); });
  }, [patientId]);
  if (loading) return null;
  if (!intake) return null;
  const address = [intake.patient_street_address, intake.patient_city, intake.patient_state, intake.patient_zip_code].filter(Boolean).join(', ');
  return (
    <SectionCard title="Patient Intake Information" icon={ClipboardList}>
      <div className="text-sm text-charcoal space-y-1">
        {intake.patient_dementia_stage && <p>Stage at intake: {intake.patient_dementia_stage}{intake.patient_diagnosis_date ? ` · diagnosed ${intake.patient_diagnosis_date}` : ''}</p>}
        {address && <p>Address at intake: {address}</p>}
        {(intake.patient_phone || intake.patient_email) && <p>Contact at intake: {[intake.patient_phone, intake.patient_email].filter(Boolean).join(' · ')}</p>}
        {intake.preferred_hospital && <p>Preferred hospital: {intake.preferred_hospital}</p>}
        {intake.doctor_therapist_name && <p>Doctor/Therapist: {intake.doctor_therapist_name}{intake.doctor_therapist_phone ? ` · ${intake.doctor_therapist_phone}` : ''}</p>}
        {intake.caregiver_name && <p>Primary caregiver at intake: {intake.caregiver_name}{intake.caregiver_relationship ? ` (${intake.caregiver_relationship})` : ''}{intake.caregiver_phone ? ` · ${intake.caregiver_phone}` : ''}</p>}
        {intake.medications_and_dosage && <p>Intake-reported medications: {intake.medications_and_dosage}</p>}
        {intake.emergency_contact_full_name && <p>Emergency contact at intake: {intake.emergency_contact_full_name}{intake.emergency_contact_relationship ? ` (${intake.emergency_contact_relationship})` : ''}{intake.emergency_contact_phone ? ` · ${intake.emergency_contact_phone}` : ''}</p>}
        {intake.created_at && <p className="text-[11px] text-medium-gray">Submitted {new Date(intake.created_at).toLocaleDateString()}</p>}
      </div>
    </SectionCard>
  );
}

// P01/P21 — identity + preferences summary.
function OverviewTab({ patientId, patientHeader }: { patientId: string; patientHeader: PatientHeader }) {
  const [preferences, setPreferences] = useState<CarePreference[]>([]);
  const [carePlans, setCarePlans] = useState<PatientCarePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPrefCategory, setNewPrefCategory] = useState('routine');
  const [newPrefDescription, setNewPrefDescription] = useState('');
  // ROUND 7 CORRECTIVE — P01 communication needs. patientHeader is
  // loaded once by the parent (EnterpriseStaffPatientView); this tab
  // keeps its own override so an edit shows immediately without
  // requiring the whole access-check flow to re-run.
  const [communicationNeeds, setCommunicationNeeds] = useState(patientHeader.communicationNeeds ?? '');
  const [savingNeeds, setSavingNeeds] = useState(false);

  const load = useCallback(() => void Promise.all([getCarePreferences(patientId), getPatientCarePlans(patientId)]).then(([p, cp]) => { setPreferences(p); setCarePlans(cp); setLoading(false); }), [patientId]);
  useEffect(() => { load(); }, [load]);
  const currentPlan = carePlans.find((p) => p.isCurrent);

  const addPreference = async () => {
    if (!newPrefDescription.trim()) return;
    const { error } = await recordCarePreference(patientId, newPrefCategory, newPrefDescription.trim());
    if (error) { toast.error(error); return; }
    setNewPrefDescription(''); load();
  };

  const saveCommunicationNeeds = async () => {
    setSavingNeeds(true);
    try {
      const { error } = await recordCommunicationNeeds(patientId, communicationNeeds.trim());
      if (error) { toast.error(error); return; }
      toast.success('Communication needs saved.');
    } finally {
      setSavingNeeds(false);
    }
  };

  return (
    <>
      <SectionCard title="Identity & Profile" icon={ClipboardList}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-charcoal">
          {patientHeader.photoUrl && <img src={patientHeader.photoUrl} alt="Patient identification" className="w-16 h-16 rounded-xl object-cover" />}
          {patientHeader.dateOfBirth && <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-warm-bronze" /> Born {patientHeader.dateOfBirth}</div>}
          {patientHeader.dementiaStage && <div className="flex items-center gap-2"><ClipboardList className="w-4 h-4 text-warm-bronze" /> {patientHeader.dementiaStage} stage</div>}
          {patientHeader.location && <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-warm-bronze" /> {patientHeader.location}</div>}
          {patientHeader.address && <div className="flex items-center gap-2 sm:col-span-2"><MapPin className="w-4 h-4 text-warm-bronze" /> {patientHeader.address}</div>}
          {patientHeader.language && <div className="flex items-center gap-2"><Globe className="w-4 h-4 text-warm-bronze" /> {patientHeader.language}</div>}
        </div>
        <div className="pt-2 border-t border-soft-taupe space-y-2">
          <label className="text-xs font-semibold text-medium-gray">Communication needs</label>
          <textarea value={communicationNeeds} onChange={(e) => setCommunicationNeeds(e.target.value)} rows={2} placeholder="e.g. hard of hearing in left ear, prefers face-to-face…" className="w-full px-3 py-2 rounded-xl border border-soft-taupe text-sm resize-none" />
          <button type="button" onClick={() => { void saveCommunicationNeeds(); }} disabled={savingNeeds} className="px-3 py-1.5 rounded-lg bg-warm-bronze hover:bg-deep-bronze text-white text-xs font-semibold disabled:opacity-60">Save</button>
        </div>
      </SectionCard>

      {currentPlan && (
        <SectionCard title="Current Care Plan" icon={Target}>
          <p className="text-sm text-charcoal">{currentPlan.goals}</p>
          {currentPlan.permittedTasks && <p className="text-xs text-medium-gray mt-1">Permitted tasks: {currentPlan.permittedTasks}</p>}
          <p className="text-[11px] text-medium-gray mt-1">Effective {currentPlan.effectiveDate} · v{currentPlan.version}</p>
        </SectionCard>
      )}

      <IntakeSummaryCard patientId={patientId} />
      <QuickObservationForm patientId={patientId} />

      <SectionCard title="Patient Preferences" icon={Heart}>
        <div className="flex gap-2">
          <select value={newPrefCategory} onChange={(e) => setNewPrefCategory(e.target.value)} className="px-2 py-2 rounded-xl border border-soft-taupe text-sm">
            {['routine', 'food', 'sensitivity', 'communication', 'comfort_technique', 'dignity', 'accessibility', 'other'].map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
          </select>
          <input value={newPrefDescription} onChange={(e) => setNewPrefDescription(e.target.value)} placeholder="Describe the preference…" className="flex-1 px-3 py-2 rounded-xl border border-soft-taupe text-sm" />
          <button type="button" onClick={() => { void addPreference(); }} className="px-3 py-2 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white text-sm font-semibold">Add</button>
        </div>
        {loading ? <Loader2 className="w-5 h-5 animate-spin text-warm-bronze" /> : preferences.length === 0 ? (
          <p className="text-sm text-medium-gray">No preferences recorded yet. Distinct from clinical orders — these are patient/family-reported.</p>
        ) : (
          <ul className="space-y-2">
            {preferences.map((p) => (
              <li key={p.id} className="p-2.5 bg-warm-ivory rounded-xl border border-soft-taupe text-sm">
                <span className="text-xs font-semibold text-warm-bronze capitalize">{p.category.replace('_', ' ')}</span>
                <p className="text-charcoal">{p.description}</p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}

// P02/P06/P07/P10/P19 — diagnoses, providers, intake, vitals, therapy goals.
function VitalsForm({ patientId, onRecorded }: { patientId: string; onRecorded: () => void }) {
  const [bp, setBp] = useState(''); const [pulse, setPulse] = useState(''); const [temp, setTemp] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!bp.trim() && !pulse.trim() && !temp.trim()) return;
    setSaving(true);
    try {
      const { error } = await recordPatientVitals(patientId, {
        bloodPressure: bp.trim() || undefined, pulseBpm: pulse.trim() ? Number(pulse) : undefined, temperatureF: temp.trim() ? Number(temp) : undefined,
      });
      if (error) { toast.error(error); return; }
      setBp(''); setPulse(''); setTemp(''); onRecorded();
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <input value={bp} onChange={(e) => setBp(e.target.value)} placeholder="BP e.g. 120/80" className="flex-1 min-w-[100px] px-3 py-2 rounded-xl border border-soft-taupe text-sm" />
      <input value={pulse} onChange={(e) => setPulse(e.target.value)} placeholder="Pulse" type="number" className="w-24 px-3 py-2 rounded-xl border border-soft-taupe text-sm" />
      <input value={temp} onChange={(e) => setTemp(e.target.value)} placeholder="Temp °F" type="number" step="0.1" className="w-24 px-3 py-2 rounded-xl border border-soft-taupe text-sm" />
      <button type="button" onClick={() => { void submit(); }} disabled={saving} className="px-3 py-2 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white text-sm font-semibold disabled:opacity-60">Record</button>
    </div>
  );
}

function MedicalTab({ patientId, staffRole }: { patientId: string; staffRole: StaffRole }) {
  const [diagnoses, setDiagnoses] = useState<PatientDiagnosis[]>([]);
  const [vitals, setVitals] = useState<PatientVitals[]>([]);
  const [goals, setGoals] = useState<TherapyGoal[]>([]);
  const [providers, setProviders] = useState<PatientCareProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDiagnosis, setNewDiagnosis] = useState('');
  const [newGoal, setNewGoal] = useState('');
  const [newProviderName, setNewProviderName] = useState('');
  const [newProviderRole, setNewProviderRole] = useState('');

  const load = useCallback(async () => {
    const [d, v, g, p] = await Promise.all([getPatientDiagnoses(patientId), getPatientVitals(patientId), getTherapyGoals(patientId), getPatientProviders(patientId)]);
    setDiagnoses(d); setVitals(v); setGoals(g); setProviders(p); setLoading(false);
  }, [patientId]);
  useEffect(() => { void load(); }, [load]);

  const addDiagnosis = async () => {
    if (!newDiagnosis.trim()) return;
    const { error } = await recordPatientDiagnosis(patientId, newDiagnosis.trim());
    if (error) { toast.error(error); return; }
    setNewDiagnosis(''); await load();
  };
  const addGoal = async () => {
    if (!newGoal.trim()) return;
    const { error } = await recordTherapyGoal(patientId, newGoal.trim());
    if (error) { toast.error(error); return; }
    setNewGoal(''); await load();
  };
  const addProvider = async () => {
    if (!newProviderName.trim() || !newProviderRole.trim()) return;
    const { error } = await recordPatientProvider(patientId, newProviderName.trim(), newProviderRole.trim());
    if (error) { toast.error(error); return; }
    setNewProviderName(''); setNewProviderRole(''); await load();
  };

  if (loading) return <Loader2 className="w-6 h-6 animate-spin text-warm-bronze mx-auto" />;
  return (
    <>
      <SectionCard title="Medical Conditions & Diagnoses" icon={Stethoscope}>
        <div className="flex gap-2">
          <input value={newDiagnosis} onChange={(e) => setNewDiagnosis(e.target.value)} placeholder="Add a diagnosed condition…" className="flex-1 px-3 py-2 rounded-xl border border-soft-taupe text-sm" />
          <button type="button" onClick={() => { void addDiagnosis(); }} className="px-3 py-2 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white text-sm font-semibold">Add</button>
        </div>
        {diagnoses.length === 0 ? <p className="text-sm text-medium-gray">No diagnoses recorded.</p> : (
          <ul className="space-y-1.5">
            {diagnoses.map((d) => (
              <li key={d.id} className="p-2.5 bg-warm-ivory rounded-xl border border-soft-taupe text-sm">
                <span className="font-medium text-charcoal">{d.conditionName}</span>
                {d.diagnosedDate && <span className="text-xs text-medium-gray"> · diagnosed {d.diagnosedDate}</span>}
                <span className="text-[11px] text-medium-gray block capitalize">source: {d.source.replace('_', ' ')}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Medical Providers" icon={Stethoscope}>
        <div className="flex gap-2">
          <input value={newProviderName} onChange={(e) => setNewProviderName(e.target.value)} placeholder="Provider name…" className="flex-1 px-3 py-2 rounded-xl border border-soft-taupe text-sm" />
          <input value={newProviderRole} onChange={(e) => setNewProviderRole(e.target.value)} placeholder="Role e.g. Primary Physician" className="flex-1 px-3 py-2 rounded-xl border border-soft-taupe text-sm" />
          <button type="button" onClick={() => { void addProvider(); }} className="px-3 py-2 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white text-sm font-semibold">Add</button>
        </div>
        {providers.length === 0 ? <p className="text-sm text-medium-gray">No providers recorded.</p> : (
          <ul className="space-y-1.5">
            {providers.map((p) => (
              <li key={p.id} className="p-2.5 bg-warm-ivory rounded-xl border border-soft-taupe text-sm">
                <span className="font-medium text-charcoal">{p.providerName}</span> — {p.providerRole}
                {p.phone && <span className="text-xs text-medium-gray block">{p.phone}</span>}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Vital Signs & Health Observations" icon={Activity}>
        <VitalsForm patientId={patientId} onRecorded={load} />
        {vitals.length === 0 ? <p className="text-sm text-medium-gray">No vitals recorded.</p> : (
          <ul className="space-y-1.5">
            {vitals.slice(0, 10).map((v) => (
              <li key={v.id} className="p-2.5 bg-warm-ivory rounded-xl border border-soft-taupe text-xs text-charcoal">
                {v.bloodPressure && <span className="mr-2">BP {v.bloodPressure}</span>}
                {v.pulseBpm != null && <span className="mr-2">Pulse {v.pulseBpm}</span>}
                {v.temperatureF != null && <span className="mr-2">Temp {v.temperatureF}°F</span>}
                {v.oxygenSaturation != null && <span className="mr-2">O2 {v.oxygenSaturation}%</span>}
                {v.painLevel != null && <span className="mr-2">Pain {v.painLevel}/10</span>}
                <span className="text-medium-gray block mt-0.5">{new Date(v.measuredAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {(staffRole === 'therapist' || staffRole === 'medical_professional') && (
        <SectionCard title="Therapy & Care Goals" icon={Target}>
          <div className="flex gap-2">
            <input value={newGoal} onChange={(e) => setNewGoal(e.target.value)} placeholder="Add a therapy objective…" className="flex-1 px-3 py-2 rounded-xl border border-soft-taupe text-sm" />
            <button type="button" onClick={() => { void addGoal(); }} className="px-3 py-2 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white text-sm font-semibold">Add</button>
          </div>
          {goals.length === 0 ? <p className="text-sm text-medium-gray">No therapy goals recorded.</p> : (
            <ul className="space-y-1.5">
              {goals.map((g) => (
                <li key={g.id} className="p-2.5 bg-warm-ivory rounded-xl border border-soft-taupe text-sm">
                  <span className="font-medium text-charcoal">{g.objective}</span>
                  <span className="text-[11px] text-medium-gray block capitalize">{g.status}{g.progressNotes ? ` — ${g.progressNotes}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}
      {goals.length > 0 && staffRole === 'caregiver' && (
        <SectionCard title="Therapy & Care Goals" icon={Target}>
          <ul className="space-y-1.5">
            {goals.map((g) => (
              <li key={g.id} className="p-2.5 bg-warm-ivory rounded-xl border border-soft-taupe text-sm">
                <span className="font-medium text-charcoal">{g.objective}</span>
                <span className="text-[11px] text-medium-gray block capitalize">{g.status}{g.progressNotes ? ` — ${g.progressNotes}` : ''}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <ProfessionalNotesSectionStandalone patientId={patientId} staffRole={staffRole} />
    </>
  );
}

// P04/P05 — current medications (structured) + history/dose log.
function MedicationsTab({ patientId }: { patientId: string }) {
  const [meds, setMeds] = useState<{ id: string; name: string; dosage: string; form: string | null; instructions: string; prescribed_by: string | null; prescription_date: string | null; is_active: boolean }[]>([]);
  const [logs, setLogs] = useState<{ id: string; medication_id: string; status: string; scheduled_time: string; taken_time: string | null; date: string }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void Promise.all([
      supabase.from('medications').select('id, name, dosage, form, instructions, prescribed_by, prescription_date, is_active').eq('patient_id', patientId).order('is_active', { ascending: false }),
      supabase.from('medication_logs').select('id, medication_id, status, scheduled_time, taken_time, date').eq('patient_id', patientId).order('date', { ascending: false }).limit(30),
    ]).then(([m, l]) => { setMeds(m.data ?? []); setLogs((l.data ?? []) as typeof logs); setLoading(false); });
  }, [patientId]);

  if (loading) return <Loader2 className="w-6 h-6 animate-spin text-warm-bronze mx-auto" />;
  return (
    <>
      <SectionCard title="Current Medications" icon={Pill}>
        {meds.filter((m) => m.is_active).length === 0 ? <p className="text-sm text-medium-gray">No active medications on file.</p> : (
          <ul className="space-y-2">
            {meds.filter((m) => m.is_active).map((m) => (
              <li key={m.id} className="p-3 bg-warm-ivory rounded-xl border border-soft-taupe">
                <p className="font-medium text-charcoal text-sm">{m.name} — {m.dosage}{m.form ? ` (${m.form})` : ''}</p>
                <p className="text-xs text-medium-gray">{m.instructions}</p>
                {m.prescribed_by && <p className="text-[11px] text-medium-gray">Prescribed by {m.prescribed_by}{m.prescription_date ? ` on ${m.prescription_date}` : ''}</p>}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <SectionCard title="Medication History" icon={Clock}>
        {logs.length === 0 ? <p className="text-sm text-medium-gray">No dose log entries recorded.</p> : (
          <ul className="space-y-1.5 max-h-96 overflow-y-auto">
            {logs.map((l) => (
              <li key={l.id} className="flex items-center justify-between p-2 bg-warm-ivory rounded-lg border border-soft-taupe text-xs">
                <span className="text-charcoal">{meds.find((m) => m.id === l.medication_id)?.name ?? 'Medication'} — {l.scheduled_time}</span>
                <span className="text-medium-gray capitalize">{l.status} · {l.date}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}

// P09 — Daily Care Activities, integrated into the record tabs
// themselves (previously only reachable as a standalone nav view) —
// reuses the exact tasks table query/update shape already proven in
// EnterpriseCaregiverDashboard.tsx's TasksView (H08/W02, migration 071),
// scoped to this one open patient.
interface TaskRow { id: string; title: string; status: TaskStatus; refusal_reason: string | null }
function TasksTab({ patientId }: { patientId: string }) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    void supabase.from('tasks').select('id, title, status, refusal_reason').eq('patient_id', patientId).eq('is_active', true)
      .then(({ data }) => { setTasks((data ?? []) as TaskRow[]); setLoading(false); });
  }, [patientId]);
  useEffect(() => { load(); }, [load]);

  const markStatus = async (taskId: string, status: TaskStatus) => {
    let refusalReason: string | null = null;
    if (status === 'skipped' || status === 'not_applicable') {
      refusalReason = window.prompt(status === 'skipped' ? 'Reason the patient declined (optional):' : 'Reason this task is not applicable (optional):') || null;
    }
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('tasks').update({
      status, refusal_reason: refusalReason,
      status_updated_by: userData?.user?.id ?? null, status_updated_at: new Date().toISOString(),
    }).eq('id', taskId).select('id');
    if (error) { toast.error(error.message); return; }
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status, refusal_reason: refusalReason } : t)));
  };

  const statusLabel: Record<TaskStatus, string> = { pending: 'Not Completed', completed: 'Completed', skipped: 'Declined', not_applicable: 'Not Applicable' };

  if (loading) return <Loader2 className="w-6 h-6 animate-spin text-warm-bronze mx-auto" />;
  return (
    <SectionCard title="Daily Care Activities" icon={ClipboardCheck}>
      {tasks.length === 0 ? <p className="text-sm text-medium-gray">No assigned tasks found for this patient.</p> : (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 p-3 bg-warm-ivory rounded-xl border border-soft-taupe">
              <div>
                <p className="text-sm font-medium text-charcoal">{t.title}</p>
                <p className="text-xs text-medium-gray">{statusLabel[t.status]}</p>
                {t.refusal_reason && <p className="text-xs text-medium-gray italic">&quot;{t.refusal_reason}&quot;</p>}
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button type="button" title="Completed" onClick={() => { void markStatus(t.id, 'completed'); }} className="px-2 py-1 rounded-lg bg-soft-sage/20 text-soft-sage text-xs font-semibold">Done</button>
                <button type="button" title="Declined" onClick={() => { void markStatus(t.id, 'skipped'); }} className="px-2 py-1 rounded-lg bg-gentle-coral/20 text-gentle-coral text-xs font-semibold">Declined</button>
                <button type="button" title="Not Applicable" onClick={() => { void markStatus(t.id, 'not_applicable'); }} className="px-2 py-1 rounded-lg bg-medium-gray/20 text-medium-gray text-xs font-bold">N/A</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// P12 — the actual 7 named A-G domains, from BOTH care_partner_notes
// (current summary) and care_partner_checkins (historical structured
// check-ins), per "expose authorized current and historical check-ins
// and summaries."
const AG_DOMAINS = [
  { code: 'A', label: 'Daily Function', fields: ['fn_dressing', 'fn_bathing', 'fn_toileting', 'fn_transfers', 'fn_mobility', 'fn_medication', 'fn_comments'] },
  { code: 'B', label: 'Nutrition & Hydration', fields: ['nu_appetite', 'nu_meal_pct', 'nu_fluids', 'nu_swallowing', 'nu_comments'] },
  { code: 'C', label: 'Continence', fields: ['co_urinary', 'co_bowel', 'co_skin', 'co_comments'] },
  { code: 'D', label: 'Safety Events', fields: ['sa_falls', 'sa_injury_details', 'sa_wandering', 'sa_comments'] },
  { code: 'E', label: 'Behavior & Responsiveness', fields: ['be_behaviors', 'be_trigger', 'be_agitation', 'be_wandering_risk', 'be_responsiveness', 'be_comments'] },
  { code: 'F', label: 'Mood & Social Engagement', fields: ['mo_mood', 'mo_social', 'mo_sleep', 'mo_comments'] },
  { code: 'G', label: 'Symptoms & Comfort', fields: ['sy_symptoms', 'sy_severity', 'sy_pain', 'sy_comments'] },
] as const;

// P13 — distinct from P12's A-G domains: overnight observations
// specifically, drawn from the same care_partner_checkins history
// (mo_sleep) plus any HELP activation whose timestamp falls in the
// overnight window. "Morning follow-up and attribution" is satisfied
// by showing each entry's own submitter/timestamp already carried on
// the row — no separate follow-up workflow exists yet (disclosed, not
// claimed).
function SleepOvernightCard({ patientId }: { patientId: string }) {
  const [rows, setRows] = useState<{ at: string; sleep: string | null; submittedByName: string | null }[]>([]);
  const [overnightHelp, setOvernightHelp] = useState<HelpActivationHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void Promise.all([
      supabase.from('care_partner_checkins').select('check_in_date, mo_sleep, submitted_by_name').eq('patient_id', patientId).order('check_in_date', { ascending: false }).limit(10),
      getHelpActivationHistory(patientId),
    ]).then(([c, h]) => {
      setRows((c.data ?? []).filter((r) => r.mo_sleep).map((r) => ({ at: r.check_in_date, sleep: r.mo_sleep, submittedByName: r.submitted_by_name })));
      setOvernightHelp(h.entries.filter((e) => { const hr = new Date(e.createdAt).getHours(); return hr >= 20 || hr < 6; }));
      setLoading(false);
    });
  }, [patientId]);
  if (loading) return null;
  return (
    <SectionCard title="Sleep & Overnight Reports" icon={Clock}>
      {rows.length === 0 && overnightHelp.length === 0 ? <p className="text-sm text-medium-gray">No overnight observations recorded.</p> : (
        <ul className="space-y-1.5">
          {overnightHelp.map((h) => (
            <li key={h.id} className="p-2 bg-gentle-coral/5 border border-gentle-coral/30 rounded-lg text-xs text-charcoal">
              Overnight HELP activation · {new Date(h.createdAt).toLocaleString()}
            </li>
          ))}
          {rows.map((r, idx) => (
            <li key={idx} className="p-2 bg-warm-ivory rounded-lg border border-soft-taupe text-xs text-charcoal">
              {r.sleep}{r.submittedByName ? ` — reported by ${r.submittedByName}` : ''}
              <span className="text-medium-gray block">{r.at}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function AGTab({ patientId }: { patientId: string }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [checkins, setCheckins] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void Promise.all([
      supabase.from('care_partner_notes').select('category, note').eq('patient_id', patientId),
      supabase.from('care_partner_checkins').select('*').eq('patient_id', patientId).order('check_in_date', { ascending: false }).limit(5),
    ]).then(([n, c]) => {
      const map: Record<string, string> = {};
      (n.data ?? []).forEach((r) => { if (r.note?.trim()) map[r.category] = r.note; });
      setNotes(map); setCheckins(c.data ?? []); setLoading(false);
    });
  }, [patientId]);

  if (loading) return <Loader2 className="w-6 h-6 animate-spin text-warm-bronze mx-auto" />;
  return (
    <>
      {AG_DOMAINS.map((d) => (
        <SectionCard key={d.code} title={`${d.code} — ${d.label}`} icon={ClipboardList}>
          {notes[d.code] && <p className="text-sm text-charcoal mb-2"><span className="font-semibold text-warm-bronze text-xs">Current summary: </span>{notes[d.code]}</p>}
          {checkins.length === 0 ? <p className="text-sm text-medium-gray">No historical check-ins recorded.</p> : (
            <ul className="space-y-1.5">
              {checkins.map((c, idx) => {
                const row = c as Record<string, unknown>;
                const parts = d.fields.map((f) => row[f]).filter((v) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0));
                if (parts.length === 0) return null;
                return (
                  <li key={idx} className="p-2 bg-warm-ivory rounded-lg border border-soft-taupe text-xs text-charcoal">
                    {parts.map((v) => Array.isArray(v) ? v.join(', ') : String(v)).join(' · ')}
                    <span className="text-medium-gray block">{String(row.check_in_date)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      ))}
      <SleepOvernightCard patientId={patientId} />
    </>
  );
}

// W05 — "read current verified instructions, flag ambiguities and
// request clarification rather than modifying clinician orders." The
// care plan itself is read-only prose here (recording a new version is
// a separate, explicit action below it, not an edit to the order); a
// flagged ambiguity goes through report_scope_concern (already
// reviewed, director-only read) rather than any direct edit path.
function CarePlanTab({ patientId, orgId }: { patientId: string; orgId: string }) {
  const [plans, setPlans] = useState<PatientCarePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [goals, setGoalsText] = useState('');
  const [tasks, setTasksText] = useState('');
  const [ambiguity, setAmbiguity] = useState('');
  const [flagging, setFlagging] = useState(false);

  const load = useCallback(() => void getPatientCarePlans(patientId).then((p) => { setPlans(p); setLoading(false); }), [patientId]);
  useEffect(() => { load(); }, [load]);
  const currentPlan = plans.find((p) => p.isCurrent);

  const submit = async () => {
    if (!goals.trim()) return;
    const { error } = await recordPatientCarePlan(patientId, goals.trim(), tasks.trim() || undefined);
    if (error) { toast.error(error); return; }
    setGoalsText(''); setTasksText(''); load();
  };

  const flagAmbiguity = async () => {
    if (!ambiguity.trim()) return;
    setFlagging(true);
    try {
      const { error } = await reportScopeConcern(orgId, patientId, `Care plan clarification requested: ${ambiguity.trim()}`);
      if (error) { toast.error(error); return; }
      setAmbiguity('');
      toast.success('Clarification request sent to your supervisor.');
    } finally {
      setFlagging(false);
    }
  };

  return (
    <>
      <SectionCard title="Patient Instructions" icon={ClipboardList}>
        {currentPlan ? (
          <div className="text-sm text-charcoal space-y-1">
            <p>{currentPlan.goals}</p>
            {currentPlan.permittedTasks && <p className="text-xs text-medium-gray">Permitted tasks: {currentPlan.permittedTasks}</p>}
          </div>
        ) : <p className="text-sm text-medium-gray">No current verified instructions on file.</p>}
        <div className="flex gap-2 pt-2 border-t border-soft-taupe">
          <input value={ambiguity} onChange={(e) => setAmbiguity(e.target.value)} placeholder="Flag an ambiguity or request clarification…" className="flex-1 px-3 py-2 rounded-xl border border-soft-taupe text-sm" />
          <button type="button" onClick={() => { void flagAmbiguity(); }} disabled={flagging || !ambiguity.trim()} className="px-3 py-2 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white text-sm font-semibold disabled:opacity-60">Flag</button>
        </div>
        <p className="text-[11px] text-medium-gray">Never modifies the order itself — sent to your supervisor for review.</p>
      </SectionCard>

      <SectionCard title="Official Care Plan" icon={Target}>
        <textarea value={goals} onChange={(e) => setGoalsText(e.target.value)} placeholder="Care plan goals…" rows={2} className="w-full px-3 py-2 rounded-xl border border-soft-taupe text-sm resize-none" />
        <input value={tasks} onChange={(e) => setTasksText(e.target.value)} placeholder="Permitted caregiver tasks (optional)…" className="w-full px-3 py-2 rounded-xl border border-soft-taupe text-sm" />
        <button type="button" onClick={() => { void submit(); }} disabled={!goals.trim()} className="px-4 py-2 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white text-sm font-semibold disabled:opacity-60">Record New Version</button>
        {loading ? <Loader2 className="w-5 h-5 animate-spin text-warm-bronze" /> : plans.length === 0 ? (
          <p className="text-sm text-medium-gray">No care plan recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {plans.map((p) => (
              <li key={p.id} className={`p-3 rounded-xl border text-sm ${p.isCurrent ? 'bg-warm-bronze/5 border-warm-bronze/30' : 'bg-warm-ivory border-soft-taupe'}`}>
                <p className="text-charcoal">{p.goals}</p>
                {p.permittedTasks && <p className="text-xs text-medium-gray">Permitted: {p.permittedTasks}</p>}
                <p className="text-[11px] text-medium-gray mt-1">v{p.version} · effective {p.effectiveDate}{p.isCurrent ? ' · current' : ''}</p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}

function AppointmentsTab({ patientId, orgId }: { patientId: string; orgId: string }) {
  const [appointments, setAppointments] = useState<{ id: string; title: string; provider: string; location: string | null; date: string; time: string }[]>([]);
  const [visits, setVisits] = useState<CaregiverVisit[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void Promise.all([
      supabase.from('appointments').select('id, title, provider, location, date, time').eq('patient_id', patientId).order('date', { ascending: false }),
      getMyVisits(patientId),
    ]).then(([a, v]) => { setAppointments(a.data ?? []); setVisits(v); setLoading(false); });
  }, [patientId, orgId]);

  if (loading) return <Loader2 className="w-6 h-6 animate-spin text-warm-bronze mx-auto" />;
  return (
    <>
      <SectionCard title="Medical Appointments" icon={Calendar}>
        {appointments.length === 0 ? <p className="text-sm text-medium-gray">No appointments on file.</p> : (
          <ul className="space-y-1.5">
            {appointments.map((a) => (
              <li key={a.id} className="p-2.5 bg-warm-ivory rounded-xl border border-soft-taupe text-sm">
                <span className="font-medium text-charcoal">{a.title}</span> — {a.provider}
                <span className="text-xs text-medium-gray block">{a.date} {a.time}{a.location ? ` · ${a.location}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <SectionCard title="Caregiver Visits" icon={Clock}>
        {visits.length === 0 ? <p className="text-sm text-medium-gray">No visit records for this patient.</p> : (
          <ul className="space-y-1.5">
            {visits.map((v) => (
              <li key={v.id} className="p-2.5 bg-warm-ivory rounded-xl border border-soft-taupe text-sm">
                <span className="capitalize font-medium text-charcoal">{v.status.replace('_', ' ')}</span>
                {v.scheduledStart && <span className="text-xs text-medium-gray ml-2">{new Date(v.scheduledStart).toLocaleString()}</span>}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}

// P15/W12 — ROUND 7 CORRECTIVE: real upload + secure signed-URL
// download. The 'patient-documents' storage bucket's own
// storage.objects RLS (migration 075) now recognizes
// staff_patient_assignments, mirroring the exact caregiver_patients
// policy already proven for the residential flow (migration 007);
// the upload path convention and orphan-cleanup-on-db-failure pattern
// are copied verbatim from the already-working
// src/pages/patient/PatientDocuments.tsx.
const DOC_BUCKET = 'patient-documents';
const MAX_DOC_SIZE = 5 * 1024 * 1024;

function DocumentsTab({ patientId }: { patientId: string }) {
  const [docs, setDocs] = useState<{ id: string; file_name: string; section: string; note_text: string | null; uploaded_at: string | null; storage_path: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [section, setSection] = useState<'medical_docs' | 'medical_bills'>('medical_docs');
  const [error, setError] = useState('');

  const load = useCallback(() => void supabase.from('patient_document_uploads').select('id, file_name, section, note_text, uploaded_at, storage_path').eq('patient_id', patientId).order('uploaded_at', { ascending: false })
    .then(({ data }) => { setDocs(data ?? []); setLoading(false); }), [patientId]);
  useEffect(() => { load(); }, [load]);

  const upload = async (file: File) => {
    if (file.size > MAX_DOC_SIZE) { setError('File is too large (max 5 MB).'); return; }
    setError(''); setUploading(true);
    try {
      const storagePath = `${patientId}/${section}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error: upErr } = await supabase.storage.from(DOC_BUCKET).upload(storagePath, file, { upsert: false, contentType: file.type });
      if (upErr) { setError(upErr.message); return; }
      const { error: dbErr } = await supabase.from('patient_document_uploads').insert({
        patient_id: patientId, section, file_name: file.name, file_type: file.type, storage_path: storagePath, note_text: '',
      });
      if (dbErr) {
        const { error: cleanupErr } = await supabase.storage.from(DOC_BUCKET).remove([storagePath]);
        if (cleanupErr) console.error('Orphaned document storage object could not be cleaned up:', storagePath, cleanupErr.message);
        setError(dbErr.message);
        return;
      }
      toast.success('Document uploaded.');
      load();
    } finally {
      setUploading(false);
    }
  };

  const download = async (storagePath: string, fileName: string) => {
    const { data, error: signErr } = await supabase.storage.from(DOC_BUCKET).createSignedUrl(storagePath, 3600);
    if (signErr || !data) { toast.error(signErr?.message || 'Could not generate a secure download link.'); return; }
    const a = document.createElement('a');
    a.href = data.signedUrl; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.click();
    void fileName;
  };

  if (loading) return <Loader2 className="w-6 h-6 animate-spin text-warm-bronze mx-auto" />;
  return (
    <SectionCard title="Medical Documents" icon={FileText}>
      <div className="flex flex-wrap items-center gap-2">
        <select value={section} onChange={(e) => setSection(e.target.value as typeof section)} className="px-2 py-2 rounded-xl border border-soft-taupe text-sm">
          <option value="medical_docs">Medical document</option>
          <option value="medical_bills">Medical bill</option>
        </select>
        <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white text-sm font-semibold cursor-pointer">
          <Upload className="w-4 h-4" /> {uploading ? 'Uploading…' : 'Upload a file'}
          <input type="file" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
        </label>
      </div>
      {error && <p className="text-xs text-gentle-coral">{error}</p>}
      {docs.length === 0 ? <p className="text-sm text-medium-gray">No documents on file for this patient.</p> : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 p-3 bg-warm-ivory rounded-xl border border-soft-taupe text-sm">
              <div>
                <p className="font-medium text-charcoal">{d.file_name}</p>
                <p className="text-xs text-medium-gray capitalize">{d.section.replace('_', ' ')}{d.uploaded_at ? ` · ${new Date(d.uploaded_at).toLocaleDateString()}` : ''}</p>
                {d.note_text && <p className="text-xs text-charcoal mt-1">{d.note_text}</p>}
              </div>
              <button type="button" onClick={() => { void download(d.storage_path, d.file_name); }} className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-warm-bronze/10 text-warm-bronze text-xs font-semibold hover:bg-warm-bronze/20">
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-medium-gray">Max 5 MB per file. Downloads use a time-limited secure link, never a public URL.</p>
    </SectionCard>
  );
}

// P17 — ROUND 7 CORRECTIVE: a dedicated HELP Activation History
// section with full per-event detail (notification status, staff
// acknowledgment) instead of one undifferentiated Timeline line. Reads
// help_activations directly (already staff-scoped RLS, confirmed —
// "Assigned org staff can view HELP activation history for their
// patients") rather than through get_patient_help_activation_history(),
// specifically so this round's new staff_acknowledged_by/at columns
// (migration 075) don't require touching that RPC again — it is
// explicitly a protected, previously P0-hardened function (migrations
// 048/050/053/071) this engagement does not re-touch without cause.
interface HelpRow { id: string; created_at: string; phone_dialed: string | null; notification_status: string; staff_acknowledged_by: string | null; staff_acknowledged_at: string | null }
function HelpHistorySection({ patientId }: { patientId: string }) {
  const [rows, setRows] = useState<HelpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => void supabase.from('help_activations').select('id, created_at, phone_dialed, notification_status, staff_acknowledged_by, staff_acknowledged_at').eq('patient_id', patientId).order('created_at', { ascending: false })
    .then(({ data }) => { setRows((data ?? []) as HelpRow[]); setLoading(false); }), [patientId]);
  useEffect(() => { load(); }, [load]);

  const ack = async (id: string) => {
    const { error } = await acknowledgeHelpActivation(id);
    if (error) { toast.error(error); return; }
    load();
  };

  if (loading) return null;
  return (
    <SectionCard title="HELP Activation History" icon={AlertTriangle}>
      {rows.length === 0 ? <p className="text-sm text-medium-gray">No HELP activations recorded.</p> : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.id} className="p-2.5 bg-gentle-coral/5 border border-gentle-coral/30 rounded-xl text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-charcoal">{new Date(r.created_at).toLocaleString()}</span>
                {!r.staff_acknowledged_at && <button type="button" onClick={() => { void ack(r.id); }} className="px-2 py-1 rounded-lg bg-warm-bronze hover:bg-deep-bronze text-white text-xs font-semibold">Acknowledge</button>}
              </div>
              <p className="text-xs text-medium-gray capitalize">Notification: {r.notification_status.replace('_', ' ')}{r.phone_dialed ? ` · called ${r.phone_dialed}` : ''}</p>
              {r.staff_acknowledged_at && <p className="text-xs text-soft-sage font-semibold">Acknowledged {new Date(r.staff_acknowledged_at).toLocaleString()}</p>}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// P03/P16/P18 — allergies, emergency contacts/safety plan, incidents.
function SafetyTab({ patientId, patientHeader }: { patientId: string; patientHeader: PatientHeader }) {
  const [allergies, setAllergies] = useState<PatientAllergy[]>([]);
  const [incidents, setIncidents] = useState<IncidentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [newAllergen, setNewAllergen] = useState('');
  const [preferredHospital, setPreferredHospital] = useState(patientHeader.preferredHospital ?? '');
  const [safetyInstructions, setSafetyInstructions] = useState(patientHeader.safetyResponseInstructions ?? '');
  const [savingSafety, setSavingSafety] = useState(false);

  const load = useCallback(async () => {
    const [a, i] = await Promise.all([getPatientAllergies(patientId), getPatientIncidentReports(patientId)]);
    setAllergies(a); setIncidents(i); setLoading(false);
  }, [patientId]);
  useEffect(() => { void load(); }, [load]);

  const addAllergy = async () => {
    if (!newAllergen.trim()) return;
    const { error } = await recordPatientAllergy(patientId, newAllergen.trim());
    if (error) { toast.error(error); return; }
    setNewAllergen(''); await load();
  };

  const saveSafetyPlan = async () => {
    setSavingSafety(true);
    try {
      const { error } = await recordPatientSafetyPlan(patientId, { preferredHospital: preferredHospital.trim() || undefined, safetyResponseInstructions: safetyInstructions.trim() || undefined });
      if (error) { toast.error(error); return; }
      toast.success('Safety plan saved.');
    } finally {
      setSavingSafety(false);
    }
  };

  if (loading) return <Loader2 className="w-6 h-6 animate-spin text-warm-bronze mx-auto" />;
  return (
    <>
      <SectionCard title="Allergies & Medical Warnings" icon={ShieldAlert}>
        <div className="flex gap-2">
          <input value={newAllergen} onChange={(e) => setNewAllergen(e.target.value)} placeholder="Add an allergy…" className="flex-1 px-3 py-2 rounded-xl border border-soft-taupe text-sm" />
          <button type="button" onClick={() => { void addAllergy(); }} className="px-3 py-2 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white text-sm font-semibold">Add</button>
        </div>
        {/* Never presents missing data as "No Known Allergies" — an
            empty list is explicitly "not recorded," per the locked
            requirement. */}
        {allergies.length === 0 ? <p className="text-sm text-medium-gray italic">No allergies recorded (this is not a claim of "no known allergies" — absence of data, not a verified negative).</p> : (
          <ul className="space-y-1.5">
            {allergies.map((a) => (
              <li key={a.id} className="p-2.5 bg-gentle-coral/5 border border-gentle-coral/30 rounded-xl text-sm">
                <span className="font-medium text-charcoal">{a.allergen}</span>{a.severity && <span className="text-xs text-medium-gray capitalize"> · {a.severity}</span>}
                {a.reaction && <p className="text-xs text-medium-gray">Reaction: {a.reaction}</p>}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Emergency Contacts & Safety Plan" icon={ShieldAlert}>
        {patientHeader.emergencyContactName ? (
          <div className="text-sm text-charcoal space-y-1">
            <p className="font-medium">{patientHeader.emergencyContactName} ({patientHeader.emergencyContactRelationship || 'relationship not recorded'})</p>
            {patientHeader.emergencyContactPhone && <p className="text-medium-gray">{patientHeader.emergencyContactPhone}</p>}
            {patientHeader.emergencyContactEmail && <p className="text-medium-gray">{patientHeader.emergencyContactEmail}</p>}
          </div>
        ) : <p className="text-sm text-medium-gray">No emergency contact on file.</p>}

        {/* ROUND 7 CORRECTIVE — P16. code_status defaults to and stays
            'unknown' until explicitly set — never a specific code by
            default, so this warning is never a false negative. */}
        {patientHeader.codeStatus === 'unknown' ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gentle-coral/15 border border-gentle-coral text-sm font-semibold text-charcoal">
            <AlertTriangle className="w-4 h-4 text-gentle-coral flex-shrink-0" /> Code status: Unknown — confirm with an authoritative source before relying on this.
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-soft-sage/20 border border-soft-sage text-sm font-semibold text-charcoal">
            Code status: {patientHeader.codeStatus === 'dnr' ? 'DNR' : 'Full Code'} <span className="text-[11px] font-normal text-medium-gray capitalize">({patientHeader.codeStatusSource.replace('_', ' ')})</span>
          </div>
        )}

        <div className="pt-2 border-t border-soft-taupe space-y-2">
          <input value={preferredHospital} onChange={(e) => setPreferredHospital(e.target.value)} placeholder="Preferred hospital…" className="w-full px-3 py-2 rounded-xl border border-soft-taupe text-sm" />
          <textarea value={safetyInstructions} onChange={(e) => setSafetyInstructions(e.target.value)} placeholder="Safety / emergency response instructions…" rows={2} className="w-full px-3 py-2 rounded-xl border border-soft-taupe text-sm resize-none" />
          <button type="button" onClick={() => { void saveSafetyPlan(); }} disabled={savingSafety} className="px-3 py-1.5 rounded-lg bg-warm-bronze hover:bg-deep-bronze text-white text-xs font-semibold disabled:opacity-60">Save safety plan</button>
          <p className="text-[11px] text-medium-gray">Setting a verified code status requires an assigned therapist or medical professional — not set here.</p>
        </div>
      </SectionCard>

      <HelpHistorySection patientId={patientId} />

      <SectionCard title="Incident History" icon={ShieldAlert}>
        {incidents.length === 0 ? <p className="text-sm text-medium-gray">No incidents recorded.</p> : (
          <ul className="space-y-1.5">
            {incidents.map((i) => (
              <li key={i.id} className="p-2.5 bg-warm-ivory rounded-xl border border-soft-taupe text-sm">
                <span className="capitalize font-medium text-charcoal">{i.incidentType.replace('_', ' ')}</span> — {i.description}
                <span className="text-[11px] text-medium-gray block">{new Date(i.occurredAt).toLocaleString()} · <span className="capitalize">{i.resolutionStatus.replace('_', ' ')}</span></span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}

// P22 — unified chronological timeline, aggregating every dated event
// type this record has access to. No source is invented; each entry
// names its real origin table.
function TimelineTab({ patientId, orgId }: { patientId: string; orgId: string }) {
  const [entries, setEntries] = useState<{ at: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void (async () => {
      const [diag, vit, inc, help, handoffs] = await Promise.all([
        getPatientDiagnoses(patientId), getPatientVitals(patientId), getPatientIncidentReports(patientId),
        getHelpActivationHistory(patientId).then((r) => r.entries), getPatientShiftHandoffs(orgId, patientId),
      ]);
      const all: { at: string; label: string }[] = [
        ...diag.map((d) => ({ at: d.createdAt, label: `Diagnosis recorded: ${d.conditionName}` })),
        ...vit.map((v) => ({ at: v.measuredAt, label: 'Vitals recorded' })),
        ...inc.map((i) => ({ at: i.occurredAt, label: `Incident: ${i.incidentType.replace('_', ' ')}` })),
        ...help.map((h: HelpActivationHistoryEntry) => ({ at: h.createdAt, label: 'HELP button activated' })),
        ...handoffs.map((h) => ({ at: h.createdAt, label: 'Shift handoff recorded' })),
      ];
      all.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      setEntries(all);
      setLoading(false);
    })();
  }, [patientId, orgId]);

  if (loading) return <Loader2 className="w-6 h-6 animate-spin text-warm-bronze mx-auto" />;
  return (
    <SectionCard title="Patient Health Timeline" icon={Clock}>
      {entries.length === 0 ? <p className="text-sm text-medium-gray">No timeline events recorded yet.</p> : (
        <ul className="space-y-1.5 max-h-[32rem] overflow-y-auto">
          {entries.map((e, idx) => (
            <li key={idx} className="p-2 bg-warm-ivory rounded-lg border border-soft-taupe text-xs text-charcoal flex items-center justify-between">
              <span>{e.label}</span>
              <span className="text-medium-gray">{new Date(e.at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// Re-exported so callers can still author ordinary notes/professional
// notes alongside the tabs (W04/N07), unchanged from the Round 5
// component this file supersedes for record display.
// W04/N07 — Care Notes & Observations. Professional note types
// (therapist_session/clinical_observation) go through the dedicated,
// already-reviewed professionalNotesService (RLS-gated to eligible
// staff only — migrations 044/064). An ordinary caregiver's general
// note instead goes directly against patient_notes with
// note_type='general', relying on migration 071's new staff INSERT/
// SELECT policy (explicitly excluding the professional types) — never
// routed through professionalNotesService, whose type signature is
// deliberately narrowed to the two professional types only.
function ProfessionalNotesSectionStandalone({ patientId, staffRole }: { patientId: string; staffRole: StaffRole }) {
  const [notes, setNotes] = useState<ProfessionalNote[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [amendingId, setAmendingId] = useState<string | null>(null);
  const [amendDraft, setAmendDraft] = useState('');

  const load = useCallback(async () => {
    if (staffRole === 'medical_professional' || staffRole === 'therapist') {
      const noteType = staffRole === 'medical_professional' ? 'clinical_observation' : 'therapist_session';
      setNotes(await getProfessionalNotes(patientId, noteType));
    } else {
      const { data } = await supabase.from('patient_notes').select('id, note, created_at, updated_at, amends_note_id').eq('patient_id', patientId).eq('note_type', 'general').order('created_at', { ascending: false });
      setNotes((data ?? []).map((r) => ({ id: r.id, note: r.note, createdAt: r.created_at, updatedAt: r.updated_at ?? r.created_at, amendsNoteId: r.amends_note_id })));
    }
    setLoading(false);
  }, [patientId, staffRole]);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!draft.trim()) return;
    if (staffRole === 'medical_professional' || staffRole === 'therapist') {
      const noteType = staffRole === 'medical_professional' ? 'clinical_observation' : 'therapist_session';
      const { error } = await addProfessionalNote(patientId, noteType, draft);
      if (error) { toast.error(error); return; }
    } else {
      const { data: userData } = await supabase.auth.getUser();
      const authorId = userData?.user?.id;
      if (!authorId) { toast.error('Not signed in.'); return; }
      const { error } = await supabase.from('patient_notes').insert({ patient_id: patientId, author_id: authorId, note: draft.trim(), note_type: 'general' });
      if (error) { toast.error(error.message); return; }
    }
    setDraft(''); void load();
  };

  // W14 — ROUND 7 CORRECTIVE: append-only amendment. Never edits the
  // original row; record_note_amendment() inserts a new row that
  // references it, re-verifying the same authorship/professional-tier
  // gate the original note type requires.
  const submitAmendment = async (originalId: string) => {
    if (!amendDraft.trim()) return;
    const { error } = await recordNoteAmendment(originalId, amendDraft.trim());
    if (error) { toast.error(error); return; }
    setAmendingId(null); setAmendDraft(''); void load();
  };

  return (
    <SectionCard title={staffRole === 'caregiver' ? 'Care Notes & Observations' : staffRole === 'medical_professional' ? 'Clinical Observations' : 'Session Notes & Care Goals'} icon={Stethoscope}>
      <div className="flex gap-2">
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder="Record a note…" className="flex-1 px-3 py-2 rounded-xl border border-soft-taupe text-sm resize-none" />
        <button type="button" onClick={() => { void save(); }} disabled={!draft.trim()} className="px-3 py-2 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white text-sm font-semibold self-start"><Send className="w-4 h-4" /></button>
      </div>
      {loading ? <Loader2 className="w-5 h-5 animate-spin text-warm-bronze" /> : notes.length === 0 ? <p className="text-sm text-medium-gray">No entries yet.</p> : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className={`p-3 rounded-xl border text-sm ${n.amendsNoteId ? 'bg-warm-bronze/5 border-warm-bronze/30' : 'bg-warm-ivory border-soft-taupe'}`}>
              {n.amendsNoteId && <p className="text-[11px] font-semibold text-warm-bronze uppercase tracking-wide">Correction</p>}
              <p className="text-sm text-charcoal whitespace-pre-wrap">{n.note}</p>
              <div className="flex items-center justify-between mt-1">
                <p className="text-[11px] text-medium-gray">{new Date(n.createdAt).toLocaleString()}</p>
                {!n.amendsNoteId && amendingId !== n.id && (
                  <button type="button" onClick={() => { setAmendingId(n.id); setAmendDraft(''); }} className="flex items-center gap-1 text-[11px] font-semibold text-warm-bronze hover:underline"><PencilLine className="w-3 h-3" /> Amend</button>
                )}
              </div>
              {amendingId === n.id && (
                <div className="flex gap-2 mt-2">
                  <textarea value={amendDraft} onChange={(e) => setAmendDraft(e.target.value)} rows={2} placeholder="Corrected note…" className="flex-1 px-3 py-2 rounded-xl border border-soft-taupe text-sm resize-none" />
                  <button type="button" onClick={() => { void submitAmendment(n.id); }} disabled={!amendDraft.trim()} className="px-3 py-2 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white text-sm font-semibold self-start disabled:opacity-60">Save</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
