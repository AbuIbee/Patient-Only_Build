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
import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase, logDocumentAccess } from '@/lib/supabase';
import { toast } from 'sonner';
import type { MoodType } from '@/types';
import { verifyCaregiverPatientLink } from '@/services/caregiverRegistrationService';
import { getHelpActivationHistory, type HelpActivationHistoryEntry } from '@/services/helpActivationService';
import {
  inviteTherapist, getPatientCareTeamConnections, revokeTherapistConnection, type CareTeamConnection,
} from '@/services/therapistConnectionService';
import CareConversations from '@/components/communications/CareConversations';
import {
  ArrowLeft, Loader2, ShieldAlert, Pill, Heart, ClipboardList, Phone, Calendar, MapPin, Save,
  FileText, Users, CalendarClock, ShieldX, Stethoscope, AlertTriangle, Download, Mail, UserPlus, X,
} from 'lucide-react';

// CODEX-VERIFIED CRITICAL REMEDIATION Critical 9 — "Add a clear Care
// Team management entry within the authorized patient record" +
// "Allow an authorized caregiver to initiate an invitation or
// connection request for the patient's therapist." The invite form only
// ever calls caregiver_invite_therapist() (migration 051) — it never
// writes therapist_relationships directly, so there is no path here
// that fakes a connection into existing.
function CareTeamCommunicationAccess({ patientId }: { patientId: string }) {
  const [connections, setConnections] = useState<CareTeamConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [relationshipType, setRelationshipType] = useState<'primary' | 'consulting' | 'supervising' | 'secondary'>('consulting');
  const [inviting, setInviting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setConnections(await getPatientCareTeamConnections(patientId));
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const invite = async () => {
    if (!email.trim()) { toast.error('An email address is required.'); return; }
    setInviting(true);
    try {
      const { error } = await inviteTherapist(patientId, email, relationshipType);
      if (error) { toast.error(error); return; }
      toast.success(`Invitation sent to ${email} — they will see it when they next sign in.`);
      setEmail('');
      await refresh();
    } finally {
      setInviting(false);
    }
  };

  const revoke = async (therapistId: string, name: string) => {
    if (!window.confirm(`End ${name}'s connection to this patient? They will immediately lose Care Communications access.`)) return;
    const { error } = await revokeTherapistConnection(patientId, therapistId);
    if (error) { toast.error(error); return; }
    toast.success('Connection ended.');
    await refresh();
  };

  const statusLabel = (status: CareTeamConnection['status']) => {
    switch (status) {
      case 'active': return { text: 'Active — can message and be messaged', cls: 'text-soft-sage' };
      case 'pending': return { text: 'Invitation pending — awaiting their response', cls: 'text-amber-700' };
      case 'declined': return { text: 'Invitation declined', cls: 'text-gentle-coral' };
      case 'ended': case 'revoked': return { text: 'Connection ended', cls: 'text-medium-gray' };
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-3">
      <div className="flex items-center gap-2"><UserPlus className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">Care Team Communication Access</h2></div>
      <p className="text-xs text-medium-gray">
        Invite this patient's therapist so they can appear as a Care Communications recipient. No one is added automatically — the therapist must accept before they gain any access.
      </p>
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        This platform does not independently verify a therapist's license or credentials — accepting an invitation confirms only that this person controls the email address you invited. For credential-verified clinical staff, use an Enterprise organization instead.
      </p>

      <div className="flex flex-col sm:flex-row gap-2">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="therapist@example.com (must already have an account)" className="min-w-0 flex-1 px-3 py-2.5 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze" />
        <select value={relationshipType} onChange={(e) => setRelationshipType(e.target.value as typeof relationshipType)} className="px-3 py-2.5 border border-soft-taupe rounded-xl text-sm sm:w-44">
          <option value="consulting">Consulting</option>
          <option value="primary">Primary</option>
          <option value="supervising">Supervising</option>
          <option value="secondary">Secondary</option>
        </select>
        <button type="button" onClick={() => { void invite(); }} disabled={inviting} className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white text-sm font-semibold disabled:opacity-60 whitespace-nowrap">
          {inviting ? 'Inviting…' : 'Invite Therapist'}
        </button>
      </div>

      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-warm-bronze" />
      ) : connections.length === 0 ? (
        <p className="text-sm text-medium-gray">No therapist invitations or connections yet.</p>
      ) : (
        <ul className="space-y-2">
          {connections.map((c) => {
            const label = statusLabel(c.status);
            return (
              <li key={c.connectionId} className="flex items-center justify-between gap-3 p-3 bg-warm-ivory rounded-xl border border-soft-taupe text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-charcoal truncate">{c.firstName} {c.lastName} <span className="text-xs text-medium-gray">({c.relationshipType})</span></p>
                  <p className={`text-xs ${label.cls}`}>{label.text}</p>
                </div>
                {c.status === 'active' && (
                  <button type="button" onClick={() => { void revoke(c.therapistId, `${c.firstName} ${c.lastName}`); }} className="flex-shrink-0 p-2 rounded-lg text-gentle-coral hover:bg-gentle-coral/10" aria-label="End connection">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

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

interface MedicationRow { id: string; name: string; dosage: string; instructions: string; side_effects: string | null; is_active: boolean }
interface MoodRow { id: string; mood: string; intensity: number; note: string | null; timestamp: string }
interface IntakeRow {
  doctor_therapist_name: string | null; doctor_therapist_phone: string | null; preferred_hospital: string | null;
  medications_and_dosage: string | null; patient_phone: string | null; patient_email: string | null;
  patient_street_address: string | null; patient_city: string | null; patient_state: string | null; patient_zip_code: string | null;
}
interface AppointmentRow { id: string; title: string; provider: string | null; location: string | null; date: string; time: string | null; notes: string | null }
interface CareTeamRow { id: string; name: string; role: string | null; specialty: string | null; organization: string | null; phone: string | null; email: string | null; is_primary: boolean }
interface DocumentRow { id: string; file_name: string; section: string | null; note_text: string | null; uploaded_at: string | null; storage_path: string; signedUrl: string }
interface EmergencyContactRow { id: string; full_name: string; relationship: string | null; phone: string | null; email: string | null; address: string | null }
interface CheckinRow {
  id: string; check_in_date: string; submitted_by_name: string | null;
  fn_dressing: string | null; fn_bathing: string | null; fn_toileting: string | null; fn_transfers: string | null; fn_mobility: string | null; fn_medication: string | null; fn_comments: string | null;
  nu_appetite: string | null; nu_meal_pct: string | null; nu_fluids: string | null; nu_swallowing: string | null; nu_comments: string | null;
  co_urinary: string | null; co_bowel: string | null; co_skin: string | null; co_comments: string | null;
  sa_falls: string | null; sa_injury_details: string | null; sa_wandering: string | null; sa_safety_concerns: boolean | null; sa_safety_checklist: string[] | null; sa_comments: string | null;
  be_behaviors: string[] | null; be_trigger: string | null; be_comments: string | null; be_agitation: string | null; be_wandering_risk: string | null; be_responsiveness: string | null; be_hallucinations: string | null;
  mo_mood: string | null; mo_social: string | null; mo_sleep: string | null; mo_comments: string | null;
  sy_symptoms: string[] | null; sy_severity: string | null; sy_other: string | null; sy_comments: string | null; sy_pain: string | null; sy_respiratory: string | null; sy_gi: string | null; sy_neurological: string | null;
}
// CODEX-VERIFIED CRITICAL REMEDIATION Critical 7: medication dose logs,
// routine tasks, and authorized clinical notes (therapist_session /
// clinical_observation — migration 044) — all already caregiver-
// readable via existing RLS, simply never queried by this view before.
interface MedicationLogRow { id: string; medication_name: string | null; scheduled_time: string | null; taken_time: string | null; status: string | null; date: string; notes: string | null }
interface HomeReportRow { id: string; report_date: string; submitted_at: string; mood: string | null; meals: string | null; hydration: string | null; medications: string | null; mobility: string | null; exercise: string | null; sleep_quality: string | null; pain_level: number | null }
interface TaskRow { id: string; title: string; description: string | null; status: string; scheduled_time: string | null; is_active: boolean }
interface ProfessionalNoteRow { id: string; note: string; note_type: string; created_at: string }

type LoadState = 'checking' | 'denied' | 'loading' | 'ready' | 'error';

async function signDocUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(DOC_BUCKET).createSignedUrl(storagePath, 3600);
  if (error || !data) return '';
  void logDocumentAccess(DOC_BUCKET, storagePath);
  return data.signedUrl;
}

export default function CaregiverPatientView({ patientId, onBack }: { patientId: string; onBack: () => void }) {
  const [loadState, setLoadState] = useState<LoadState>('checking');
  const [patient, setPatient] = useState<PatientHeader | null>(null);
  const [medications, setMedications] = useState<MedicationRow[]>([]);
  const [moods, setMoods] = useState<MoodRow[]>([]);
  const [caregiverMood, setCaregiverMood] = useState<MoodType | ''>('');
  const [caregiverMoodNote, setCaregiverMoodNote] = useState('');
  const [savingMood, setSavingMood] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savingCategory, setSavingCategory] = useState<string | null>(null);
  const [openCategory, setOpenCategory] = useState<string>('A');
  const [intake, setIntake] = useState<IntakeRow | null>(null);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [careTeam, setCareTeam] = useState<CareTeamRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContactRow[]>([]);
  const [checkins, setCheckins] = useState<CheckinRow[]>([]);
  const [homeReports, setHomeReports] = useState<HomeReportRow[]>([]);
  const [medicationLogs, setMedicationLogs] = useState<MedicationLogRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [professionalNotes, setProfessionalNotes] = useState<ProfessionalNoteRow[]>([]);
  const [helpHistory, setHelpHistory] = useState<HelpActivationHistoryEntry[]>([]);
  // CODEX-VERIFIED CRITICAL REMEDIATION Critical 6/7: a failed query must
  // never render identically to "no HELP activations recorded" — this
  // distinguishes the two explicitly.
  const [helpHistoryError, setHelpHistoryError] = useState<string | null>(null);
  // CODEX-VERIFIED CRITICAL REMEDIATION Critical 7: the same distinction,
  // applied to every other record section — a query failure (RLS denial,
  // network error, timeout) must read as "Query failed," never as a
  // silently-empty "No records," which would misrepresent an access or
  // connectivity problem as a clean medical history.
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>({});
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        { data: patientRow, error: patientError },
        { data: medRows, error: medError }, { data: moodRows, error: moodError }, { data: noteRows, error: noteError },
        { data: intakeRow, error: intakeError }, { data: apptRows, error: apptError }, { data: teamRows, error: teamError },
        { data: docRows, error: docError }, { data: contactRows, error: contactError },
        { data: checkinRows, error: checkinError }, { data: homeReportRows, error: homeReportError }, { data: medLogRows, error: medLogError },
        { data: taskRows, error: taskError }, { data: profNoteRows, error: profNoteError }, helpRows,
      ] = await Promise.all([
        supabase.from('patients')
          .select('id, first_name, last_name, preferred_name, date_of_birth, dementia_stage, diagnosis_date, location, emergency_contact_name, emergency_contact_phone')
          .eq('id', patientId).maybeSingle(),
        supabase.from('medications')
          .select('id, name, dosage, instructions, side_effects, is_active')
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
          .select('id, check_in_date, submitted_by_name, fn_dressing, fn_bathing, fn_toileting, fn_transfers, fn_mobility, fn_medication, fn_comments, nu_appetite, nu_meal_pct, nu_fluids, nu_swallowing, nu_comments, co_urinary, co_bowel, co_skin, co_comments, sa_falls, sa_injury_details, sa_wandering, sa_safety_concerns, sa_safety_checklist, sa_comments, be_behaviors, be_trigger, be_comments, be_agitation, be_wandering_risk, be_responsiveness, be_hallucinations, mo_mood, mo_social, mo_sleep, mo_comments, sy_symptoms, sy_severity, sy_other, sy_comments, sy_pain, sy_respiratory, sy_gi, sy_neurological')
          .eq('patient_id', patientId).order('check_in_date', { ascending: false }).limit(10),
        (supabase as any).from('care_team_home_reports')
          .select('id, patient_id, report_date, submitted_at, mood, meals, hydration, medications, mobility, exercise, sleep_quality, pain_level')
          .eq('patient_id', patientId).order('report_date', { ascending: false }).limit(30),
        supabase.from('medication_logs')
          .select('id, medication_name, scheduled_time, taken_time, status, date, notes')
          .eq('patient_id', patientId).order('date', { ascending: false }).limit(30),
        supabase.from('tasks')
          .select('id, title, description, status, scheduled_time, is_active')
          .eq('patient_id', patientId).eq('is_active', true).limit(50),
        supabase.from('patient_notes')
          .select('id, note, note_type, created_at')
          .eq('patient_id', patientId).in('note_type', ['therapist_session', 'clinical_observation'])
          .order('created_at', { ascending: false }).limit(30),
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
      setHomeReports(homeReportRows ?? []);
      setMedicationLogs(medLogRows ?? []);
      setTasks(taskRows ?? []);
      setProfessionalNotes(profNoteRows ?? []);
      setHelpHistory(helpRows.entries);
      setHelpHistoryError(helpRows.error);

      // Critical 7 — a section whose query itself failed must say so,
      // never fall silently into its own "No records on file" copy.
      const newSectionErrors: Record<string, string> = {};
      if (medError) newSectionErrors.medications = medError.message;
      if (moodError) newSectionErrors.moods = moodError.message;
      if (noteError) newSectionErrors.careNotes = noteError.message;
      if (intakeError) newSectionErrors.intake = intakeError.message;
      if (apptError) newSectionErrors.appointments = apptError.message;
      if (teamError) newSectionErrors.careTeam = teamError.message;
      if (docError) newSectionErrors.documents = docError.message;
      if (contactError) newSectionErrors.emergencyContacts = contactError.message;
      if (checkinError) newSectionErrors.checkins = checkinError.message;
      if (homeReportError) newSectionErrors.homeReports = homeReportError.message;
      if (medLogError) newSectionErrors.medicationLogs = medLogError.message;
      if (taskError) newSectionErrors.tasks = taskError.message;
      if (profNoteError) newSectionErrors.professionalNotes = profNoteError.message;
      setSectionErrors(newSectionErrors);

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

  const refreshHomeReports = useCallback(async () => {
    const authorized = await verifyCaregiverPatientLink(patientId);
    if (!authorized) { setLoadState('denied'); return; }
    const { data, error } = await (supabase as any).from('care_team_home_reports')
      .select('id, patient_id, report_date, submitted_at, mood, meals, hydration, medications, mobility, exercise, sleep_quality, pain_level')
      .eq('patient_id', patientId).order('report_date', { ascending: false }).limit(30);
    if (error) {
      setSectionErrors((prev) => ({ ...prev, homeReports: error.message }));
      return;
    }
    setHomeReports((data ?? []) as HomeReportRow[]);
    setSectionErrors((prev) => { const next = { ...prev }; delete next.homeReports; return next; });
  }, [patientId]);

  useEffect(() => {
    const timer = setInterval(() => { void refreshHomeReports(); }, 10000);
    return () => clearInterval(timer);
  }, [refreshHomeReports]);

  // Keep the caregiver's open patient record current when the patient or
  // another authorized care-team member records a relevant change. RLS
  // remains the authorization boundary; the patient filter only narrows the
  // Realtime stream and every refresh re-verifies the caregiver-patient link.
  useEffect(() => {
    const tables = ['mood_entries', 'care_partner_checkins', 'medications', 'medication_logs', 'care_partner_notes', 'patient_notes'];
    const channel = supabase.channel(`caregiver-patient-updates-${patientId}`);
    for (const table of tables) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `patient_id=eq.${patientId}` }, () => {
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => { void loadPatient(); }, 180);
      });
    }
    channel.subscribe();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
    };
  }, [patientId, loadPatient]);

  const saveCaregiverMood = async () => {
    if (!caregiverMood) { toast.error('Select how the patient is feeling first.'); return; }
    setSavingMood(true);
    try {
      const authorized = await verifyCaregiverPatientLink(patientId);
      if (!authorized) { setLoadState('denied'); return; }
      const { error } = await supabase.from('mood_entries').insert({
        patient_id: patientId,
        mood: caregiverMood,
        intensity: 5,
        note: caregiverMoodNote.trim() ? `Caregiver update: ${caregiverMoodNote.trim()}` : 'Caregiver update',
        timestamp: new Date().toISOString(),
        recorded_by: 'Caregiver',
      });
      if (error) throw error;
      toast.success('Mood update shared with the patient.');
      setCaregiverMood('');
      setCaregiverMoodNote('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save mood update');
    } finally { setSavingMood(false); }
  };

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
        {sectionErrors.medications ? <p className="text-sm text-gentle-coral">Could not load medications: {sectionErrors.medications}</p> : activeMeds.length === 0 ? <p className="text-sm text-medium-gray">No active medications on file.</p> : (
          <ul className="space-y-2">
            {activeMeds.map((m) => (
              <li key={m.id} className="p-3 bg-warm-ivory rounded-xl border border-soft-taupe">
                <p className="font-medium text-charcoal text-sm">{m.name} — {m.dosage}</p>
                <p className="text-xs text-medium-gray">{m.instructions}</p>
                  {m.side_effects && <p className="text-xs text-gentle-coral mt-1"><span className="font-semibold">Reported reactions / side effects:</span> {m.side_effects}</p>}
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
                  {m.side_effects && <p className="text-xs text-gentle-coral mt-1"><span className="font-semibold">Reported reactions / side effects:</span> {m.side_effects}</p>}
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
        {sectionErrors.medicationLogs && <p className="text-sm text-gentle-coral">Could not load the dose log: {sectionErrors.medicationLogs}</p>}
        {medicationLogs.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-medium-gray font-medium">Dose log (most recent {medicationLogs.length})</summary>
            <ul className="space-y-1.5 mt-2 max-h-56 overflow-y-auto">
              {medicationLogs.map((l) => (
                <li key={l.id} className="flex items-center justify-between px-3 py-1.5 bg-warm-ivory rounded-lg border border-soft-taupe text-xs">
                  <span className="text-charcoal">{l.medication_name || 'Medication'} — {l.scheduled_time || ''}</span>
                  <span className={l.status === 'taken' ? 'text-soft-sage font-semibold' : 'text-medium-gray'}>{l.status || 'unknown'}{l.taken_time ? ` · ${new Date(l.taken_time).toLocaleString()}` : ''}</span>
                  {l.notes && <span className="block text-gentle-coral mt-1">Note / reaction: {l.notes}</span>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2"><ClipboardList className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">Routine Tasks</h2></div>
        {sectionErrors.tasks ? <p className="text-sm text-gentle-coral">Could not load routine tasks: {sectionErrors.tasks}</p> : tasks.length === 0 ? <p className="text-sm text-medium-gray">No active routine tasks on file.</p> : (
          <ul className="space-y-2">
            {tasks.map((t) => (
              <li key={t.id} className="p-3 bg-warm-ivory rounded-xl border border-soft-taupe text-sm">
                <p className="font-medium text-charcoal">{t.title} <span className="text-xs text-medium-gray">— {t.scheduled_time || 'Time not recorded'}</span></p>
                {t.description && <p className="text-xs text-medium-gray">{t.description}</p>}
                <p className="text-xs text-medium-gray capitalize">Status: {t.status}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2"><Stethoscope className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">Clinical Notes &amp; Session Documentation</h2></div>
        <p className="text-xs text-medium-gray">Entries recorded by this patient's assigned therapist or medical professional — never patient-authored personal notes, which stay private.</p>
        {professionalNotes.length === 30 && <p className="text-xs text-medium-gray">Showing the 30 most recent — older entries may exist.</p>}
        {sectionErrors.professionalNotes ? <p className="text-sm text-gentle-coral">Could not load clinical notes: {sectionErrors.professionalNotes}</p> : professionalNotes.length === 0 ? <p className="text-sm text-medium-gray">No clinical notes or session documentation recorded yet.</p> : (
          <ul className="space-y-2">
            {professionalNotes.map((n) => (
              <li key={n.id} className="p-3 bg-warm-ivory rounded-xl border border-soft-taupe">
                <p className="text-xs font-semibold text-warm-bronze mb-1">{n.note_type === 'therapist_session' ? 'Session Note' : 'Clinical Observation'} — {new Date(n.created_at).toLocaleDateString()}</p>
                <p className="text-sm text-charcoal whitespace-pre-wrap">{n.note}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Caregiver mood entries share through the same scoped mood history as
          patient entries; the patient view will receive new rows in real time. */}
      <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-3">
        <h2 className="font-bold text-charcoal">Share a mood update with the patient</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-charcoal">How is the patient feeling?
            <select value={caregiverMood} onChange={(e) => setCaregiverMood(e.target.value)} className="mt-1 w-full px-3 py-2 border border-soft-taupe rounded-xl bg-white">
              <option value="">Select a mood</option>
              {['happy', 'calm', 'sad', 'angry', 'confused', 'worried', 'anxious', 'scared'].map((mood) => <option key={mood} value={mood}>{mood[0].toUpperCase() + mood.slice(1)}</option>)}
            </select>
          </label>
          <label className="text-sm text-charcoal">Optional note
            <input value={caregiverMoodNote} onChange={(e) => setCaregiverMoodNote(e.target.value)} maxLength={500} className="mt-1 w-full px-3 py-2 border border-soft-taupe rounded-xl" placeholder="A brief, respectful update" />
          </label>
        </div>
        <button type="button" disabled={savingMood || !caregiverMood} onClick={() => { void saveCaregiverMood(); }} className="px-4 py-2 rounded-xl bg-warm-bronze text-white disabled:opacity-50">{savingMood ? 'Sharing…' : 'Share mood update'}</button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2"><Heart className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">Mood &amp; Behavioral History</h2></div>
        {moods.length === 30 && <p className="text-xs text-medium-gray">Showing the 30 most recent — older entries may exist.</p>}
        {sectionErrors.moods ? <p className="text-sm text-gentle-coral">Could not load mood history: {sectionErrors.moods}</p> : moods.length === 0 ? <p className="text-sm text-medium-gray">No mood entries yet.</p> : (
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

      <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2"><FileText className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">Patient Portal Home Reports</h2></div>
        {sectionErrors.homeReports ? <p className="text-sm text-gentle-coral">Could not load home reports: {sectionErrors.homeReports}</p> : homeReports.length === 0 ? <p className="text-sm text-medium-gray">No home reports have been shared yet.</p> : (
          <ul className="space-y-2">
            {homeReports.map((report) => {
              const details = [
                report.mood && `Mood: ${report.mood}`,
                report.meals && `Meals: ${report.meals}`,
                report.hydration && `Hydration: ${report.hydration}`,
                report.medications && `Medication: ${report.medications}`,
                report.mobility && `Mobility: ${report.mobility}`,
                report.exercise && `Exercise: ${report.exercise}`,
                report.sleep_quality && `Sleep: ${report.sleep_quality}`,
                report.pain_level != null && `Pain level: ${report.pain_level}`,
              ].filter(Boolean);
              return (
                <li key={report.id} className="p-3 bg-warm-ivory rounded-xl border border-soft-taupe text-sm">
                  <p className="font-semibold text-charcoal">{new Date(report.report_date + 'T00:00:00').toLocaleDateString()}</p>
                  {details.length ? <p className="mt-1 text-medium-gray whitespace-pre-wrap">{details.join(' · ')}</p> : <p className="mt-1 text-medium-gray">No details entered.</p>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Care Partner A-G structured check-ins — distinct from, and more
          detailed than, the free-text Care Partner Notes below. */}
      <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">Care Partner A–G Check-In Reports</h2></div>
        {checkins.length === 10 && <p className="text-xs text-medium-gray">Showing the 10 most recent — older reports may exist.</p>}
        {sectionErrors.checkins ? <p className="text-sm text-gentle-coral">Could not load check-in reports: {sectionErrors.checkins}</p> : checkins.length === 0 ? <p className="text-sm text-medium-gray">No structured check-in reports yet.</p> : (
          <ul className="space-y-2">
            {checkins.map((c) => (
              <li key={c.id} className="p-3 bg-warm-ivory rounded-xl border border-soft-taupe text-sm space-y-1">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-charcoal">{new Date(c.check_in_date).toLocaleDateString()}</p>
                  {c.submitted_by_name && <span className="text-xs text-medium-gray">by {c.submitted_by_name}</span>}
                </div>
                <div className="space-y-2 text-xs text-medium-gray">
                  {[
                    ['A · Daily function', [c.fn_dressing && `Dressing: ${c.fn_dressing}`, c.fn_bathing && `Bathing: ${c.fn_bathing}`, c.fn_toileting && `Toileting: ${c.fn_toileting}`, c.fn_transfers && `Transfers: ${c.fn_transfers}`, c.fn_mobility && `Mobility: ${c.fn_mobility}`, c.fn_medication && `Medication support: ${c.fn_medication}`, c.fn_comments]],
                    ['B · Nutrition', [c.nu_appetite && `Appetite: ${c.nu_appetite}`, c.nu_meal_pct != null && `Meal intake: ${c.nu_meal_pct}%`, c.nu_fluids && `Fluids: ${c.nu_fluids}`, c.nu_swallowing && `Swallowing: ${c.nu_swallowing}`, c.nu_comments]],
                    ['C · Continence and skin', [c.co_urinary && `Urinary: ${c.co_urinary}`, c.co_bowel && `Bowel: ${c.co_bowel}`, c.co_skin && `Skin: ${c.co_skin}`, c.co_comments]],
                    ['D · Safety', [c.sa_falls && `Falls: ${c.sa_falls}`, c.sa_injury_details && `Injury details: ${c.sa_injury_details}`, c.sa_wandering && `Wandering: ${c.sa_wandering}`, c.sa_safety_concerns ? 'Safety concern flagged' : null, ...(c.sa_safety_checklist ?? []), c.sa_comments]],
                    ['E · Behavior and responsiveness', [c.be_behaviors?.length ? `Behaviors: ${c.be_behaviors.join(', ')}` : null, c.be_trigger && `Trigger: ${c.be_trigger}`, c.be_agitation && `Agitation: ${c.be_agitation}`, c.be_wandering_risk && `Wandering risk: ${c.be_wandering_risk}`, c.be_responsiveness && `Responsiveness: ${c.be_responsiveness}`, c.be_hallucinations && `Hallucinations: ${c.be_hallucinations}`, c.be_comments]],
                    ['F · Mood and social', [c.mo_mood && `Mood: ${c.mo_mood}`, c.mo_social && `Social: ${c.mo_social}`, c.mo_sleep && `Sleep: ${c.mo_sleep}`, c.mo_comments]],
                    ['G · Symptoms and comfort', [c.sy_symptoms?.length ? `Symptoms: ${c.sy_symptoms.join(', ')}` : null, c.sy_severity && `Severity: ${c.sy_severity}`, c.sy_other && `Other: ${c.sy_other}`, c.sy_pain && `Pain: ${c.sy_pain}`, c.sy_respiratory && `Respiratory: ${c.sy_respiratory}`, c.sy_gi && `Gastrointestinal: ${c.sy_gi}`, c.sy_neurological && `Neurological: ${c.sy_neurological}`, c.sy_comments]],
                  ].map(([section, values]) => {
                    const entries = (values as Array<string | null | false | undefined>).filter(Boolean);
                    return entries.length ? (
                      <div key={section as string}>
                        <p className="font-semibold text-charcoal">{section}</p>
                        <p className="whitespace-pre-wrap">{entries.join(' · ')}</p>
                      </div>
                    ) : null;
                  })}
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
        {sectionErrors.careNotes && <p className="text-sm text-gentle-coral">Could not load existing notes: {sectionErrors.careNotes} — editing below will overwrite, not merge, any unseen note.</p>}
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
        {appointments.length === 30 && <p className="text-xs text-medium-gray">Showing the 30 most recent — older appointments may exist.</p>}
        {sectionErrors.appointments ? <p className="text-sm text-gentle-coral">Could not load appointments: {sectionErrors.appointments}</p> : appointments.length === 0 ? <p className="text-sm text-medium-gray">No appointments on file.</p> : (
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
        {(sectionErrors.careTeam || sectionErrors.intake) ? (
          <p className="text-sm text-gentle-coral">Could not load care-team contacts: {sectionErrors.careTeam || sectionErrors.intake}</p>
        ) : careTeam.length === 0 && !intake?.doctor_therapist_name ? (
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

      <CareTeamCommunicationAccess patientId={patientId} />

      <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2"><FileText className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">Medical Documents &amp; Care Plans</h2></div>
        {documents.length === 50 && <p className="text-xs text-medium-gray">Showing the 50 most recently uploaded — older documents may exist.</p>}
        {sectionErrors.documents ? <p className="text-sm text-gentle-coral">Could not load documents: {sectionErrors.documents}</p> : documents.length === 0 ? <p className="text-sm text-medium-gray">No documents uploaded.</p> : (
          <ul className="space-y-2">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 p-3 bg-warm-ivory rounded-xl border border-soft-taupe text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-charcoal truncate">{d.file_name}</p>
                  <p className="text-xs text-medium-gray">{[d.section, d.uploaded_at ? new Date(d.uploaded_at).toLocaleDateString() : 'Date unavailable'].filter(Boolean).join(' · ')}{d.note_text ? ` — ${d.note_text}` : ''}</p>
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
        {sectionErrors.emergencyContacts ? (
          <p className="text-sm text-gentle-coral">Could not load emergency contacts: {sectionErrors.emergencyContacts}</p>
        ) : emergencyContacts.length === 0 && !patient.emergencyContactPhone ? (
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
        {helpHistoryError ? (
          <p className="text-sm text-gentle-coral">Could not load HELP activation history: {helpHistoryError}</p>
        ) : helpHistory.length === 0 ? <p className="text-sm text-medium-gray">No HELP activations recorded.</p> : (
          <ul className="space-y-2">
            {helpHistory.map((h) => (
              <li key={h.id} className="p-3 bg-gentle-coral/5 border border-gentle-coral/20 rounded-xl text-sm">
                <p className="font-medium text-charcoal">{new Date(h.createdAt).toLocaleString()}</p>
                <p className="text-xs text-medium-gray">
                  {h.phoneDialed ? `Call attempted to ${h.phoneDialed}. ` : ''}
                  {h.notificationStatus === 'no_caregiver_linked' && 'No caregiver was linked at the time to notify.'}
                  {h.notificationStatus === 'notification_failed' && 'The caregiver notification attempt failed — the event was still recorded.'}
                  {h.acknowledgedCount > 0 ? ` Acknowledged by ${h.acknowledgedBy.join(', ')}.` : h.notificationStatus === 'caregiver_notified' ? ' Not yet acknowledged by any caregiver.' : ''}
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
