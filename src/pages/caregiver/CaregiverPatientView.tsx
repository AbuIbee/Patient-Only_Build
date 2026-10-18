// CAREGIVER DASHBOARD-FIRST NAVIGATION item 3 — "Open Patient Account".
//
// Deliberately NOT a render of PatientLayout/PatientHome/PatientMedications
// etc. Those components derive "whose data" from state.currentUser.id /
// AppContext (the SIGNED-IN patient's own session) throughout — rendering
// them unmodified for a caregiver viewing a DIFFERENT patient would
// silently attribute any write (a medication dose, a mood entry) to the
// CAREGIVER's own id instead of the patient being viewed. This is a new,
// self-contained, read-focused care-management view where every single
// query is scoped by an EXPLICIT, server-verified `patientId` prop — never
// derived from the caller's own session — so there is no path for a
// caregiver's own identity to leak into a write meant for the patient.
//
// Scope note (intentionally not full PatientLayout parity, reported
// honestly rather than silently assumed complete): medications, mood
// history, and memories are READ-ONLY here. Care Partner notes are
// read/write — that table (migration 031) already has caregiver-write RLS
// verified in an earlier round, and its write is naturally scoped by an
// explicit patientId with no identity-mixing risk. Fuller write parity
// for the other sections would require parametrizing each of those
// existing patient components (all currently keyed off
// state.currentUser.id) — real, but separate, follow-up work.
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { verifyCaregiverPatientLink } from '@/services/caregiverRegistrationService';
import {
  ArrowLeft, Loader2, ShieldAlert, Pill, Heart, Image as ImageIcon,
  ClipboardList, Phone, Calendar, MapPin, Save,
} from 'lucide-react';

const NOTE_CATEGORIES: { id: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'; title: string }[] = [
  { id: 'A', title: 'A — Daily Function' },
  { id: 'B', title: 'B — Nutrition & Hydration' },
  { id: 'C', title: 'C — Continence' },
  { id: 'D', title: 'D — Safety Events' },
  { id: 'E', title: 'E — Behavior & Responsiveness' },
  { id: 'F', title: 'F — Mood & Social Engagement' },
  { id: 'G', title: 'G — Symptoms & Comfort' },
];

interface PatientHeader {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  dateOfBirth: string | null;
  dementiaStage: string | null;
  diagnosisDate: string | null;
  location: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
}

interface MedicationRow { id: string; name: string; dosage: string; instructions: string; is_active: boolean }
interface MoodRow { id: string; mood: string; intensity: number; note: string | null; timestamp: string }
interface MemoryRow { id: string; title: string; description: string | null; date: string | null; created_at: string }

type LoadState = 'checking' | 'denied' | 'loading' | 'ready' | 'error';

