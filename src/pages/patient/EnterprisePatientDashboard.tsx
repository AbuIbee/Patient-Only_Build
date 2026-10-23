// FIVE-OFFICE ENTERPRISE PLATFORM — Office E (Enterprise Patient).
// Reached ONLY for a patient actually covered by an active Enterprise
// organization (EnterprisePatientRouter checks this via the same
// is_my_enterprise_coverage_active()/isEnterpriseCovered source
// SubscriptionContext already uses — never from the /Patient URL
// itself). An ordinary individual patient continues to see the
// existing, completely unmodified PatientLayout.
//
// Built on the same EnterpriseOfficeShell used by Offices A/C/D, so
// this office visually matches the rest of the Enterprise platform —
// per the owner's own instruction, "the same shared Enterprise visual
// system as the Caregiver Office." Every destination below either reuses
// an existing, already-working patient component verbatim (Medications,
// Documents, Care Team, Messages) or is a small new view backed entirely
// by already-existing patient-self-accessible data (clinical records via
// has_patient_access(), tasks, care preferences) or this round's two new,
// narrowly-scoped RPCs (org context, Enterprise care team) — see
// supabase/migrations/082_r9_enterprise_patient_office.sql.
import { useEffect, useState, useCallback } from 'react';
import { useApp } from '@/store/useApp';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  LayoutDashboard, ClipboardList, CalendarClock, HeartPulse, Pill, MessageSquare,
  Users, FileText, Settings as SettingsIcon, SlidersHorizontal, Loader2, CheckCircle2,
} from 'lucide-react';
import { EnterpriseOfficeShell, OfficeCard, type OfficeNavItem, type OfficeNavGroup } from '@/pages/enterprise/EnterpriseOfficeShell';
import { useOfficeUrlSync } from '@/pages/professional/useOfficeUrlSync';
import {
  getMyEnterpriseOrganization, getMyEnterpriseCareTeam, getMyAppointments, getMyVisits,
  type MyEnterpriseOrganization, type MyEnterpriseCareTeamMember, type MyAppointment, type MyVisit,
} from '@/services/enterprisePatientService';
import {
  getPatientCarePlans, getPatientDiagnoses, getPatientAllergies, getPatientVitals,
  getCarePreferences, recordCarePreference,
  type PatientCarePlan, type PatientDiagnosis, type PatientAllergy, type PatientVitals, type CarePreference,
} from '@/services/patientClinicalRecordService';
import { getMyConversations, type ConversationSummary } from '@/services/communicationsService';
import CareConversations from '@/components/communications/CareConversations';
import { requestAccountDeletion, cancelAccountDeletionRequest, getMyAccountDeletionRequests, type AccountDeletionRequest } from '@/services/accountDeletionService';
import MFASettings from '@/components/MFASettings';
import ActiveSessionsPanel from '@/components/ActiveSessionsPanel';
import PatientMedications from './PatientMedications';
import PatientDocuments from './PatientDocuments';
import PatientCareTeam from './PatientCareTeam';

type PatientNavKey =
  | 'dashboard' | 'careplan' | 'appointments' | 'health' | 'medications'
  | 'messages' | 'careteam' | 'documents' | 'preferences' | 'settings';

const NAV_ITEMS: OfficeNavItem<PatientNavKey>[] = [
  { key: 'dashboard', label: 'My Dashboard', icon: LayoutDashboard },
  { key: 'careplan', label: 'My Care Plan', icon: ClipboardList },
  { key: 'appointments', label: 'My Appointments', icon: CalendarClock },
  { key: 'health', label: 'My Health Information', icon: HeartPulse },
  { key: 'medications', label: 'My Medications', icon: Pill },
  { key: 'messages', label: 'My Messages', icon: MessageSquare },
  { key: 'careteam', label: 'My Care Team', icon: Users },
  { key: 'documents', label: 'My Documents', icon: FileText },
  { key: 'preferences', label: 'My Preferences', icon: SlidersHorizontal },
  { key: 'settings', label: 'Settings & Account', icon: SettingsIcon },
];
const NAV_GROUPS: OfficeNavGroup<PatientNavKey>[] = [
  { label: 'MY CARE', items: ['dashboard', 'careplan', 'appointments', 'health', 'medications'] },
  { label: 'COMMUNICATION', items: ['messages', 'careteam', 'documents'] },
  { label: 'ACCOUNT', items: ['preferences', 'settings'] },
];

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

