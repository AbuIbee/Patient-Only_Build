// CAREGIVER DASHBOARD-FIRST NAVIGATION item 3 — "Open Patient Account".
//
// Deliberately NOT a render of PatientLayout/PatientHome/PatientMedications
// etc. Those components derive "whose data" from state.currentUser.id /
// AppContext (the SIGNED-IN patient's own session) throughout — rendering
// them unmodified for a caregiver viewing a DIFFERENT patient would
// silently attribute any write (a medication dose, a mood entry) to the
// CAREGIVER's own id instead of the patient being viewed. This is a
// self-contained, read-focused care-management view where every single
// query is scoped by an EXPLICIT, server-verified `patientId` prop — never
// derived from the caller's own session — so there is no path for a
// caregiver's own identity to leak into a write meant for the patient.
//
// CRITICAL OWNER-REPORTED REMEDIATION Correction E — "Expand the existing
// caregiver's patient view into a comprehensive Patient Care Record":
// every section below queries a table this audit confirmed already has a
// working caregiver-read RLS policy via caregiver_patients (appointments,
// care_team_members, patient_document_uploads, medication_logs,
// care_partner_checkins — simply never wired into this view before), or a
// policy added alongside this file in the same correction cycle
// (patient_intake, patient_emergency_contacts — migration 047 — which
// previously only ever checked `*_profile_id = auth.uid()`, the exact
// "incorrect reliance on auth.uid() as the patient identity" this
// correction was asked to find). Nothing here invents data: a section
// with nothing recorded says so plainly instead of fabricating a record
// (patients.allergies does not exist anywhere in this schema — that
// section states this honestly rather than showing a blank that could be
// misread as "no known allergies").
//
// Per explicit instruction, entertainment photo/video content (memories)
// and game-playing activity are excluded from this record — the former
// Memories section is removed, not relocated.
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { verifyCaregiverPatientLink } from '@/services/caregiverRegistrationService';
import { getHelpActivationHistory, type HelpActivationHistoryEntry } from '@/services/helpActivationService';
import CareConversations from '@/components/communications/CareConversations';
import {
  ArrowLeft, Loader2, ShieldAlert, Pill, Heart, ClipboardList, Phone, Calendar, MapPin, Save,
  FileText, Users, CalendarClock, ShieldX, Stethoscope, AlertTriangle, Download, Mail,
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

const DOC_BUCKET = 'patient-documents';

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
interface IntakeRow {
  doctor_therapist_name: string | null; doctor_therapist_phone: string | null; preferred_hospital: string | null;
  medications_and_dosage: string | null; patient_phone: string | null; patient_email: string | null;
  patient_street_address: string | null; patient_city: string | null; patient_state: string | null; patient_zip_code: string | null;
}
interface AppointmentRow { id: string; title: string; provider: string | null; location: string | null; date: string; time: string | null; notes: string | null }
interface CareTeamRow { id: string; name: string; role: string | null; specialty: string | null; organization: string | null; phone: string | null; email: string | null; is_primary: boolean }
interface DocumentRow { id: string; file_name: string; section: string | null; note_text: string | null; uploaded_at: string; storage_path: string; signedUrl: string }
interface EmergencyContactRow { id: string; full_name: string; relationship: string | null; phone: string | null; email: string | null; address: string | null }
interface CheckinRow {
  id: string; check_in_date: string; submitted_by_name: string | null;
  sa_falls: string | null; sa_safety_concerns: boolean | null;
  be_agitation: string | null; be_wandering_risk: string | null;
  mo_mood: string | null; sy_pain: string | null; sy_symptoms: string[] | null;
}

type LoadState = 'checking' | 'denied' | 'loading' | 'ready' | 'error';

async function signDocUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(DOC_BUCKET).createSignedUrl(storagePath, 3600);
  if (error || !data) return '';
  return data.signedUrl;
}