export default function CaregiverPatientView({ patientId, onBack }: { patientId: string; onBack: () => void }) {
  const [loadState, setLoadState] = useState<LoadState>('checking');
  const [patient, setPatient] = useState<PatientHeader | null>(null);
  const [medications, setMedications] = useState<MedicationRow[]>([]);
  const [moods, setMoods] = useState<MoodRow[]>([]);
  const [memories, setMemories] = useState<MemoryRow[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savingCategory, setSavingCategory] = useState<string | null>(null);
  const [openCategory, setOpenCategory] = useState<string>('A');

  const loadPatient = useCallback(async () => {
    setLoadState('checking');

    // item 3 / item 6: server-side verification — NEVER rendered just
    // because a patientId prop/URL value was supplied. Re-run on every
    // mount (including a navigation back into this same view, or a
    // session refresh that remounts the tree) — never cached as "already
    // checked once."
    const authorized = await verifyCaregiverPatientLink(patientId);
    if (!authorized) {
      setLoadState('denied');
      return;
    }

    setLoadState('loading');
    try {
      const [{ data: patientRow, error: patientError }, { data: medRows }, { data: moodRows }, { data: memoryRows }, { data: noteRows }] = await Promise.all([
        supabase.from('patients')
          .select('id, first_name, last_name, preferred_name, date_of_birth, dementia_stage, diagnosis_date, location, emergency_contact_name, emergency_contact_phone')
          .eq('id', patientId).maybeSingle(),
        supabase.from('medications')
          .select('id, name, dosage, instructions, is_active')
          .eq('patient_id', patientId).eq('is_active', true).limit(50),
        supabase.from('mood_entries')
          .select('id, mood, intensity, note, timestamp')
          .eq('patient_id', patientId).order('timestamp', { ascending: false }).limit(10),
        supabase.from('memories')
          .select('id, title, description, date, created_at')
          .eq('patient_id', patientId).order('created_at', { ascending: false }).limit(10),
        supabase.from('care_partner_notes')
          .select('category, note')
          .eq('patient_id', patientId),
      ]);

      // Re-verify rather than trust an empty/null patient row as "not
      // found" — a revoked link mid-session (item: "Revalidate access
      // after navigation and on session refresh"; "Revoked caregiver
      // access is denied") must read as denied, not as a confusing blank
      // page.
      if (patientError || !patientRow) {
        const stillAuthorized = await verifyCaregiverPatientLink(patientId);
        setLoadState(stillAuthorized ? 'error' : 'denied');
        return;
      }

      setPatient({
        id: patientRow.id,
        firstName: patientRow.first_name,
        lastName: patientRow.last_name,
        preferredName: patientRow.preferred_name,
        dateOfBirth: patientRow.date_of_birth,
        dementiaStage: patientRow.dementia_stage,
        diagnosisDate: patientRow.diagnosis_date,
        location: patientRow.location,
        emergencyContactName: patientRow.emergency_contact_name,
        emergencyContactPhone: patientRow.emergency_contact_phone,
      });
      setMedications(medRows ?? []);
      setMoods(moodRows ?? []);
      setMemories(memoryRows ?? []);
      const byCategory: Record<string, string> = {};
      (noteRows ?? []).forEach((r) => { byCategory[r.category] = r.note; });
      setNotes(byCategory);
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, [patientId]);

  useEffect(() => {
    void loadPatient();
  }, [loadPatient]);

  const saveNote = async (category: string) => {
    setSavingCategory(category);
    try {
      // Re-verified here too — a long-open tab's access could have been
      // revoked between load and this specific write.
      const authorized = await verifyCaregiverPatientLink(patientId);
      if (!authorized) {
        setLoadState('denied');
        return;
      }
      const { error } = await supabase.from('care_partner_notes').upsert(
        { patient_id: patientId, category, note: notes[category] ?? '', updated_at: new Date().toISOString() },
        { onConflict: 'patient_id,category' },
      );
      if (error) throw error;
      toast.success('Note saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save note');
    } finally {
      setSavingCategory(null);
    }
  };

  if (loadState === 'checking' || loadState === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-warm-bronze" />
        <p className="text-sm text-medium-gray">Verifying access…</p>
      </div>
    );
  }

  if (loadState === 'denied') {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <ShieldAlert className="w-10 h-10 text-gentle-coral mx-auto" />
        <h2 className="text-lg font-bold text-charcoal">You don&apos;t have access to this patient</h2>
        <p className="text-sm text-medium-gray">
          This account is not currently linked to you as an authorized caregiver.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white font-semibold text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Caregiver Dashboard
        </button>
      </div>
    );
  }

  if (loadState === 'error' || !patient) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <p className="text-sm text-medium-gray">Something went wrong loading this patient. Please try again.</p>
        <button
          type="button"
          onClick={() => { void loadPatient(); }}
          className="px-5 py-2.5 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white font-semibold text-sm transition-colors"
        >
          Retry
        </button>
        <button type="button" onClick={onBack} className="block mx-auto text-sm text-medium-gray hover:text-charcoal underline">
          Back to Caregiver Dashboard
        </button>
      </div>
    );
  }

  const displayName = patient.preferredName || `${patient.firstName} ${patient.lastName}`;

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm font-semibold text-medium-gray hover:text-charcoal px-3 py-1.5 -ml-3 rounded-lg hover:bg-soft-taupe/30 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Caregiver Dashboard
      </button>

      <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-3">
        <h1 className="text-xl font-bold text-charcoal">{displayName}</h1>
        <p className="text-sm text-medium-gray">{patient.firstName} {patient.lastName}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-charcoal pt-2">
          {patient.dateOfBirth && (
            <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-warm-bronze flex-shrink-0" /> Born {patient.dateOfBirth}</div>
          )}
          {patient.dementiaStage && (
            <div className="flex items-center gap-2"><ClipboardList className="w-4 h-4 text-warm-bronze flex-shrink-0" /> {patient.dementiaStage} stage</div>
          )}
          {patient.location && (
            <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-warm-bronze flex-shrink-0" /> {patient.location}</div>
          )}
          {patient.emergencyContactPhone && (
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-warm-bronze flex-shrink-0" />
              {patient.emergencyContactName ? `${patient.emergencyContactName} — ` : ''}{patient.emergencyContactPhone}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Pill className="w-5 h-5 text-warm-bronze" />
          <h2 className="font-bold text-charcoal">Medications</h2>
        </div>
        {medications.length === 0 ? (
          <p className="text-sm text-medium-gray">No active medications on file.</p>
        ) : (
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
        <div className="flex items-center gap-2">
          <Heart className="w-5 h-5 text-warm-bronze" />
          <h2 className="font-bold text-charcoal">Recent Mood</h2>
        </div>
        {moods.length === 0 ? (
          <p className="text-sm text-medium-gray">No mood entries yet.</p>
        ) : (
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
        <div className="flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-warm-bronze" />
          <h2 className="font-bold text-charcoal">Recent Memories</h2>
        </div>
        {memories.length === 0 ? (
          <p className="text-sm text-medium-gray">No memories added yet.</p>
        ) : (
          <ul className="space-y-2">
            {memories.map((m) => (
              <li key={m.id} className="p-3 bg-warm-ivory rounded-xl border border-soft-taupe">
                <p className="font-medium text-charcoal text-sm">{m.title}</p>
                {m.description && <p className="text-xs text-medium-gray">{m.description}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-warm-bronze" />
          <h2 className="font-bold text-charcoal">Care Partner Notes</h2>
        </div>
        <div className="space-y-2">
          {NOTE_CATEGORIES.map((cat) => {
            const open = openCategory === cat.id;
            return (
              <div key={cat.id} className="border border-soft-taupe rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenCategory(open ? '' : cat.id)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-charcoal hover:bg-soft-taupe/10"
                >
                  {cat.title}
                  {notes[cat.id]?.trim() && <span className="text-xs text-soft-sage">● Noted</span>}
                </button>
                {open && (
                  <div className="px-4 pb-4 pt-1 space-y-2 border-t border-soft-taupe">
                    <textarea
                      value={notes[cat.id] ?? ''}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [cat.id]: e.target.value }))}
                      rows={3}
                      placeholder={`Write a note for ${cat.title}...`}
                      className="w-full px-3 py-2 border border-soft-taupe rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-warm-bronze resize-none"
                    />
                    <button
                      type="button"
                      onClick={() => { void saveNote(cat.id); }}
                      disabled={savingCategory === cat.id}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white text-sm font-semibold disabled:opacity-60 transition-colors"
                    >
                      {savingCategory === cat.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Save Note
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