const PATIENT_NAV_KEYS = NAV_ITEMS.map((n) => n.key) as PatientNavKey[];

// basePath defaults to null (no URL sync) so the existing /Patient entry
// (EnterprisePatientRouter) keeps its exact established behavior
// unchanged — only an explicit basePath (passed by
// ProfessionalOfficeResolver.tsx under /Professional/Patient) turns on
// nested-route URL sync (P1 CORRECTIVE ORDER §7).
export default function EnterprisePatientDashboard({ basePath = null }: { basePath?: string | null } = {}) {
  const { state, dispatch } = useApp();
  // CONFIRMED DEFECT, found during live verification: `state.patient` is
  // only ever populated by PatientLayout's own mount-time fetch — a
  // component this office never renders, since an Enterprise-covered
  // patient is routed here INSTEAD of PatientLayout. Falling back to
  // state.currentUser.firstName silently showed the account's raw
  // profiles.first_name (often a placeholder like "New") instead of the
  // patient's actual preferred display name. Fixed with this office's
  // own minimal, local fetch of the same `patients` row (already
  // patient-self-readable — migration 004) rather than replicating
  // PatientLayout's much larger SET_PATIENT dispatch.
  const [preferredDisplayName, setPreferredDisplayName] = useState<string | null>(null);
  const [org, setOrg] = useState<MyEnterpriseOrganization | null>(null);
  const [team, setTeam] = useState<MyEnterpriseCareTeamMember[]>([]);
  const [appointments, setAppointments] = useState<MyAppointment[]>([]);
  const [visits, setVisits] = useState<MyVisit[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [carePlans, setCarePlans] = useState<PatientCarePlan[]>([]);
  const [tasks, setTasks] = useState<{ id: string; title: string; status: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [nav, setNav] = useOfficeUrlSync<PatientNavKey>(basePath, PATIENT_NAV_KEYS, 'dashboard');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const patientId = state.currentUser?.id;
      const [o, t, appts, v, convos, plans, taskRows, patientRow] = await Promise.all([
        getMyEnterpriseOrganization(),
        getMyEnterpriseCareTeam(),
        getMyAppointments(),
        getMyVisits(),
        getMyConversations(),
        patientId ? getPatientCarePlans(patientId) : Promise.resolve([]),
        patientId
          ? supabase.from('tasks').select('id, title, status').eq('patient_id', patientId).eq('is_active', true).then((r) => r.data ?? [])
          : Promise.resolve([]),
        patientId
          ? supabase.from('patients').select('first_name, last_name, preferred_name').eq('id', patientId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setOrg(o); setTeam(t); setAppointments(appts); setVisits(v); setConversations(convos); setCarePlans(plans); setTasks(taskRows);
      setPreferredDisplayName(patientRow.data?.preferred_name || patientRow.data?.first_name || null);
    } finally {
      setLoading(false);
    }
  }, [state.currentUser?.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    dispatch({ type: 'LOGOUT' });
    toast('You have been logged out');
  };

  const displayName = preferredDisplayName || state.patient?.preferredName || state.patient?.firstName || state.currentUser?.firstName || 'there';
  const initials = (displayName[0] ?? 'P').toUpperCase();
  const patientName = displayName;
  const patientId = state.currentUser?.id ?? '';

  const nextAppointment = appointments.find((a) => new Date(a.date) >= new Date());
  const openTasks = tasks.filter((t) => t.status === 'pending');
  const unreadMessages = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  return (
    <EnterpriseOfficeShell
      officeBadge="PATIENT WORKSPACE" orgLabel={org?.organizationName ?? 'My Care'} roleLabel="Patient"
      fullName={displayName} initials={initials} navItems={NAV_ITEMS} navGroups={NAV_GROUPS}
      activeNav={nav} onNavigate={setNav} onLogout={() => { void handleLogout(); }}
    >
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-ent-forest" /></div>
      ) : nav === 'dashboard' ? (
        <DashboardHome
          patientName={patientName} nextAppointment={nextAppointment} openTasksCount={openTasks.length}
          unreadMessages={unreadMessages} teamCount={team.length} carePlans={carePlans} appointments={appointments}
          conversations={conversations} team={team} onNavigate={setNav}
        />
      ) : nav === 'careplan' ? (
        <CarePlanView carePlans={carePlans} tasks={tasks} onRefresh={refresh} />
      ) : nav === 'appointments' ? (
        <AppointmentsView appointments={appointments} visits={visits} team={team} />
      ) : nav === 'health' ? (
        <HealthInfoView patientId={patientId} />
      ) : nav === 'medications' ? (
        <PatientMedications />
      ) : nav === 'messages' ? (
        patientId ? <CareConversations patientId={patientId} patientName={patientName} /> : null
      ) : nav === 'careteam' ? (
        <PatientCareTeam />
      ) : nav === 'documents' ? (
        <PatientDocuments />
      ) : nav === 'preferences' ? (
        <PreferencesView patientId={patientId} />
      ) : nav === 'settings' ? (
        <SettingsView onLogout={() => { void handleLogout(); }} />
      ) : null}
    </EnterpriseOfficeShell>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-ent-panel rounded-2xl border border-ent-line p-4">
      <p className="text-xs font-semibold text-ent-muted">{label}</p>
      <p className="text-2xl font-bold text-ent-ink mt-1">{value}</p>
      <p className="text-[11px] text-ent-muted">{sub}</p>
    </div>
  );
}

function DashboardHome({ patientName, nextAppointment, openTasksCount, unreadMessages, teamCount, carePlans, appointments, conversations, team, onNavigate }: {
  patientName: string; nextAppointment: MyAppointment | undefined; openTasksCount: number; unreadMessages: number; teamCount: number;
  carePlans: PatientCarePlan[]; appointments: MyAppointment[]; conversations: ConversationSummary[]; team: MyEnterpriseCareTeamMember[];
  onNavigate: (key: PatientNavKey) => void;
}) {
  const currentPlan = carePlans.find((p) => p.isCurrent);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-ent-ink">{greeting()}, {patientName}.</h1>
        <p className="text-sm text-ent-muted mt-0.5">Here&apos;s what&apos;s happening with your care.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Next Appointment" value={nextAppointment ? new Date(nextAppointment.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'None'} sub={nextAppointment ? nextAppointment.title : 'scheduled'} />
        <MetricCard label="Care Plan Tasks" value={String(openTasksCount)} sub="outstanding" />
        <MetricCard label="Messages" value={String(unreadMessages)} sub="unread" />
        <MetricCard label="Care Team" value={String(teamCount)} sub="supporting you" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <OfficeCard>
          <div className="flex items-center justify-between"><h2 className="font-bold text-ent-ink">My Care Plan</h2><button type="button" onClick={() => onNavigate('careplan')} className="text-xs font-semibold text-ent-bronze hover:underline">View all →</button></div>
          {currentPlan ? (
            <div>
              <p className="text-sm text-ent-text">{currentPlan.goals}</p>
              <p className="text-[11px] text-ent-muted mt-1">v{currentPlan.version} · effective {currentPlan.effectiveDate}</p>
            </div>
          ) : <p className="text-sm text-ent-text">No current care plan is on file yet.</p>}
        </OfficeCard>

        <OfficeCard>
          <div className="flex items-center justify-between"><h2 className="font-bold text-ent-ink">Upcoming Appointments</h2><button type="button" onClick={() => onNavigate('appointments')} className="text-xs font-semibold text-ent-bronze hover:underline">View all →</button></div>
          {appointments.length === 0 ? <p className="text-sm text-ent-text">No appointments are currently scheduled.</p> : (
            <ul className="space-y-1.5">
              {appointments.slice(0, 3).map((a) => (
                <li key={a.id} className="p-2.5 bg-ent-bg rounded-xl border border-ent-line text-sm">
                  <p className="font-semibold text-ent-ink">{a.title}</p>
                  <p className="text-xs text-ent-muted">{a.date} {a.time} · {a.provider}</p>
                </li>
              ))}
            </ul>
          )}
        </OfficeCard>

        <OfficeCard>
          <div className="flex items-center justify-between"><h2 className="font-bold text-ent-ink">Recent Messages</h2><button type="button" onClick={() => onNavigate('messages')} className="text-xs font-semibold text-ent-bronze hover:underline">Open Messages →</button></div>
          {conversations.length === 0 ? <p className="text-sm text-ent-text">No conversations yet.</p> : (
            <ul className="space-y-1.5">
              {conversations.slice(0, 3).map((c) => (
                <li key={c.conversationId} className="p-2.5 bg-ent-bg rounded-xl border border-ent-line text-sm">
                  <p className="text-ent-text truncate">{c.lastMessageBody || 'No messages yet'}</p>
                  {c.unreadCount > 0 && <span className="text-[11px] font-bold text-ent-rust">{c.unreadCount} unread</span>}
                </li>
              ))}
            </ul>
          )}
        </OfficeCard>

        <OfficeCard>
          <div className="flex items-center justify-between"><h2 className="font-bold text-ent-ink">My Care Team</h2><button type="button" onClick={() => onNavigate('careteam')} className="text-xs font-semibold text-ent-bronze hover:underline">View all →</button></div>
          {team.length === 0 ? <p className="text-sm text-ent-text">No organization staff are currently assigned to you.</p> : (
            <ul className="space-y-1.5">
              {team.slice(0, 3).map((m) => (
                <li key={m.userId} className="p-2.5 bg-ent-bg rounded-xl border border-ent-line text-sm flex items-center justify-between">
                  <span className="font-semibold text-ent-ink">{m.firstName} {m.lastName}</span>
                  <span className="text-xs text-ent-muted capitalize">{m.orgRole.replace('_', ' ')}</span>
                </li>
              ))}
            </ul>
          )}
        </OfficeCard>
      </div>
    </div>
  );
}

