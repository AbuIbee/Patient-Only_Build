// ENTERPRISE CONSOLIDATED DELIVERY — the "open patient record" screen for
// Therapist and Medical Professional dashboards. Deliberately separate
// from src/pages/caregiver/CaregiverPatientView.tsx (which verifies via
// caregiver_patients) — this verifies via staff_patient_assignments,
// scoped to the specific organization AND the caller's own active
// assignment. Same "never PatientLayout" reasoning applies identically.
import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import CareConversations from '@/components/communications/CareConversations';
import { getProfessionalNotes, addProfessionalNote, type ProfessionalNote } from '@/services/professionalNotesService';
import type { StaffRole } from '@/services/organizationService';
import { ArrowLeft, Loader2, ShieldAlert, Pill, Heart, ClipboardList, Calendar, MapPin, Stethoscope, Send, BadgeCheck, AlertTriangle } from 'lucide-react';

// F01 — "Full Support — Covered by Organization" must be shown to the
// caregiver, with expired/ended/unlicensed states accurately
// distinguished, never a generic success banner. Backed by a direct read
// of covered_patient_memberships + organization_licenses (both already
// readable by assigned staff per migration 035's own RLS — no new
// backend needed), not the single collapsed boolean
// is_patient_enterprise_covered() RPC, specifically so this UI can tell
// "never covered," "coverage ended," and "org license inactive" apart
// rather than collapsing all three into one false negative.
export function CoverageBanner({ status }: { status: PatientHeader['coverageStatus'] }) {
  if (status === 'covered') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-soft-sage/30 border border-soft-sage text-sm font-semibold text-charcoal">
        <BadgeCheck className="w-4 h-4 text-deep-bronze" /> Full Support — Covered by Organization
      </div>
    );
  }
  if (status === 'not_covered') return null;
  const label = status === 'coverage_ended' ? 'Organization coverage for this patient has ended' : 'Organization license is not currently active';
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gentle-coral/15 border border-gentle-coral text-sm font-semibold text-charcoal">
      <AlertTriangle className="w-4 h-4 text-gentle-coral" /> {label}
    </div>
  );
}