export default function CaregiverPatientView({ patientId, onBack }: { patientId: string; onBack: () => void }) {
  const [loadState, setLoadState] = useState<LoadState>('checking');
  const [patient, setPatient] = useState<PatientHeader | null>(null);
  const [medications, setMedications] = useState<MedicationRow[]>([]);
  const [moods, setMoods] = useState<MoodRow[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savingCategory, setSavingCategory] = useState<string | null>(null);
  const [openCategory, setOpenCategory] = useState<string>('A');
  const [intake, setIntake] = useState<IntakeRow | null>(null);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [careTeam, setCareTeam] = useState<CareTeamRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContactRow[]>([]);
  const [checkins, setCheckins] = useState<CheckinRow[]>([]);
  const [helpHistory, setHelpHistory] = useState<HelpActivationHistoryEntry[]>([]);

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
      const [
        { data: patientRow, error: patientError }, { data: medRows }, { data: moodRows }, { data: noteRows },
        { data: intakeRow }, { data: apptRows }, { data: teamRows }, { data: docRows }, { data: contactRows },
        { data: checkinRows }, helpRows,
      ] = await Promise.all([
        supabase.from('patients')
          .select('id, first_name, last_name, preferred_name, date_of_birth, dementia_stage, diagnosis_date, location, emergency_contact_name, emergency_contact_phone')
          .eq('id', patientId).maybeSingle(),
        supabase.from('medications')
          .select('id, name, dosage, instructions, is_active')
          .eq('patient_id', patientId).order('is_active', { ascending: false }).limit(100),
        supabase.from('mood_entries')
          .select('id, mood, intensity, note, timestamp')
          .eq('patient_id', patientId).order('timestamp', { ascending: false }).limit(30),
        supabase.from('care_partner_notes')
          .select('category, note')
          .eq('patient_id', patientId),
        supabase.from('patient_intake')
          .select('doctor_therapist_name, doctor_therapist_phone, preferred_hospital, medications_and_dosage, patient_phone, patient_email, patient_street_address, patient_city, patient_state, patient_zip_code')
          .eq('patient_profile_id', patientId).maybeSingle(),
        supabase.from('appointments')
          .select('id, title, provider, location, date, time, notes')
          .eq('patient_id', patientId).order('date', { ascending: false }).limit(30),
        supabase.from('care_team_members')
          .select('id, name, role, specialty, organization, phone, email, is_primary')
          .eq('patient_id', patientId),
        supabase.from('patient_document_uploads')
          .select('id, file_name, section, note_text, uploaded_at, storage_path')
          .eq('patient_id', patientId).order('uploaded_at', { ascending: false }).limit(50),
        supabase.from('patient_emergency_contacts')
          .select('id, full_name, relationship, phone, email, address')
          .eq('patient_id', patientId),
        supabase.from('care_partner_checkins')
          .select('id, check_in_date, submitted_by_name, sa_falls, sa_safety_concerns, be_agitation, be_wandering_risk, mo_mood, sy_pain, sy_symptoms')
          .eq('patient_id', patientId).order('check_in_date', { ascending: false }).limit(10),
        getHelpActivationHistory(patientId),
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
      const byCategory: Record<string, string> = {};
      (noteRows ?? []).forEach((r) => { byCategory[r.category] = r.note; });
      setNotes(byCategory);
      setIntake(intakeRow ?? null);
      setAppointments(apptRows ?? []);
      setCareTeam(teamRows ?? []);
      setEmergencyContacts(contactRows ?? []);
      setCheckins(checkinRows ?? []);
      setHelpHistory(helpRows);

      const docsWithUrls = await Promise.all((docRows ?? []).map(async (d) => ({ ...d, signedUrl: await signDocUrl(d.storage_path) })));
      setDocuments(docsWithUrls);

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
  const activeMeds = medications.filter((m) => m.is_active);
  const pastMeds = medications.filter((m) => !m.is_active);

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
            <div className="flex items-center gap-2"><ClipboardList className="w-4 h-4 text-warm-bronze flex-shrink-0" /> {patient.dementiaStage} stage dementia{patient.diagnosisDate ? ` — diagnosed ${patient.diagnosisDate}` : ''}</div>
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

      {/* Allergies & safety instructions — honest "not recorded" rather
          than inventing a field this schema has nowhere else. */}
      <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-2">
        <div className="flex items-center gap-2"><ShieldX className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">Allergies &amp; Safety Instructions</h2></div>
        <p className="text-sm text-medium-gray">No allergy information has been recorded in this system for {displayName}.</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2"><Pill className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">Medications</h2></div>
        {activeMeds.length === 0 ? <p className="text-sm text-medium-gray">No active medications on file.</p> : (
          <ul className="space-y-2">
            {activeMeds.map((m) => (
              <li key={m.id} className="p-3 bg-warm-ivory rounded-xl border border-soft-taupe">
                <p className="font-medium text-charcoal text-sm">{m.name} — {m.dosage}</p>
                <p className="text-xs text-medium-gray">{m.instructions}</p>
              </li>
            ))}
          </ul>
        )}
        {pastMeds.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-medium-gray font-medium">Medication history ({pastMeds.length} discontinued)</summary>
            <ul className="space-y-2 mt-2">
              {pastMeds.map((m) => (
                <li key={m.id} className="p-3 bg-soft-taupe/10 rounded-xl border border-soft-taupe opacity-80">
                  <p className="font-medium text-charcoal text-sm">{m.name} — {m.dosage} <span className="text-xs text-medium-gray">(discontinued)</span></p>
                  <p className="text-xs text-medium-gray">{m.instructions}</p>
                </li>
              ))}
            </ul>
          </details>
        )}
        {intake?.medications_and_dosage && (
          <div className="p-3 bg-warm-ivory rounded-xl border border-soft-taupe">
            <p className="text-xs font-semibold text-warm-bronze mb-1">From patient intake</p>
            <p className="text-sm text-charcoal whitespace-pre-wrap">{intake.medications_and_dosage}</p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2"><Heart className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">Mood &amp; Behavioral History</h2></div>
        {moods.length === 0 ? <p className="text-sm text-medium-gray">No mood entries yet.</p> : (
          <ul className="space-y-2 max-h-72 overflow-y-auto">
            {moods.map((m) => (
              <li key={m.id} className="flex items-center justify-between p-3 bg-warm-ivory rounded-xl border border-soft-taupe text-sm">
                <span className="text-charcoal font-medium">{m.mood} ({m.intensity}/10){m.note ? ` — ${m.note}` : ''}</span>
                <span className="text-xs text-medium-gray flex-shrink-0 ml-2">{new Date(m.timestamp).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Care Partner A-G structured check-ins — distinct from, and more
          detailed than, the free-text Care Partner Notes below. */}
      <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">Care Partner A–G Check-In Reports</h2></div>
        {checkins.length === 0 ? <p className="text-sm text-medium-gray">No structured check-in reports yet.</p> : (
          <ul className="space-y-2">
            {checkins.map((c) => (
              <li key={c.id} className="p-3 bg-warm-ivory rounded-xl border border-soft-taupe text-sm space-y-1">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-charcoal">{new Date(c.check_in_date).toLocaleDateString()}</p>
                  {c.submitted_by_name && <span className="text-xs text-medium-gray">by {c.submitted_by_name}</span>}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-medium-gray">
                  {c.sa_safety_concerns && <span className="text-gentle-coral font-semibold">Safety concern flagged</span>}
                  {c.sa_falls && <span>Falls: {c.sa_falls}</span>}
                  {c.mo_mood && <span>Mood: {c.mo_mood}</span>}
                  {c.be_agitation && <span>Agitation: {c.be_agitation}</span>}
                  {c.be_wandering_risk && <span>Wandering risk: {c.be_wandering_risk}</span>}
                  {c.sy_pain && <span>Pain: {c.sy_pain}</span>}
                  {c.sy_symptoms && c.sy_symptoms.length > 0 && <span>Symptoms: {c.sy_symptoms.join(', ')}</span>}
                </div>
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

      <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2"><CalendarClock className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">Appointments &amp; Care Schedule</h2></div>
        {appointments.length === 0 ? <p className="text-sm text-medium-gray">No appointments on file.</p> : (
          <ul className="space-y-2">
            {appointments.map((a) => (
              <li key={a.id} className="p-3 bg-warm-ivory rounded-xl border border-soft-taupe text-sm">
                <p className="font-medium text-charcoal">{a.title} — {new Date(a.date).toLocaleDateString()}{a.time ? ` at ${a.time}` : ''}</p>
                {(a.provider || a.location) && <p className="text-xs text-medium-gray">{[a.provider, a.location].filter(Boolean).join(' · ')}</p>}
                {a.notes && <p className="text-xs text-medium-gray mt-0.5">{a.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2"><Stethoscope className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">Physicians, Therapists &amp; Care-Team Contacts</h2></div>
        {careTeam.length === 0 && !intake?.doctor_therapist_name ? (
          <p className="text-sm text-medium-gray">No care-team contacts on file.</p>
        ) : (
          <ul className="space-y-2">
            {intake?.doctor_therapist_name && (
              <li className="p-3 bg-warm-ivory rounded-xl border border-soft-taupe text-sm">
                <p className="font-medium text-charcoal">{intake.doctor_therapist_name} <span className="text-xs text-medium-gray">(from intake)</span></p>
                <p className="text-xs text-medium-gray">{[intake.doctor_therapist_phone, intake.preferred_hospital].filter(Boolean).join(' · ')}</p>
              </li>
            )}
            {careTeam.map((c) => (
              <li key={c.id} className="p-3 bg-warm-ivory rounded-xl border border-soft-taupe text-sm">
                <p className="font-medium text-charcoal">{c.name} {c.is_primary && <span className="text-xs text-warm-bronze">(Primary)</span>}</p>
                <p className="text-xs text-medium-gray">{[c.role, c.specialty, c.organization].filter(Boolean).join(' · ')}</p>
                <p className="text-xs text-medium-gray">{[c.phone, c.email].filter(Boolean).join(' · ')}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2"><FileText className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">Medical Documents &amp; Care Plans</h2></div>
        {documents.length === 0 ? <p className="text-sm text-medium-gray">No documents uploaded.</p> : (
          <ul className="space-y-2">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 p-3 bg-warm-ivory rounded-xl border border-soft-taupe text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-charcoal truncate">{d.file_name}</p>
                  <p className="text-xs text-medium-gray">{[d.section, new Date(d.uploaded_at).toLocaleDateString()].filter(Boolean).join(' · ')}{d.note_text ? ` — ${d.note_text}` : ''}</p>
                </div>
                {d.signedUrl && (
                  <a href={d.signedUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 p-2 rounded-lg text-warm-bronze hover:bg-warm-bronze/10" aria-label="Open document">
                    <Download className="w-4 h-4" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2"><Users className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">Emergency Contacts</h2></div>
        {emergencyContacts.length === 0 && !patient.emergencyContactPhone ? (
          <p className="text-sm text-medium-gray">No emergency contacts on file.</p>
        ) : (
          <ul className="space-y-2">
            {emergencyContacts.map((c) => (
              <li key={c.id} className="p-3 bg-warm-ivory rounded-xl border border-soft-taupe text-sm">
                <p className="font-medium text-charcoal">{c.full_name} {c.relationship && <span className="text-xs text-medium-gray">({c.relationship})</span>}</p>
                <p className="text-xs text-medium-gray flex items-center gap-1">{c.phone && <><Phone className="w-3 h-3" /> {c.phone}</>}</p>
                {c.email && <p className="text-xs text-medium-gray flex items-center gap-1"><Mail className="w-3 h-3" /> {c.email}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-gentle-coral" /><h2 className="font-bold text-charcoal">HELP Activation History</h2></div>
        <p className="text-xs text-medium-gray">
          A record of when {displayName} used the emergency HELP button. This reflects when the activation was recorded, not whether a call connected — and whether you or another caregiver has acknowledged it.
        </p>
        {helpHistory.length === 0 ? <p className="text-sm text-medium-gray">No HELP activations recorded.</p> : (
          <ul className="space-y-2">
            {helpHistory.map((h) => (
              <li key={h.id} className="p-3 bg-gentle-coral/5 border border-gentle-coral/20 rounded-xl text-sm">
                <p className="font-medium text-charcoal">{new Date(h.createdAt).toLocaleString()}</p>
                <p className="text-xs text-medium-gray">
                  {h.phoneDialed ? `Call attempted to ${h.phoneDialed}. ` : ''}
                  {h.acknowledgedCount > 0 ? `Acknowledged by ${h.acknowledgedBy.join(', ')}.` : 'Not yet acknowledged by any caregiver.'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CareConversations patientId={patientId} patientName={displayName} />
    </div>
  );
}