function CarePlanView({ carePlans, tasks, onRefresh }: {
  carePlans: PatientCarePlan[]; tasks: { id: string; title: string; status: string }[]; onRefresh: () => void;
}) {
  const currentPlan = carePlans.find((p) => p.isCurrent);
  const markComplete = async (taskId: string) => {
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('tasks').update({ status: 'completed', status_updated_by: userData?.user?.id ?? null, status_updated_at: new Date().toISOString() }).eq('id', taskId);
    if (error) { toast.error(error.message); return; }
    toast.success('Marked complete.');
    onRefresh();
  };
  return (
    <div className="space-y-4">
      <OfficeCard>
        <h2 className="font-bold text-ent-ink">My Care Plan</h2>
        {currentPlan ? (
          <div className="text-sm text-ent-ink space-y-1">
            <p>{currentPlan.goals}</p>
            {currentPlan.permittedTasks && <p className="text-xs text-ent-muted">Permitted tasks: {currentPlan.permittedTasks}</p>}
            <p className="text-[11px] text-ent-muted">v{currentPlan.version} · effective {currentPlan.effectiveDate}</p>
          </div>
        ) : <p className="text-sm text-ent-text">No current verified care plan is on file yet.</p>}
      </OfficeCard>
      <OfficeCard>
        <h2 className="font-bold text-ent-ink">My Tasks</h2>
        {tasks.length === 0 ? <p className="text-sm text-ent-text">{`You don't have any assigned tasks right now.`}</p> : (
          <ul className="space-y-2">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 p-3 bg-ent-bg rounded-xl border border-ent-line">
                <span className="text-sm text-ent-ink">{t.title}</span>
                {t.status === 'pending' ? (
                  <button type="button" onClick={() => { void markComplete(t.id); }} className="flex items-center gap-1 text-xs font-semibold text-ent-bronze hover:underline">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Mark done
                  </button>
                ) : <span className="text-xs text-ent-muted capitalize">{t.status.replace('_', ' ')}</span>}
              </li>
            ))}
          </ul>
        )}
      </OfficeCard>
    </div>
  );
}

