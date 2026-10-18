// ENTERPRISE CONSOLIDATED DELIVERY — the "open patient record" screen for
// Therapist and Medical Professional dashboards. Deliberately separate
// from src/pages/caregiver/CaregiverPatientView.tsx (which verifies via
// caregiver_patients) — this verifies via staff_patient_assignments,
// scoped to the specific organization AND the caller's own active
// assignment. Same "never PatientLayout" reasoning applies identically.
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import CareConversations from '@/components/communications/CareConversations';
import { ArrowLeft, Loader2, ShieldAlert, Pill, Heart, ClipboardList, Calendar, MapPin } from 'lucide-react';

interface PatientHeader {
  firstName: string; lastName: string; preferredName: string | null;
  dateOfBirth: string | null; dementiaStage: string | null; location: string | null;
}
interface MedicationRow { id: string; name: string; dosage: string; instructions: string }
interface MoodRow { id: string; mood: string; intensity: number; timestamp: string }

type LoadState = 'checking' | 'denied' | 'loading' | 'ready' | 'error';

export default function EnterpriseStaffPatientView({
  organizationId, patientId, onBack,
}: { organizationId: string; patientId: string; onBack: () => void }) {
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
      const [{ data: patientRow }, { data: medRows }, { data: moodRows }, { data: noteRows }] = await Promise.all([
        supabase.from('patients').select('first_name, last_name, preferred_name, date_of_birth, dementia_stage, location').eq('id', patientId).maybeSingle(),
        supabase.from('medications').select('id, name, dosage, instructions').eq('patient_id', patientId).eq('is_active', true).limit(50),
        supabase.from('mood_entries').select('id, mood, intensity, timestamp').eq('patient_id', patientId).order('timestamp', { ascending: false }).limit(10),
        supabase.from('care_partner_notes').select('category, note').eq('patient_id', patientId),
      ]);
      if (!patientRow) { setLoadState('error'); return; }
      setPatient({
        firstName: patientRow.first_name, lastName: patientRow.last_name, preferredName: patientRow.preferred_name,
        dateOfBirth: patientRow.date_of_birth, dementiaStage: patientRow.dementia_stage, location: patientRow.location,
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

  const displayName = patient.preferredName || `${patient.firstName} ${patient.lastName}`;

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-medium-gray hover:text-charcoal px-3 py-1.5 -ml-3 rounded-lg hover:bg-soft-taupe/30">
        <ArrowLeft className="w-4 h-4" /> Back to Caseload
      </button>

      <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-3">
        <h1 className="text-xl font-bold text-charcoal">{displayName}</h1>
        <p className="text-sm text-medium-gray">{patient.firstName} {patient.lastName}</p>
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

      <CareConversations patientId={patientId} patientName={displayName} />
    </div>
  );
}
