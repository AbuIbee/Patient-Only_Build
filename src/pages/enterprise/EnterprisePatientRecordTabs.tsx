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
  ArrowLeft, Loader2, ClipboardList, Calendar, MapPin, Stethoscope, Send,
  ShieldAlert, FileText, Pill, Heart, Activity, Target, Clock, Globe,
} from 'lucide-react';
import type { StaffRole } from '@/services/organizationService';
import type { MoodType } from '@/types/supabase';
import { CoverageBanner, type PatientHeader } from './EnterpriseStaffPatientView';
import { getProfessionalNotes, addProfessionalNote, type ProfessionalNote } from '@/services/professionalNotesService';
import CareConversations from '@/components/communications/CareConversations';
import { getHelpActivationHistory, type HelpActivationHistoryEntry } from '@/services/helpActivationService';
import {
  getPatientDiagnoses, recordPatientDiagnosis, getPatientAllergies, recordPatientAllergy,
  getPatientCarePlans, recordPatientCarePlan, getPatientVitals, recordPatientVitals,
  getTherapyGoals, recordTherapyGoal, getCarePreferences, recordCarePreference,
  getPatientProviders, recordPatientProvider,
  type PatientDiagnosis, type PatientAllergy, type PatientCarePlan, type PatientVitals, type TherapyGoal, type CarePreference, type PatientCareProvider,
} from '@/services/patientClinicalRecordService';
import {
  getMyVisits, getPatientShiftHandoffs, getPatientIncidentReports, reportScopeConcern,
  type CaregiverVisit, type IncidentReport,
} from '@/services/enterpriseCaregiverWorkToolsService';

type TabKey = 'overview' | 'medical' | 'medications' | 'ag' | 'carePlan' | 'appointments' | 'documents' | 'safety' | 'communications' | 'timeline';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' }, { key: 'medical', label: 'Medical' }, { key: 'medications', label: 'Medications' },
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
function IntakeSummaryCard({ patientId }: { patientId: string }) {
  const [intake, setIntake] = useState<{ doctor_therapist_name: string | null; doctor_therapist_phone: string | null; preferred_hospital: string | null; medications_and_dosage: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void supabase.from('patient_intake').select('doctor_therapist_name, doctor_therapist_phone, preferred_hospital, medications_and_dosage').eq('patient_profile_id', patientId).maybeSingle()
      .then(({ data }) => { setIntake(data ?? null); setLoading(false); });
  }, [patientId]);
  if (loading) return null;
  if (!intake) return null;
  return (
    <SectionCard title="Patient Intake Information" icon={ClipboardList}>
      <div className="text-sm text-charcoal space-y-1">
        {intake.doctor_therapist_name && <p>Doctor/Therapist: {intake.doctor_therapist_name}{intake.doctor_therapist_phone ? ` · ${intake.doctor_therapist_phone}` : ''}</p>}
        {intake.preferred_hospital && <p>Preferred hospital: {intake.preferred_hospital}</p>}
        {intake.medications_and_dosage && <p>Intake-reported medications: {intake.medications_and_dosage}</p>}
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

  const load = useCallback(() => void Promise.all([getCarePreferences(patientId), getPatientCarePlans(patientId)]).then(([p, cp]) => { setPreferences(p); setCarePlans(cp); setLoading(false); }), [patientId]);
  useEffect(() => { load(); }, [load]);
  const currentPlan = carePlans.find((p) => p.isCurrent);

  const addPreference = async () => {
    if (!newPrefDescription.trim()) return;
    const { error } = await recordCarePreference(patientId, newPrefCategory, newPrefDescription.trim());
    if (error) { toast.error(error); return; }
    setNewPrefDescription(''); load();
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

function DocumentsTab({ patientId }: { patientId: string }) {
  const [docs, setDocs] = useState<{ id: string; file_name: string; section: string; note_text: string | null; uploaded_at: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => void supabase.from('patient_document_uploads').select('id, file_name, section, note_text, uploaded_at').eq('patient_id', patientId).order('uploaded_at', { ascending: false })
    .then(({ data }) => { setDocs(data ?? []); setLoading(false); }), [patientId]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Loader2 className="w-6 h-6 animate-spin text-warm-bronze mx-auto" />;
  return (
    <SectionCard title="Medical Documents" icon={FileText}>
      {docs.length === 0 ? <p className="text-sm text-medium-gray">No documents on file for this patient.</p> : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li key={d.id} className="p-3 bg-warm-ivory rounded-xl border border-soft-taupe text-sm">
              <p className="font-medium text-charcoal">{d.file_name}</p>
              <p className="text-xs text-medium-gray capitalize">{d.section.replace('_', ' ')}{d.uploaded_at ? ` · ${new Date(d.uploaded_at).toLocaleDateString()}` : ''}</p>
              {d.note_text && <p className="text-xs text-charcoal mt-1">{d.note_text}</p>}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-medium-gray">Secure signed-URL download and upload for Enterprise staff are not yet wired into this view.</p>
    </SectionCard>
  );
}

// P03/P16/P18 — allergies, emergency contacts/safety plan, incidents.
function SafetyTab({ patientId, patientHeader }: { patientId: string; patientHeader: PatientHeader }) {
  const [allergies, setAllergies] = useState<PatientAllergy[]>([]);
  const [incidents, setIncidents] = useState<IncidentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [newAllergen, setNewAllergen] = useState('');

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
      </SectionCard>

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

  const load = useCallback(async () => {
    if (staffRole === 'medical_professional' || staffRole === 'therapist') {
      const noteType = staffRole === 'medical_professional' ? 'clinical_observation' : 'therapist_session';
      setNotes(await getProfessionalNotes(patientId, noteType));
    } else {
      const { data } = await supabase.from('patient_notes').select('id, note, created_at, updated_at').eq('patient_id', patientId).eq('note_type', 'general').order('created_at', { ascending: false });
      setNotes((data ?? []).map((r) => ({ id: r.id, note: r.note, createdAt: r.created_at, updatedAt: r.updated_at ?? r.created_at })));
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
  return (
    <SectionCard title={staffRole === 'caregiver' ? 'Care Notes & Observations' : staffRole === 'medical_professional' ? 'Clinical Observations' : 'Session Notes & Care Goals'} icon={Stethoscope}>
      <div className="flex gap-2">
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder="Record a note…" className="flex-1 px-3 py-2 rounded-xl border border-soft-taupe text-sm resize-none" />
        <button type="button" onClick={() => { void save(); }} disabled={!draft.trim()} className="px-3 py-2 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white text-sm font-semibold self-start"><Send className="w-4 h-4" /></button>
      </div>
      {loading ? <Loader2 className="w-5 h-5 animate-spin text-warm-bronze" /> : notes.length === 0 ? <p className="text-sm text-medium-gray">No entries yet.</p> : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="p-3 bg-warm-ivory rounded-xl border border-soft-taupe">
              <p className="text-sm text-charcoal whitespace-pre-wrap">{n.note}</p>
              <p className="text-[11px] text-medium-gray mt-1">{new Date(n.createdAt).toLocaleString()}</p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