function AppointmentsView({ appointments, visits, team }: { appointments: MyAppointment[]; visits: MyVisit[]; team: MyEnterpriseCareTeamMember[] }) {
  const teamById = new Map(team.map((m) => [m.userId, `${m.firstName} ${m.lastName}`]));
  return (
    <div className="space-y-4">
      <OfficeCard>
        <h2 className="font-bold text-ent-ink">My Appointments</h2>
        {appointments.length === 0 ? <p className="text-sm text-ent-text">No appointments are currently scheduled.</p> : (
          <ul className="space-y-1.5">
            {appointments.map((a) => (
              <li key={a.id} className="p-3 bg-ent-bg rounded-xl border border-ent-line text-sm">
                <p className="font-semibold text-ent-ink">{a.title}</p>
                <p className="text-xs text-ent-muted">{a.date} {a.time} · {a.provider}{a.location ? ` · ${a.location}` : ''}</p>
              </li>
            ))}
          </ul>
        )}
      </OfficeCard>
      <OfficeCard>
        <h2 className="font-bold text-ent-ink">My Scheduled Visits</h2>
        {visits.length === 0 ? <p className="text-sm text-ent-text">No visits are currently scheduled.</p> : (
          <ul className="space-y-1.5">
            {visits.map((v) => (
              <li key={v.id} className="p-3 bg-ent-bg rounded-xl border border-ent-line flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ent-ink">{teamById.get(v.caregiverId) ?? 'Care team member'}</p>
                  <p className="text-xs text-ent-muted">{v.scheduledStart ? new Date(v.scheduledStart).toLocaleString() : 'No time set'}</p>
                </div>
                <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-ent-pale text-ent-ink capitalize">{v.status.replace('_', ' ')}</span>
              </li>
            ))}
          </ul>
        )}
      </OfficeCard>
    </div>
  );
}

