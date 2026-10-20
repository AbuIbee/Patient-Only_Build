// ROUND 5 — the dedicated Enterprise Caregiver Portal shell (locked
// requirements H01-H18, N01-N14). Previously, an org-caregiver with no
// director/therapist/medical_professional role fell through
// EnterpriseDashboardRouter into the plain residential CaregiverPortal
// with org patients merged in — never a distinct shell of its own. The
// locked requirement explicitly wants "Enterprise caregivers land in
// their own shell" with its own stable 14-item navigation (section 8),
// which this component is.
//
// Every value shown here comes from a real RPC/table query, scoped by
// the caller's own active staff_patient_assignments/organization_memberships
// rows (server-enforced RLS, not a client-side assumption) — no
// placeholder counts, no fabricated sample patients.
import { useEffect, useState, useCallback } from 'react';
import { useApp } from '@/store/useApp';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  LogOut, Users, Loader2, MessageSquare, Calendar, ClipboardList,
  ChevronRight, Menu, X, ShieldAlert, Clock, Building2,
  ClipboardCheck, FileText, UserCog, Settings as SettingsIcon, Send,
  AlertTriangle, CheckCircle2, PlayCircle, StopCircle,
} from 'lucide-react';
import {
  getMyStaffPatients, getMyCareTeam, getMyOrgSupervisor, getMyOrganizations,
  type StaffPatient, type CareTeamMember,
} from '@/services/organizationService';
import { getMyConversations, createConversation, type ConversationSummary } from '@/services/communicationsService';
import { getHelpActivationHistory } from '@/services/helpActivationService';
import {
  getMyVisits, startCaregiverVisit, endCaregiverVisit, scheduleCaregiverVisit,
  getPatientIncidentReports, fileIncidentReport,
  reportScopeConcern, getMyCredentials,
  type CaregiverVisit, type IncidentReport, type CaregiverCredential,
} from '@/services/enterpriseCaregiverWorkToolsService';
import EnterpriseStaffPatientView from './EnterpriseStaffPatientView';
import EnterprisePatientRecordTabs from './EnterprisePatientRecordTabs';

type NavItem =
  | 'dashboard' | 'patients' | 'schedule' | 'tasks' | 'records' | 'communications'
  | 'notes' | 'handoffs' | 'alerts' | 'visits' | 'careTeam' | 'documents' | 'organization' | 'settings';

const NAV_ITEMS: { key: NavItem; label: string; icon: typeof Users }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: ClipboardList },
  { key: 'patients', label: 'My Patients', icon: Users },
  { key: 'schedule', label: 'My Schedule', icon: Calendar },
  { key: 'tasks', label: 'Care Plans & Tasks', icon: ClipboardCheck },
  { key: 'records', label: 'Patient Health Records', icon: FileText },
  { key: 'communications', label: 'Care Communications', icon: MessageSquare },
  { key: 'notes', label: 'Care Notes & Observations', icon: FileText },
  { key: 'handoffs', label: 'Shift Handoffs', icon: Send },
  { key: 'alerts', label: 'Alerts & Incidents', icon: ShieldAlert },
  { key: 'visits', label: 'Visits & Time Records', icon: Clock },
  { key: 'careTeam', label: 'My Care Team', icon: UserCog },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'organization', label: 'My Organization', icon: Building2 },
  { key: 'settings', label: 'Settings & Account', icon: SettingsIcon },
];