// "Never grant medical ordering, prescribing, clinical administration or
// other regulated privileges solely through the selected job title" —
// this section is a free-text note, the exact same shape every other
// note_type in patient_notes already uses. staffRole only decides which
// note_type/label is shown; it grants no capability beyond writing text.
function ProfessionalNotesSection({ patientId, staffRole }: { patientId: string; staffRole: StaffRole }) {
  const noteType = staffRole === 'medical_professional' ? 'clinical_observation' : 'therapist_session';
  const title = staffRole === 'medical_professional' ? 'Clinical Observations' : 'Session Notes & Care Goals';
  const placeholder = staffRole === 'medical_professional'
    ? 'Record a clinical observation (not a diagnosis, order, or prescription)…'
    : 'Record a session note or care-goal update…';
  const [notes, setNotes] = useState<ProfessionalNote[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setNotes(await getProfessionalNotes(patientId, noteType));
    setLoading(false);
  }, [patientId, noteType]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      const { error } = await addProfessionalNote(patientId, noteType, draft);
      if (error) { toast.error(error); return; }
      setDraft('');
      await load();
    } finally {
      setSaving(false);
    }
  };

  if (staffRole === 'caregiver') return null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-3">
      <div className="flex items-center gap-2"><Stethoscope className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">{title}</h2></div>
      <div className="flex gap-2">
        <textarea
          value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} rows={2}
          className="flex-1 px-3 py-2.5 rounded-xl border border-soft-taupe text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze/40 resize-none"
        />
        <button
          type="button" onClick={() => { void save(); }} disabled={saving || !draft.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white text-sm font-semibold disabled:opacity-60 self-start"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-warm-bronze" />
      ) : notes.length === 0 ? (
        <p className="text-sm text-medium-gray">No entries yet.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="p-3 bg-warm-ivory rounded-xl border border-soft-taupe">
              <p className="text-sm text-charcoal whitespace-pre-wrap">{n.note}</p>
              <p className="text-[11px] text-medium-gray mt-1">{new Date(n.createdAt).toLocaleString()}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface PatientHeader {
  firstName: string; lastName: string; preferredName: string | null;
  dateOfBirth: string | null; dementiaStage: string | null; location: string | null;
  address: string | null; photoUrl: string | null; language: string | null;
  emergencyContactName: string | null; emergencyContactRelationship: string | null;
  emergencyContactPhone: string | null; emergencyContactEmail: string | null;
  coverageStatus: 'covered' | 'not_covered' | 'coverage_ended' | 'license_inactive';
}
interface MedicationRow { id: string; name: string; dosage: string; instructions: string }
interface MoodRow { id: string; mood: string; intensity: number; timestamp: string }

type LoadState = 'checking' | 'denied' | 'loading' | 'ready' | 'error';

export default function EnterpriseStaffPatientView({
  organizationId, patientId, onBack, staffRole = 'therapist', onReady,
}: {
  organizationId: string; patientId: string; onBack: () => void; staffRole?: StaffRole;
  // ROUND 6: when provided, a verified-access "ready" state renders
  // this callback's result INSTEAD of this component's own flat body —
  // used by EnterpriseCaregiverDashboard to delegate to the full
  // tabbed EnterprisePatientRecordTabs (P01-P22) while reusing this
  // component's already-reviewed staff_patient_assignments access
  // check unchanged. StaffCaseloadDashboard's existing therapist/
  // medical-professional callers omit this and keep the original body.
  onReady?: (patient: PatientHeader) => React.ReactNode;
}) {
  const [loadState, setLoadState] = useState<LoadState>('checking');
  const [patient, setPatient] = useState<PatientHeader | null>(null);
  const [medications, setMedications] = useState<MedicationRow[]>([]);
  const [moods, setMoods] = useState<MoodRow[]>([]);
  const [notes, setNotes] = useState<{ category: string; note: string }[]>([]);

  const load = useCallback(async () => {
    setLoadState('checking');
    const { data: assignment } = await supabase
      .from('staff_patient_assignments')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('patient_id', patientId)
      .eq('is_active', true)
      .maybeSingle();
    if (!assignment) { setLoadState('denied'); return; }

    setLoadState('loading');
    try {
      const [{ data: patientRow }, { data: medRows }, { data: moodRows }, { data: noteRows }, { data: coverageRow }, { data: licenseRow }] = await Promise.all([
        supabase.from('patients').select('first_name, last_name, preferred_name, date_of_birth, dementia_stage, location, address, photo_url, preferences_language, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, emergency_contact_email').eq('id', patientId).maybeSingle(),
        supabase.from('medications').select('id, name, dosage, instructions').eq('patient_id', patientId).eq('is_active', true).limit(50),
        supabase.from('mood_entries').select('id, mood, intensity, timestamp').eq('patient_id', patientId).order('timestamp', { ascending: false }).limit(10),
        supabase.from('care_partner_notes').select('category, note').eq('patient_id', patientId),
        supabase.from('covered_patient_memberships').select('status').eq('organization_id', organizationId).eq('patient_id', patientId).maybeSingle(),
        supabase.from('organization_licenses').select('status').eq('organization_id', organizationId).maybeSingle(),
      ]);
      if (!patientRow) { setLoadState('error'); return; }
      const coverageStatus: PatientHeader['coverageStatus'] =
        !coverageRow ? 'not_covered'
        : coverageRow.status === 'ended' ? 'coverage_ended'
        : (!licenseRow || licenseRow.status !== 'active') ? 'license_inactive'
        : 'covered';
      setPatient({
        firstName: patientRow.first_name, lastName: patientRow.last_name, preferredName: patientRow.preferred_name,
        dateOfBirth: patientRow.date_of_birth, dementiaStage: patientRow.dementia_stage, location: patientRow.location,
        address: patientRow.address, photoUrl: patientRow.photo_url, language: patientRow.preferences_language,
        emergencyContactName: patientRow.emergency_contact_name, emergencyContactRelationship: patientRow.emergency_contact_relationship,
        emergencyContactPhone: patientRow.emergency_contact_phone, emergencyContactEmail: patientRow.emergency_contact_email,
        coverageStatus,
      });
      setMedications(medRows ?? []);
      setMoods(moodRows ?? []);
      setNotes((noteRows ?? []).filter((n) => n.note?.trim()));
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, [organizationId, patientId]);

  useEffect(() => { void load(); }, [load]);

  if (loadState === 'checking' || loadState === 'loading') {
    return <div className="flex flex-col items-center justify-center py-20 gap-3"><Loader2 className="w-8 h-8 animate-spin text-warm-bronze" /><p className="text-sm text-medium-gray">Verifying access…</p></div>;
  }
  if (loadState === 'denied') {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <ShieldAlert className="w-10 h-10 text-gentle-coral mx-auto" />
        <h2 className="text-lg font-bold text-charcoal">You don&apos;t have access to this patient</h2>
        <p className="text-sm text-medium-gray">This patient is not currently assigned to you within this organization.</p>
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white font-semibold text-sm">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>
    );
  }
  if (loadState === 'error' || !patient) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <p className="text-sm text-medium-gray">Something went wrong loading this patient.</p>
        <button type="button" onClick={() => { void load(); }} className="px-5 py-2.5 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white font-semibold text-sm">Retry</button>
      </div>
    );
  }

  if (onReady) {
    return <>{onReady(patient)}</>;
  }

  const displayName = patient.preferredName || `${patient.firstName} ${patient.lastName}`;

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-medium-gray hover:text-charcoal px-3 py-1.5 -ml-3 rounded-lg hover:bg-soft-taupe/30">
        <ArrowLeft className="w-4 h-4" /> Back to Caseload
      </button>

      <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-3">
        <h1 className="text-xl font-bold text-charcoal">{displayName}</h1>
        <p className="text-sm text-medium-gray">{patient.firstName} {patient.lastName}</p>
        <CoverageBanner status={patient.coverageStatus} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-charcoal pt-2">
          {patient.dateOfBirth && <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-warm-bronze" /> Born {patient.dateOfBirth}</div>}
          {patient.dementiaStage && <div className="flex items-center gap-2"><ClipboardList className="w-4 h-4 text-warm-bronze" /> {patient.dementiaStage} stage</div>}
          {patient.location && <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-warm-bronze" /> {patient.location}</div>}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2"><Pill className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">Medications</h2></div>
        {medications.length === 0 ? <p className="text-sm text-medium-gray">No active medications on file.</p> : (
          <ul className="space-y-2">
            {medications.map((m) => (
              <li key={m.id} className="p-3 bg-warm-ivory rounded-xl border border-soft-taupe">
                <p className="font-medium text-charcoal text-sm">{m.name} — {m.dosage}</p>
                <p className="text-xs text-medium-gray">{m.instructions}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2"><Heart className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">Recent Mood</h2></div>
        {moods.length === 0 ? <p className="text-sm text-medium-gray">No mood entries yet.</p> : (
          <ul className="space-y-2">
            {moods.map((m) => (
              <li key={m.id} className="flex items-center justify-between p-3 bg-warm-ivory rounded-xl border border-soft-taupe text-sm">
                <span className="text-charcoal font-medium">{m.mood} ({m.intensity}/10)</span>
                <span className="text-xs text-medium-gray">{new Date(m.timestamp).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2"><ClipboardList className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">Care Partner Observations</h2></div>
        {notes.length === 0 ? <p className="text-sm text-medium-gray">No notes recorded yet.</p> : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.category} className="p-3 bg-warm-ivory rounded-xl border border-soft-taupe">
                <p className="text-xs font-semibold text-warm-bronze mb-1">Category {n.category}</p>
                <p className="text-sm text-charcoal">{n.note}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ProfessionalNotesSection patientId={patientId} staffRole={staffRole} />

      <CareConversations patientId={patientId} patientName={displayName} />
    </div>
  );
}