function HealthInfoView({ patientId }: { patientId: string }) {
  const [diagnoses, setDiagnoses] = useState<PatientDiagnosis[]>([]);
  const [allergies, setAllergies] = useState<PatientAllergy[]>([]);
  const [vitals, setVitals] = useState<PatientVitals[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!patientId) { setLoading(false); return; }
    void Promise.all([getPatientDiagnoses(patientId), getPatientAllergies(patientId), getPatientVitals(patientId)])
      .then(([d, a, v]) => { setDiagnoses(d); setAllergies(a); setVitals(v); setLoading(false); });
  }, [patientId]);

  if (loading) return <Loader2 className="w-6 h-6 animate-spin text-ent-forest mx-auto" />;
  return (
    <div className="space-y-4">
      <OfficeCard>
        <h2 className="font-bold text-ent-ink">Diagnoses</h2>
        {diagnoses.length === 0 ? <p className="text-sm text-ent-text">No diagnoses on file.</p> : (
          <ul className="space-y-1.5">
            {diagnoses.map((d) => <li key={d.id} className="p-2.5 bg-ent-bg rounded-xl border border-ent-line text-sm text-ent-ink">{d.conditionName}{d.diagnosedDate ? ` — diagnosed ${d.diagnosedDate}` : ''}</li>)}
          </ul>
        )}
      </OfficeCard>
      <OfficeCard>
        <h2 className="font-bold text-ent-ink">Allergies</h2>
        {allergies.length === 0 ? <p className="text-sm text-ent-text">No allergies on file.</p> : (
          <ul className="space-y-1.5">
            {allergies.map((a) => <li key={a.id} className="p-2.5 bg-ent-bg rounded-xl border border-ent-line text-sm text-ent-ink">{a.allergen}{a.severity ? ` — ${a.severity}` : ''}</li>)}
          </ul>
        )}
      </OfficeCard>
      <OfficeCard>
        <h2 className="font-bold text-ent-ink">Recent Vitals</h2>
        {vitals.length === 0 ? <p className="text-sm text-ent-text">No vitals on file.</p> : (
          <ul className="space-y-1.5">
            {vitals.slice(0, 10).map((v) => (
              <li key={v.id} className="p-2.5 bg-ent-bg rounded-xl border border-ent-line text-xs text-ent-ink">
                {v.bloodPressure && <span className="mr-2">BP {v.bloodPressure}</span>}
                {v.pulseBpm != null && <span className="mr-2">Pulse {v.pulseBpm}</span>}
                {v.temperatureF != null && <span className="mr-2">Temp {v.temperatureF}°F</span>}
                <span className="text-ent-muted block mt-0.5">{new Date(v.measuredAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </OfficeCard>
    </div>
  );
}

function PreferencesView({ patientId }: { patientId: string }) {
  const [preferences, setPreferences] = useState<CarePreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('routine');
  const [description, setDescription] = useState('');

  const load = useCallback(() => {
    if (!patientId) { setLoading(false); return; }
    void getCarePreferences(patientId).then((p) => { setPreferences(p); setLoading(false); });
  }, [patientId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!description.trim()) return;
    const { error } = await recordCarePreference(patientId, category, description.trim());
    if (error) { toast.error(error); return; }
    setDescription(''); load();
  };

  return (
    <OfficeCard>
      <h2 className="font-bold text-ent-ink">My Preferences</h2>
      <div className="flex flex-wrap gap-2">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="px-2 py-2 rounded-xl border border-ent-line text-sm bg-ent-panel">
          {['routine', 'food', 'sensitivity', 'communication', 'comfort_technique', 'dignity', 'accessibility', 'other'].map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
        </select>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe your preference…" className="flex-1 min-w-[200px] px-3 py-2 rounded-xl border border-ent-line text-sm bg-ent-panel" />
        <button type="button" onClick={() => { void add(); }} className="px-3 py-2 rounded-xl bg-ent-bronze hover:opacity-90 text-white text-sm font-semibold">Add</button>
      </div>
      {loading ? <Loader2 className="w-5 h-5 animate-spin text-ent-forest" /> : preferences.length === 0 ? (
        <p className="text-sm text-ent-text">No preferences recorded yet.</p>
      ) : (
        <ul className="space-y-2">
          {preferences.map((p) => (
            <li key={p.id} className="p-2.5 bg-ent-bg rounded-xl border border-ent-line text-sm">
              <span className="text-xs font-semibold text-ent-bronze capitalize">{p.category.replace('_', ' ')}</span>
              <p className="text-ent-ink">{p.description}</p>
            </li>
          ))}
        </ul>
      )}
    </OfficeCard>
  );
}

function AccountDeletionRequestPanel() {
  const [requests, setRequests] = useState<AccountDeletionRequest[]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setRequests(await getMyAccountDeletionRequests());
    setLoading(false);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const open = requests.find((r) => r.status === 'requested' || r.status === 'under_review');

  const submit = async () => {
    setBusy(true);
    try {
      const { error } = await requestAccountDeletion(reason.trim());
      if (error) { toast.error(error); return; }
      toast.success('Deletion request submitted — a Platform Owner will review it.');
      setReason('');
      void refresh();
    } finally { setBusy(false); }
  };
  const cancel = async (id: string) => {
    setBusy(true);
    try {
      const { error } = await cancelAccountDeletionRequest(id);
      if (error) { toast.error(error); return; }
      toast('Deletion request cancelled.');
      void refresh();
    } finally { setBusy(false); }
  };

  if (loading) return null;

  return (
    <div className="space-y-2 pt-3 border-t border-ent-line">
      <p className="text-xs font-semibold text-ent-muted">Delete my account</p>
      {open ? (
        <div className="p-3 bg-red-50 rounded-xl border border-red-200 space-y-2">
          <p className="text-sm text-ent-ink">A deletion request is pending Platform Owner review (status: {open.status.replace('_', ' ')}).</p>
          <button type="button" onClick={() => { void cancel(open.id); }} disabled={busy} className="px-3 py-1.5 rounded-lg border border-ent-line text-ent-ink text-xs font-semibold hover:bg-ent-ivory disabled:opacity-60">
            Cancel request
          </button>
        </div>
      ) : (
        <>
          <p className="text-[11px] text-ent-muted">Submitting a request does not delete anything immediately. Once approved by the Platform Owner, your account access is safely deactivated — your account and any records are preserved, not destroyed.</p>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="w-full px-3 py-2 rounded-xl border border-ent-line text-sm" />
          <button type="button" onClick={() => { void submit(); }} disabled={busy} className="px-3 py-1.5 rounded-lg border border-red-300 text-red-600 text-xs font-semibold hover:bg-red-50 disabled:opacity-60">
            Request account deletion
          </button>
        </>
      )}
    </div>
  );
}

function SettingsView({ onLogout }: { onLogout: () => void }) {
  const { state } = useApp();
  return (
    <OfficeCard>
      <h2 className="font-bold text-ent-ink">Settings &amp; Account</h2>
      <div className="text-sm text-ent-ink space-y-1">
        <p><span className="text-ent-muted">Name:</span> {state.currentUser?.firstName} {state.currentUser?.lastName}</p>
        <p><span className="text-ent-muted">Email:</span> {state.currentUser?.email}</p>
      </div>
      <button type="button" onClick={onLogout} className="mt-2 px-4 py-2 rounded-xl bg-ent-bronze hover:opacity-90 text-white text-sm font-semibold">Logout</button>
      <MFASettings />
      <ActiveSessionsPanel />
      <AccountDeletionRequestPanel />
    </OfficeCard>
  );
}