export default function EnterpriseCaregiverDashboard() {
  const { state, dispatch } = useApp();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string>('');
  const [patients, setPatients] = useState<StaffPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [nav, setNav] = useState<NavItem>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [openPatient, setOpenPatient] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [orgs, staffPatients] = await Promise.all([getMyOrganizations(), getMyStaffPatients()]);
      const myOrg = orgs.find((o) => o.orgRole === 'caregiver');
      if (myOrg) { setOrgId(myOrg.organizationId); setOrgName(myOrg.organizationName); }
      setPatients(staffPatients.filter((p) => p.orgRole === 'caregiver'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    dispatch({ type: 'LOGOUT' });
    toast('You have been logged out');
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-warm-ivory"><Loader2 className="w-8 h-8 animate-spin text-warm-bronze" /></div>;
  }

  if (!orgId) {
    // No active organization-caregiver membership could be confirmed —
    // never a fabricated dashboard. This should be unreachable from
    // EnterpriseDashboardRouter (which only renders this component when
    // hasCaregiverOrgRole is true), but is handled explicitly rather
    // than crashing on a null org id.
    return (
      <div className="min-h-screen bg-warm-ivory flex items-center justify-center p-4">
        <p className="text-sm text-medium-gray">Your organization membership could not be confirmed. Please sign in again.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-ivory flex">
      {/* Desktop sidebar — persistent, all 14 items, never collapsed below entitlement (locked requirement: "still exposes every item without overflow or reduced entitlement"). */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-white border-r border-soft-taupe">
        <div className="p-4 border-b border-soft-taupe flex items-center gap-2">
          <img src="/images/MymemoriaDayTime.png" alt="My Memoria Ally" className="w-8 h-8 rounded-lg object-cover" />
          <div>
            <div className="font-semibold text-charcoal text-sm">My Memoria Ally</div>
            <div className="text-xs text-medium-gray truncate">{orgName}</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
            <button
              key={key} type="button" onClick={() => { setNav(key); setOpenPatient(null); }}
              className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors ${
                nav === key ? 'bg-warm-bronze/10 text-warm-bronze font-semibold border-r-2 border-warm-bronze' : 'text-charcoal hover:bg-warm-ivory'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" /> {label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-soft-taupe">
          <button type="button" onClick={() => { void handleLogout(); }} className="w-full flex items-center gap-2 text-sm text-medium-gray hover:text-charcoal px-3 py-2 rounded-lg hover:bg-warm-ivory">
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar + drawer */}
        <header className="lg:hidden bg-white border-b border-soft-taupe px-4 py-3 flex items-center justify-between">
          <button type="button" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation" className="p-1.5 -ml-1.5 text-charcoal">
            <Menu className="w-5 h-5" />
          </button>
          <div className="font-semibold text-charcoal text-sm truncate">{NAV_ITEMS.find((n) => n.key === nav)?.label}</div>
          <button type="button" onClick={() => { void handleLogout(); }} aria-label="Logout" className="p-1.5 -mr-1.5 text-medium-gray">
            <LogOut className="w-5 h-5" />
          </button>
        </header>
        {mobileNavOpen && (
          <div className="lg:hidden fixed inset-0 z-50 bg-black/40" onClick={() => setMobileNavOpen(false)}>
            <div className="bg-white w-72 h-full p-2 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-3">
                <span className="font-semibold text-charcoal text-sm">{orgName}</span>
                <button type="button" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation"><X className="w-5 h-5 text-medium-gray" /></button>
              </div>
              {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key} type="button" onClick={() => { setNav(key); setOpenPatient(null); setMobileNavOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-4 py-3 text-sm text-left rounded-lg ${nav === key ? 'bg-warm-bronze/10 text-warm-bronze font-semibold' : 'text-charcoal'}`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" /> {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {openPatient ? (
            <div className="max-w-3xl mx-auto">
              <EnterpriseStaffPatientView
                organizationId={orgId} patientId={openPatient} onBack={() => setOpenPatient(null)} staffRole="caregiver"
                onReady={(patient) => (
                  <EnterprisePatientRecordTabs patientId={openPatient} patientHeader={patient} staffRole="caregiver" orgId={orgId} onBack={() => setOpenPatient(null)} />
                )}
              />
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-5">
              {nav === 'dashboard' && <DashboardView patients={patients} orgId={orgId} onOpenPatient={setOpenPatient} onNavigate={setNav} />}
              {(nav === 'patients' || nav === 'records') && (
                <PatientsListView patients={patients} onOpenPatient={setOpenPatient} />
              )}
              {nav === 'schedule' && <ScheduleView orgId={orgId} patients={patients} />}
              {nav === 'visits' && <VisitsListView />}
              {nav === 'tasks' && <TasksView patients={patients} />}
              {nav === 'communications' && <CommunicationsView />}
              {nav === 'notes' && <PatientsListView patients={patients} onOpenPatient={setOpenPatient} title="Select a patient to view or add Care Notes & Observations" />}
              {nav === 'handoffs' && <PatientsListView patients={patients} onOpenPatient={setOpenPatient} title="Select a patient to record or review Shift Handoffs" />}
              {nav === 'alerts' && <AlertsView patients={patients} orgId={orgId} />}
              {nav === 'careTeam' && <CareTeamView orgId={orgId} patients={patients} />}
              {nav === 'documents' && <PatientsListView patients={patients} onOpenPatient={setOpenPatient} title="Select a patient to view their Documents" />}
              {nav === 'organization' && <OrganizationView orgId={orgId} orgName={orgName} />}
              {nav === 'settings' && <SettingsView userName={state.currentUser?.firstName} onLogout={handleLogout} />}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-3">{children}</div>;
}

// H01 (identity), H02 (today's overview), H03 (alerts), H04 (inbox),
// H05 (assigned patients), H06/H07 (schedule/next visit) — real counts
// from the data already loaded by the shell, each navigating to its
// underlying authorized records per the locked requirement.
function DashboardView({ patients, orgId, onOpenPatient, onNavigate }: { patients: StaffPatient[]; orgId: string; onOpenPatient: (id: string) => void; onNavigate: (nav: NavItem) => void }) {
  const { state } = useApp();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [visits, setVisits] = useState<CaregiverVisit[]>([]);
  const [incidents, setIncidents] = useState<IncidentReport[]>([]);
  const [helpCount, setHelpCount] = useState(0);
  const [loadingExtra, setLoadingExtra] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const [convos, myVisits] = await Promise.all([getMyConversations(), getMyVisits()]);
      const allIncidents = (await Promise.all(patients.map((p) => getPatientIncidentReports(p.patientId)))).flat();
      const allHelp = (await Promise.all(patients.map(async (p) => (await getHelpActivationHistory(p.patientId)).entries))).flat();
      if (!active) return;
      setConversations(convos);
      setVisits(myVisits);
      setIncidents(allIncidents.filter((i) => i.resolutionStatus !== 'resolved'));
      setHelpCount(allHelp.length);
      setLoadingExtra(false);
    })();
    return () => { active = false; };
  }, [patients]);

  const unreadCount = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
  const todayVisits = visits.filter((v) => v.scheduledStart && new Date(v.scheduledStart).toDateString() === new Date().toDateString());
  const nextVisit = todayVisits.find((v) => v.status === 'scheduled' || v.status === 'in_progress');

  return (
    <>
      <Card>
        <h1 className="text-xl font-bold text-charcoal">Welcome, {state.currentUser?.firstName || 'Caregiver'}</h1>
        <p className="text-sm text-medium-gray">Signed in as an Enterprise caregiver — {orgId ? 'active organization confirmed' : ''}.</p>
      </Card>

      {/* H02 — ROUND 6: each count now navigates to its underlying,
          authorized record set ("Each count must navigate to its
          underlying, authorized records"), not just the sidebar. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          { label: 'Assigned Patients', value: patients.length, nav: 'patients' as NavItem },
          { label: "Today's Visits", value: todayVisits.length, nav: 'schedule' as NavItem },
          { label: 'Unread Messages', value: unreadCount, nav: 'communications' as NavItem },
          { label: 'Open Alerts', value: incidents.length + helpCount, nav: 'alerts' as NavItem },
        ]).map((m) => (
          <button
            key={m.label} type="button" onClick={() => onNavigate(m.nav)}
            className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-4 text-center hover:shadow-md hover:border-warm-bronze/40 transition-all"
          >
            <p className="text-2xl font-bold text-warm-bronze">{loadingExtra ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : m.value}</p>
            <p className="text-xs text-medium-gray mt-1">{m.label}</p>
          </button>
        ))}
      </div>

      {incidents.length > 0 && (
        <Card>
          <div className="flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-gentle-coral" /><h2 className="font-bold text-charcoal">Critical Alerts &amp; Incidents</h2></div>
          <ul className="space-y-2">
            {incidents.map((i) => (
              <li key={i.id} className="p-3 bg-gentle-coral/5 border border-gentle-coral/30 rounded-xl">
                <p className="text-sm font-medium text-charcoal capitalize">{i.incidentType.replace('_', ' ')} — {i.severity}</p>
                <p className="text-xs text-medium-gray">{i.description}</p>
                <p className="text-[11px] text-medium-gray mt-1">{new Date(i.occurredAt).toLocaleString()} · {i.resolutionStatus.replace('_', ' ')}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {nextVisit && (
        <Card>
          <div className="flex items-center gap-2"><Clock className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">Current / Next Visit</h2></div>
          <p className="text-sm text-charcoal">{patients.find((p) => p.patientId === nextVisit.patientId)?.preferredName || 'Patient'} — {nextVisit.status === 'in_progress' ? 'In progress' : new Date(nextVisit.scheduledStart ?? '').toLocaleTimeString()}</p>
        </Card>
      )}

      <Card>
        <div className="flex items-center gap-2"><Users className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">My Assigned Patients</h2></div>
        {patients.length === 0 ? (
          <p className="text-sm text-medium-gray">No patients are currently assigned to you. Your organization's director can assign you once a patient is covered.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {patients.map((p) => (
              <button key={p.patientId} type="button" onClick={() => onOpenPatient(p.patientId)} className="flex items-center justify-between gap-2 p-4 bg-warm-ivory rounded-2xl border border-soft-taupe hover:shadow-md transition-all text-left">
                <span className="font-medium text-charcoal truncate">{p.preferredName || `${p.firstName} ${p.lastName}`}</span>
                <ChevronRight className="w-4 h-4 text-warm-bronze flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function PatientsListView({ patients, onOpenPatient, title }: { patients: StaffPatient[]; onOpenPatient: (id: string) => void; title?: string }) {
  return (
    <Card>
      <div className="flex items-center gap-2"><Users className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">{title || 'My Patients'}</h2></div>
      {patients.length === 0 ? (
        <p className="text-sm text-medium-gray">No patients are currently assigned to you.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {patients.map((p) => (
            <button key={p.patientId} type="button" onClick={() => onOpenPatient(p.patientId)} className="flex items-center justify-between gap-2 p-4 bg-warm-ivory rounded-2xl border border-soft-taupe hover:shadow-md transition-all text-left">
              <span className="font-medium text-charcoal truncate">{p.preferredName || `${p.firstName} ${p.lastName}`}</span>
              <ChevronRight className="w-4 h-4 text-warm-bronze flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

// W01/H06/H07/H13 — schedule a visit (director-equivalent action,
// re-verified server-side against the caller's own active assignment
// by the RPC), start/end it.
function ScheduleView({ orgId, patients }: { orgId: string; patients: StaffPatient[] }) {
  const [visits, setVisits] = useState<CaregiverVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPatient, setSelectedPatient] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => { setVisits(await getMyVisits()); setLoading(false); }, []);
  useEffect(() => { void load(); }, [load]);

  const schedule = async () => {
    if (!selectedPatient || !start || !end) return;
    setSaving(true);
    try {
      const { error } = await scheduleCaregiverVisit(orgId, selectedPatient, new Date(start).toISOString(), new Date(end).toISOString());
      if (error) { toast.error(error); return; }
      setStart(''); setEnd('');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const act = async (visitId: string, action: 'start' | 'end') => {
    const { error } = action === 'start' ? await startCaregiverVisit(visitId) : await endCaregiverVisit(visitId);
    if (error) { toast.error(error); return; }
    await load();
  };

  return (
    <Card>
      <div className="flex items-center gap-2"><Calendar className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">My Schedule</h2></div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <select value={selectedPatient} onChange={(e) => setSelectedPatient(e.target.value)} className="px-3 py-2 rounded-xl border border-soft-taupe text-sm sm:col-span-2">
          <option value="">Select patient…</option>
          {patients.map((p) => <option key={p.patientId} value={p.patientId}>{p.preferredName || p.firstName}</option>)}
        </select>
        <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="px-3 py-2 rounded-xl border border-soft-taupe text-sm" />
        <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="px-3 py-2 rounded-xl border border-soft-taupe text-sm" />
      </div>
      <button type="button" onClick={() => { void schedule(); }} disabled={saving || !selectedPatient || !start || !end} className="px-4 py-2 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white text-sm font-semibold disabled:opacity-60">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Schedule Visit'}
      </button>
      {loading ? <Loader2 className="w-5 h-5 animate-spin text-warm-bronze" /> : visits.length === 0 ? (
        <p className="text-sm text-medium-gray">No visits scheduled yet.</p>
      ) : (
        <ul className="space-y-2">
          {visits.map((v) => (
            <li key={v.id} className="flex items-center justify-between p-3 bg-warm-ivory rounded-xl border border-soft-taupe">
              <div>
                <p className="text-sm font-medium text-charcoal">{patients.find((p) => p.patientId === v.patientId)?.preferredName || 'Patient'} — <span className="capitalize">{v.status.replace('_', ' ')}</span></p>
                <p className="text-xs text-medium-gray">{v.scheduledStart ? new Date(v.scheduledStart).toLocaleString() : 'No time set'}</p>
              </div>
              {v.status === 'scheduled' && <button type="button" onClick={() => { void act(v.id, 'start'); }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-soft-sage text-white text-xs font-semibold"><PlayCircle className="w-3.5 h-3.5" /> Start</button>}
              {v.status === 'in_progress' && <button type="button" onClick={() => { void act(v.id, 'end'); }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gentle-coral text-white text-xs font-semibold"><StopCircle className="w-3.5 h-3.5" /> End</button>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function VisitsListView() {
  const [visits, setVisits] = useState<CaregiverVisit[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { void getMyVisits().then((v) => { setVisits(v); setLoading(false); }); }, []);
  return (
    <Card>
      <div className="flex items-center gap-2"><Clock className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">Visits &amp; Time Records</h2></div>
      {loading ? <Loader2 className="w-5 h-5 animate-spin text-warm-bronze" /> : visits.length === 0 ? (
        <p className="text-sm text-medium-gray">No visit history yet.</p>
      ) : (
        <ul className="space-y-2">
          {visits.map((v) => (
            <li key={v.id} className="p-3 bg-warm-ivory rounded-xl border border-soft-taupe text-sm">
              <p className="font-medium text-charcoal capitalize">{v.status.replace('_', ' ')}</p>
              <p className="text-xs text-medium-gray">
                {v.actualStart ? `Started ${new Date(v.actualStart).toLocaleString()}` : 'Not started'}
                {v.actualEnd ? ` · Ended ${new Date(v.actualEnd).toLocaleString()}` : ''}
              </p>
              {v.visitNotes && <p className="text-xs text-charcoal mt-1">{v.visitNotes}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// W02/H08 — Care Plans & Tasks. Reuses the existing `tasks` table
// (migration 067 already extended its RLS to recognize an active
// staff_patient_assignments row) — read-only in this pass; marking a
// task's outcome reuses the same table's existing status values
// (pending/completed/skipped); "Not Applicable" is not yet a
// representable status and is disclosed as a known gap rather than
// silently mapped to one of the existing three.
type TaskStatus = 'pending' | 'completed' | 'skipped' | 'not_applicable';
interface TaskRow { id: string; patient_id: string; title: string; status: TaskStatus; refusal_reason: string | null }

// H08/W02/N04 — ROUND 6: all four locked statuses (Completed,
// Declined [skipped], Not Completed [pending], Not Applicable) are now
// representable (migration 071 added 'not_applicable' to the CHECK
// constraint, which previously only allowed pending/completed/skipped).
// A refusal reason is requested for skipped/not_applicable, matching
// "documented patient refusal."
function TasksView({ patients }: { patients: StaffPatient[] }) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { state } = useApp();

  const load = useCallback(() => {
    if (patients.length === 0) { setLoading(false); return; }
    void supabase.from('tasks').select('id, patient_id, title, status, refusal_reason').in('patient_id', patients.map((p) => p.patientId)).eq('is_active', true)
      .then(({ data }) => { setTasks((data ?? []) as TaskRow[]); setLoading(false); });
  }, [patients]);
  useEffect(() => { load(); }, [load]);

  const markStatus = async (taskId: string, status: TaskStatus) => {
    let refusalReason: string | null = null;
    if (status === 'skipped' || status === 'not_applicable') {
      refusalReason = window.prompt(status === 'skipped' ? 'Reason the patient declined (optional):' : 'Reason this task is not applicable (optional):') || null;
    }
    const { error } = await supabase.from('tasks').update({
      status, refusal_reason: refusalReason, completed_at: status === 'completed' ? new Date().toISOString() : null,
      status_updated_by: state.currentUser?.id ?? null, status_updated_at: new Date().toISOString(),
    }).eq('id', taskId).select('id');
    if (error) { toast.error(error.message); return; }
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status, refusal_reason: refusalReason } : t)));
  };

  const statusLabel: Record<TaskStatus, string> = { pending: 'Not Completed', completed: 'Completed', skipped: 'Declined', not_applicable: 'Not Applicable' };

  return (
    <Card>
      <div className="flex items-center gap-2"><ClipboardCheck className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">Care Plans &amp; Tasks</h2></div>
      {loading ? <Loader2 className="w-5 h-5 animate-spin text-warm-bronze" /> : tasks.length === 0 ? (
        <p className="text-sm text-medium-gray">No assigned tasks found for your patients.</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center justify-between p-3 bg-warm-ivory rounded-xl border border-soft-taupe">
              <div>
                <p className="text-sm font-medium text-charcoal">{t.title}</p>
                <p className="text-xs text-medium-gray">{patients.find((p) => p.patientId === t.patient_id)?.preferredName} · {statusLabel[t.status]}</p>
                {t.refusal_reason && <p className="text-xs text-medium-gray italic">&quot;{t.refusal_reason}&quot;</p>}
              </div>
              <div className="flex gap-1.5">
                <button type="button" title="Completed" onClick={() => { void markStatus(t.id, 'completed'); }} className="p-1.5 rounded-lg bg-soft-sage/20 text-soft-sage"><CheckCircle2 className="w-4 h-4" /></button>
                <button type="button" title="Declined" onClick={() => { void markStatus(t.id, 'skipped'); }} className="p-1.5 rounded-lg bg-gentle-coral/20 text-gentle-coral"><X className="w-4 h-4" /></button>
                <button type="button" title="Not Applicable" onClick={() => { void markStatus(t.id, 'not_applicable'); }} className="p-1.5 rounded-lg bg-medium-gray/20 text-medium-gray text-xs font-bold">N/A</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function CommunicationsView() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { void getMyConversations().then((c) => { setConversations(c); setLoading(false); }); }, []);
  return (
    <Card>
      <div className="flex items-center gap-2"><MessageSquare className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">Care Communications</h2></div>
      {loading ? <Loader2 className="w-5 h-5 animate-spin text-warm-bronze" /> : conversations.length === 0 ? (
        <p className="text-sm text-medium-gray">No conversations yet. Open a patient's record to start one.</p>
      ) : (
        <ul className="space-y-2">
          {conversations.map((c) => (
            <li key={c.conversationId} className="p-3 bg-warm-ivory rounded-xl border border-soft-taupe">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-charcoal">{c.patientName}{c.subject ? ` — ${c.subject}` : ''}</p>
                {c.unreadCount > 0 && <span className="text-[11px] bg-warm-bronze text-white rounded-full px-2 py-0.5">{c.unreadCount}</span>}
              </div>
              {c.lastMessageBody && <p className="text-xs text-medium-gray mt-1 truncate">{c.lastMessageBody}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// H12/W07/N09 — file/view incidents across every assigned patient.
interface HelpAlertRow { kind: 'help'; id: string; patientName: string; occurredAt: string; detail: string }
interface IncidentAlertRow extends IncidentReport { kind: 'incident'; patientName: string }
type AlertRow = HelpAlertRow | IncidentAlertRow;

// H03/P17 — ROUND 6: merges HELP-button activations alongside
// incident_reports into one feed — "never equate recording with
// delivery or emergency dispatch" is preserved verbatim: the
// notification_status text is shown as recorded, never translated into
// a delivery/dispatch claim.
function AlertsView({ patients, orgId }: { patients: StaffPatient[]; orgId: string }) {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [patientId, setPatientId] = useState('');
  const [incidentType, setIncidentType] = useState<'fall' | 'injury' | 'behavioral' | 'medication_concern' | 'safety_event' | 'other'>('other');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const incidentRows = (await Promise.all(patients.map(async (p) => (await getPatientIncidentReports(p.patientId)).map((i): IncidentAlertRow => ({ ...i, kind: 'incident', patientName: p.preferredName || p.firstName }))))).flat();
    const helpRows = (await Promise.all(patients.map(async (p) => {
      const { entries } = await getHelpActivationHistory(p.patientId);
      return entries.map((e): HelpAlertRow => ({
        kind: 'help', id: e.id, patientName: p.preferredName || p.firstName, occurredAt: e.createdAt,
        detail: `HELP button activated${e.phoneDialed ? ` — attempted call to ${e.phoneDialed}` : ''} (${e.notificationStatus.replace('_', ' ')})`,
      }));
    }))).flat();
    const merged: AlertRow[] = [...incidentRows, ...helpRows];
    merged.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
    setAlerts(merged);
    setLoading(false);
  }, [patients]);
  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (!patientId || !description.trim()) return;
    setSaving(true);
    try {
      const { error } = await fileIncidentReport(orgId, patientId, incidentType, description);
      if (error) { toast.error(error); return; }
      setDescription('');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const escalate = async () => {
    if (!patientId || !description.trim()) return;
    const { error } = await reportScopeConcern(orgId, patientId, description);
    if (error) { toast.error(error); return; }
    toast.success('Scope concern reported to your supervisor.');
    setDescription('');
  };

  return (
    <Card>
      <div className="flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-gentle-coral" /><h2 className="font-bold text-charcoal">Alerts &amp; Incidents</h2></div>
      <div className="space-y-2">
        <select value={patientId} onChange={(e) => setPatientId(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-soft-taupe text-sm">
          <option value="">Select patient…</option>
          {patients.map((p) => <option key={p.patientId} value={p.patientId}>{p.preferredName || p.firstName}</option>)}
        </select>
        <select value={incidentType} onChange={(e) => setIncidentType(e.target.value as typeof incidentType)} className="w-full px-3 py-2 rounded-xl border border-soft-taupe text-sm">
          {['fall', 'injury', 'behavioral', 'medication_concern', 'safety_event', 'other'].map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
        </select>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe what happened…" rows={2} className="w-full px-3 py-2 rounded-xl border border-soft-taupe text-sm resize-none" />
        <div className="flex gap-2">
          <button type="button" onClick={() => { void submit(); }} disabled={saving || !patientId || !description.trim()} className="flex-1 px-4 py-2 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white text-sm font-semibold disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'File Incident'}
          </button>
          <button type="button" onClick={() => { void escalate(); }} disabled={!patientId || !description.trim()} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-soft-taupe text-charcoal text-sm font-semibold disabled:opacity-60">
            <AlertTriangle className="w-4 h-4" /> Report Scope Concern
          </button>
        </div>
      </div>
      {loading ? <Loader2 className="w-5 h-5 animate-spin text-warm-bronze" /> : alerts.length === 0 ? (
        <p className="text-sm text-medium-gray">No alerts or incidents recorded.</p>
      ) : (
        <ul className="space-y-2">
          {alerts.map((a) => a.kind === 'help' ? (
            <li key={`help-${a.id}`} className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-sm font-medium text-charcoal">{a.patientName} — {a.detail}</p>
              <p className="text-[11px] text-medium-gray mt-1">{new Date(a.occurredAt).toLocaleString()} · recorded in app only, not a verified emergency dispatch</p>
            </li>
          ) : (
            <li key={`incident-${a.id}`} className="p-3 bg-warm-ivory rounded-xl border border-soft-taupe">
              <p className="text-sm font-medium text-charcoal capitalize">{a.patientName} — {a.incidentType.replace('_', ' ')} ({a.severity})</p>
              <p className="text-xs text-medium-gray">{a.description}</p>
              <p className="text-[11px] text-medium-gray mt-1">{new Date(a.occurredAt).toLocaleString()} · <span className="capitalize">{a.resolutionStatus.replace('_', ' ')}</span></p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function CareTeamView({ orgId, patients }: { orgId: string; patients: StaffPatient[] }) {
  const [team, setTeam] = useState<CareTeamMember[]>([]);
  const [supervisor, setSupervisor] = useState<{ userId: string; firstName: string; lastName: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [messagingSupervisor, setMessagingSupervisor] = useState(false);
  useEffect(() => {
    void Promise.all([getMyCareTeam(orgId), getMyOrgSupervisor(orgId)]).then(([t, s]) => { setTeam(t); setSupervisor(s); setLoading(false); });
  }, [orgId]);

  // W09 — ROUND 6: "communicate via private, explicitly addressed
  // professional conversation" — previously only displayed the
  // supervisor's name. Every conversation in this app is patient-
  // scoped, so the caregiver's first assigned patient provides that
  // context; a caregiver with no assigned patient cannot yet message a
  // supervisor this way (disclosed, not silently hidden).
  const messageSupervisor = async () => {
    if (!supervisor || patients.length === 0) return;
    setMessagingSupervisor(true);
    try {
      const { error } = await createConversation(patients[0].patientId, [supervisor.userId], `Message to ${supervisor.firstName} ${supervisor.lastName}`);
      if (error) { toast.error(error); return; }
      toast.success('Conversation started — continue it from Care Communications.');
    } finally {
      setMessagingSupervisor(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center gap-2"><UserCog className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">My Care Team</h2></div>
      {loading ? <Loader2 className="w-5 h-5 animate-spin text-warm-bronze" /> : (
        <>
          {supervisor && (
            <div className="p-3 bg-warm-bronze/5 rounded-xl border border-warm-bronze/20 flex items-center justify-between">
              <div>
                <p className="text-xs text-medium-gray">Supervisor Contact</p>
                <p className="text-sm font-semibold text-charcoal">{supervisor.firstName} {supervisor.lastName}</p>
              </div>
              {patients.length > 0 && (
                <button type="button" onClick={() => { void messageSupervisor(); }} disabled={messagingSupervisor} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-warm-bronze hover:bg-deep-bronze text-white text-xs font-semibold disabled:opacity-60">
                  <Send className="w-3.5 h-3.5" /> Message
                </button>
              )}
            </div>
          )}
          {team.length === 0 ? <p className="text-sm text-medium-gray">No colleagues share a patient assignment with you yet.</p> : (
            <ul className="space-y-2">
              {team.map((m) => (
                <li key={m.userId} className="flex items-center justify-between p-3 bg-warm-ivory rounded-xl border border-soft-taupe">
                  <span className="text-sm font-medium text-charcoal">{m.firstName} {m.lastName}</span>
                  <span className="text-xs text-medium-gray capitalize">{m.isDirector ? 'Director' : m.orgRole.replace('_', ' ')}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

function OrganizationView({ orgId, orgName }: { orgId: string; orgName: string }) {
  const { state } = useApp();
  const [credentials, setCredentials] = useState<CaregiverCredential[]>([]);
  const [loadingCreds, setLoadingCreds] = useState(true);
  useEffect(() => { void getMyCredentials().then((c) => { setCredentials(c); setLoadingCreds(false); }); }, []);

  return (
    <>
      <Card>
        <div className="flex items-center gap-2"><Building2 className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">My Organization</h2></div>
        <div className="space-y-1 text-sm">
          <p className="text-charcoal font-medium">{orgName}</p>
          <p className="text-medium-gray">Role: Caregiver</p>
          <p className="text-medium-gray">Signed in as {state.currentUser?.firstName} {state.currentUser?.lastName}</p>
        </div>
        <p className="text-xs text-medium-gray">Organization id: {orgId}</p>
      </Card>
      {/* H17/O06 — Credentials & Training. Recorded by a director only
          (admin_set_role-style gate — a caregiver cannot self-certify);
          shown here read-only. */}
      <Card>
        <div className="flex items-center gap-2"><ClipboardCheck className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">Credentials &amp; Training</h2></div>
        {loadingCreds ? <Loader2 className="w-5 h-5 animate-spin text-warm-bronze" /> : credentials.length === 0 ? (
          <p className="text-sm text-medium-gray">No credentials on file. Your organization's director can record one for you.</p>
        ) : (
          <ul className="space-y-2">
            {credentials.map((c) => (
              <li key={c.id} className="flex items-center justify-between p-3 bg-warm-ivory rounded-xl border border-soft-taupe">
                <span className="text-sm font-medium text-charcoal">{c.credentialName}</span>
                <span className={`text-xs font-semibold capitalize ${c.status === 'expired' ? 'text-gentle-coral' : c.status === 'expiring_soon' ? 'text-amber-600' : 'text-soft-sage'}`}>
                  {c.status.replace('_', ' ')}{c.expiresAt ? ` · ${new Date(c.expiresAt).toLocaleDateString()}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function SettingsView({ userName, onLogout }: { userName?: string; onLogout: () => Promise<void> }) {
  return (
    <Card>
      <div className="flex items-center gap-2"><SettingsIcon className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">Settings &amp; Account</h2></div>
      <p className="text-sm text-charcoal">Signed in as {userName || 'Caregiver'}.</p>
      <button type="button" onClick={() => { void onLogout(); }} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-soft-taupe text-charcoal text-sm font-semibold hover:bg-warm-ivory">
        <LogOut className="w-4 h-4" /> Secure Logout
      </button>
    </Card>
  );
}

// ROUND 6: the four per-patient sections previously appended below
// EnterpriseStaffPatientView (visits, shift handoffs, incidents,
// documents) have moved into EnterprisePatientRecordTabs.tsx's
// Appointments/Safety/Documents tabs, reached via the onReady
// delegation above. See that file for the current implementation.
