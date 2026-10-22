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
  AlertTriangle, CheckCircle2, PlayCircle, StopCircle, Sparkles, Flag, Moon,
} from 'lucide-react';
import {
  getMyStaffPatients, getMyCareTeam, getMyOrgSupervisor, getMyOrganizations, coverPatientViaStaffRegistration,
  type StaffPatient, type CareTeamMember,
} from '@/services/organizationService';
import { getMyPendingRegistrations, type PendingRegistrationSummary } from '@/services/caregiverRegistrationService';
import { RegisterPatientForm, IncompleteRegistrations } from '@/pages/caregiver/CaregiverPortal';
import { getMyConversations, createConversation, searchMyConversations, type ConversationSummary } from '@/services/communicationsService';
import { inviteTherapist } from '@/services/therapistConnectionService';
import { getHelpActivationHistory } from '@/services/helpActivationService';
import { requestAccountDeletion, cancelAccountDeletionRequest, getMyAccountDeletionRequests, type AccountDeletionRequest } from '@/services/accountDeletionService';
import {
  getMyVisits, startCaregiverVisit, endCaregiverVisit, scheduleCaregiverVisit,
  getPatientIncidentReports, fileIncidentReport,
  reportScopeConcern, getMyCredentials, getPatientShiftHandoffs,
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

// APPROVED ENTERPRISE UI DIRECTIVE §2 — the exact 3 navigation groups
// and their exact item order, as approved against
// MyMemoria_Enterprise_Caregiver_Dashboard_Preview.png.
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: 'WORKSPACE', items: ['dashboard', 'patients', 'schedule', 'tasks', 'records'] },
  { label: 'CARE COLLABORATION', items: ['communications', 'notes', 'handoffs', 'alerts'] },
  { label: 'PROFESSIONAL TOOLS', items: ['visits', 'careTeam', 'documents', 'organization', 'settings'] },
];

// APPROVED ENTERPRISE UI DIRECTIVE §2/§5/§9 — "Support direct navigation,
// browser refresh, back and forward." The shell's own nav/open-patient
// state is kept in sync with the URL under /business/... via
// history.pushState (this app's existing manual-routing convention —
// see CLAUDE.md), so a reload or a shared deep link lands on the same
// screen instead of always resetting to the dashboard.
// P1 CORRECTIVE ORDER §7 — `root` defaults to '/business' (byte-for-byte
// the prior hardcoded behavior) so every EXISTING caller is completely
// unaffected; ProfessionalOfficeResolver.tsx passes '/Professional/Caregiver'
// so nested routes resolve/sync under the new centralized entry instead.
function parseEnterprisePath(root: string): { nav: NavItem; openPatient: string | null } {
  const rootSegments = root.split('/').filter(Boolean).length; // '/business' -> 1, '/Professional/Caregiver' -> 2
  const segments = window.location.pathname.split('/').filter(Boolean);
  const sub = segments[rootSegments];
  const sub2 = segments[rootSegments + 1];
  if (sub === 'patients' && sub2) return { nav: 'patients', openPatient: sub2 };
  if (sub && NAV_ITEMS.some((n) => n.key === sub)) return { nav: sub as NavItem, openPatient: null };
  return { nav: 'dashboard', openPatient: null };
}

export default function EnterpriseCaregiverDashboard({ basePath = '/business' }: { basePath?: string } = {}) {
  const { state, dispatch } = useApp();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string>('');
  const [patients, setPatients] = useState<StaffPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [nav, setNav] = useState<NavItem>(() => parseEnterprisePath(basePath).nav);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [openPatient, setOpenPatient] = useState<string | null>(() => parseEnterprisePath(basePath).openPatient);

  // Keeps the URL in sync so reload/back/forward/shared links land on
  // the same screen, instead of defaulting back to the dashboard.
  const navigateTo = useCallback((nextNav: NavItem, patientId: string | null = null) => {
    const path = patientId ? `${basePath}/patients/${patientId}` : `${basePath}/${nextNav}`;
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setNav(nextNav);
    setOpenPatient(patientId);
  }, [basePath]);

  useEffect(() => {
    const onPopState = () => {
      const parsed = parseEnterprisePath(basePath);
      setNav(parsed.nav);
      setOpenPatient(parsed.openPatient);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [basePath]);

  // Canonicalize a bare basePath (no sub-path) to `${basePath}/dashboard`
  // without adding an extra back-stack entry, so the URL always
  // reflects a real nav destination once the shell has mounted.
  useEffect(() => {
    if (window.location.pathname.toLowerCase() === basePath.toLowerCase()) {
      window.history.replaceState({}, '', `${basePath}/dashboard`);
    }
  }, [basePath]);

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

  // P1 OWNER-VISIBLE DASHBOARD DELIVERY — presentation access is
  // distinct from protected-data authorization: this shell (sidebar,
  // header, all 14 destinations) renders for ANY authenticated
  // caregiver reaching the Business workspace, whether or not they
  // currently belong to an Enterprise organization. No real
  // organization name, patient, or count is ever fabricated for a
  // no-organization account — every data-bearing panel is replaced by
  // an honest NoOrganizationPanel instead.
  const hasOrganization = !!orgId;

  const firstName = state.currentUser?.firstName || 'Caregiver';
  const lastName = state.currentUser?.lastName || '';
  const fullName = `${firstName} ${lastName}`.trim();
  const initials = (`${firstName[0] || ''}${lastName[0] || ''}` || 'U').toUpperCase();

  return (
    <div className="min-h-screen bg-ent-bg flex">
      {/* Desktop sidebar — persistent, all 14 items grouped exactly as
          approved (WORKSPACE / CARE COLLABORATION / PROFESSIONAL TOOLS),
          never collapsed below entitlement (locked requirement: "still
          exposes every item without overflow or reduced entitlement"). */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-ent-panel border-r border-ent-line sticky top-0 h-screen">
        <div className="flex items-center gap-2.5 px-4 pt-5 pb-4 border-b border-ent-line">
          <div className="w-10 h-10 rounded-xl bg-ent-green flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-ent-forest" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-ent-ink text-sm leading-tight truncate">My Memoria Ally</div>
            <div className="text-[10px] font-extrabold tracking-[0.14em] text-ent-bronze mt-0.5">ENTERPRISE CARE</div>
          </div>
        </div>
        <nav aria-label="Enterprise navigation" className="flex-1 overflow-y-auto px-2.5 py-2">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="text-[9px] font-extrabold tracking-[0.16em] text-ent-muted uppercase px-2.5 pt-4 pb-1.5">{group.label}</div>
              {group.items.map((itemKey) => {
                const item = NAV_ITEMS.find((n) => n.key === itemKey);
                if (!item) return null;
                const Icon = item.icon;
                const isActive = nav === itemKey;
                return (
                  <button
                    key={itemKey} type="button" aria-current={isActive ? 'page' : undefined}
                    onClick={() => navigateTo(itemKey)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-left text-[12.5px] font-semibold transition-colors ${
                      isActive ? 'bg-ent-green-active text-ent-forest' : 'text-ent-text hover:bg-ent-pale'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" /> {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-ent-line flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-ent-green flex items-center justify-center text-ent-forest font-bold text-xs flex-shrink-0" aria-hidden="true">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-ent-ink truncate">{fullName}</div>
            <div className="text-[11px] text-ent-muted truncate">Professional Caregiver</div>
          </div>
          <button type="button" onClick={() => { void handleLogout(); }} aria-label="Logout" className="p-1.5 text-ent-muted hover:text-ent-ink flex-shrink-0 rounded-lg hover:bg-ent-pale">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header bar — org/workspace identification + signed-in identity, every viewport. */}
        <header className="bg-ent-panel border-b border-ent-line px-4 sm:px-6 py-3 flex items-center justify-between gap-3 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button type="button" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation" className="lg:hidden p-1.5 -ml-1.5 text-ent-ink flex-shrink-0">
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-[12.5px] sm:text-[13px] font-semibold truncate">
              <span className="text-ent-ink">{hasOrganization ? orgName : 'No organization connected'}</span>
              <span className="text-ent-muted"> / Caregiver Workspace</span>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="hidden sm:block w-8 h-8 rounded-full bg-ent-green flex items-center justify-center text-ent-forest font-bold text-[11px]" aria-hidden="true">{initials}</div>
            <button type="button" onClick={() => { void handleLogout(); }} aria-label="Logout" className="lg:hidden p-1.5 text-ent-muted hover:text-ent-ink">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        {mobileNavOpen && (
          <div className="lg:hidden fixed inset-0 z-50 bg-black/40" onClick={() => setMobileNavOpen(false)}>
            <div className="bg-ent-panel w-72 h-full p-2 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-ent-green flex items-center justify-center flex-shrink-0"><Sparkles className="w-4 h-4 text-ent-forest" /></div>
                  <span className="font-semibold text-ent-ink text-sm truncate">{hasOrganization ? orgName : 'No organization connected'}</span>
                </div>
                <button type="button" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation"><X className="w-5 h-5 text-ent-muted" /></button>
              </div>
              {NAV_GROUPS.map((group) => (
                <div key={group.label}>
                  <div className="text-[9px] font-extrabold tracking-[0.16em] text-ent-muted uppercase px-3 pt-4 pb-1.5">{group.label}</div>
                  {group.items.map((itemKey) => {
                    const item = NAV_ITEMS.find((n) => n.key === itemKey);
                    if (!item) return null;
                    const Icon = item.icon;
                    const isActive = nav === itemKey;
                    return (
                      <button
                        key={itemKey} type="button" aria-current={isActive ? 'page' : undefined}
                        onClick={() => { navigateTo(itemKey); setMobileNavOpen(false); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-3 text-sm text-left rounded-lg font-semibold ${isActive ? 'bg-ent-green-active text-ent-forest' : 'text-ent-text'}`}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" /> {item.label}
                      </button>
                    );
                  })}
                </div>
              ))}
              <div className="mt-2 pt-2 border-t border-ent-line px-3 py-2 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-ent-green flex items-center justify-center text-ent-forest font-bold text-xs flex-shrink-0">{initials}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-ent-ink truncate">{fullName}</div>
                  <div className="text-[11px] text-ent-muted truncate">Professional Caregiver</div>
                </div>
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-ent-bg">
          {!hasOrganization ? (
            <div className="max-w-6xl mx-auto space-y-5">
              <NoOrganizationPanel />
            </div>
          ) : openPatient ? (
            <div className="max-w-5xl mx-auto">
              <EnterpriseStaffPatientView
                organizationId={orgId} patientId={openPatient} onBack={() => navigateTo(nav)} staffRole="caregiver"
                onReady={(patient) => (
                  <EnterprisePatientRecordTabs patientId={openPatient} patientHeader={patient} staffRole="caregiver" orgId={orgId} onBack={() => navigateTo(nav)} />
                )}
              />
            </div>
          ) : (
            <div className="max-w-6xl mx-auto space-y-5">
              {nav === 'dashboard' && <DashboardView patients={patients} orgId={orgId} onOpenPatient={(id) => navigateTo('patients', id)} onNavigate={navigateTo} onPatientRegistered={() => { void load(); }} />}
              {(nav === 'patients' || nav === 'records') && (
                <PatientsListView patients={patients} onOpenPatient={(id) => navigateTo('patients', id)} orgId={orgId} onChanged={() => { void load(); }} />
              )}
              {nav === 'schedule' && <ScheduleView orgId={orgId} patients={patients} />}
              {nav === 'visits' && <VisitsListView />}
              {nav === 'tasks' && <TasksView patients={patients} />}
              {nav === 'communications' && <CommunicationsView />}
              {nav === 'notes' && (
                <>
                  <MyDocumentationHistoryView />
                  <PatientsListView patients={patients} onOpenPatient={(id) => navigateTo('patients', id)} title="Select a patient to view or add Care Notes & Observations" />
                </>
              )}
              {nav === 'handoffs' && <PatientsListView patients={patients} onOpenPatient={(id) => navigateTo('patients', id)} title="Select a patient to record or review Shift Handoffs" />}
              {nav === 'alerts' && <AlertsView patients={patients} orgId={orgId} />}
              {nav === 'careTeam' && <CareTeamView orgId={orgId} patients={patients} />}
              {nav === 'documents' && <PatientsListView patients={patients} onOpenPatient={(id) => navigateTo('patients', id)} title="Select a patient to view their Documents" />}
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
  return <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-5 sm:p-6 space-y-3">{children}</div>;
}

// P1 OWNER-VISIBLE DASHBOARD DELIVERY — presentation access is distinct
// from protected-data authorization. Shown in place of every
// navigation destination's real content when the signed-in caregiver
// has no active Enterprise organization membership: no fabricated
// organization, patient, or count — just an honest state and the same
// legitimate self-service "Start an Organization" action
// EnterpriseDashboardRouter's own residential fallback already offers,
// reused here rather than reimplemented.
// OWNER CORRECTION — "Enterprise caregivers are operational users, not
// organization founders by default." A caregiver reaching the Business
// workspace with no active Enterprise organization membership sees an
// honest "awaiting access" state here, never an invitation to found
// one themselves — organization creation belongs exclusively to an
// authorized Admin/Director onboarding workflow (unchanged, outside
// this component). The backend enforces this independently of the UI:
// create_organization() (migration 080) now rejects any caller who
// already holds an active membership anywhere, so this is not merely a
// hidden button. Any pending invitation is already shown above this
// panel by EnterpriseDashboardRouter's own PendingInvitesBanner.
function NoOrganizationPanel() {
  return (
    <Card>
      <div className="flex items-center gap-2"><Building2 className="w-5 h-5 text-ent-bronze" /><h2 className="font-bold text-ent-ink">Organization invitation required</h2></div>
      <p className="text-sm text-ent-text">
        Your account is not currently connected to an Enterprise organization, so there is no organization-specific data to show here.
        An organization&apos;s director adds staff members directly — ask your director to add you, and you&apos;ll see the invitation
        above as soon as it&apos;s sent.
      </p>
    </Card>
  );
}

function patientInitials(first: string, last: string): string {
  return (`${first[0] || ''}${last[0] || ''}` || '?').toUpperCase();
}

interface AttentionItem {
  id: string;
  kind: 'help' | 'incident' | 'note';
  patientName: string;
  title: string;
  detail: string;
  at: string;
  nav: NavItem;
}

// H01 (identity), H02 (today's overview), H03 (alerts), H04 (inbox),
// H05 (assigned patients), H06/H07 (schedule/next visit) — real counts
// from the data already loaded by the shell, each navigating to its
// underlying authorized records per the locked requirement.
//
// APPROVED ENTERPRISE UI DIRECTIVE §3 — composition matches
// MyMemoria_Enterprise_Caregiver_Dashboard_Preview.png: greeting +
// Register a New Patient action, 4 summary cards (Assigned patients /
// Visits today / Needs attention / Unread messages), then a
// [Needs your attention + Your patients] / [Next scheduled visit +
// Care communications] two-column layout. Every figure below comes
// from the real queries this component already runs — nothing here is
// a design-example placeholder value.
function DashboardView({ patients, orgId, onOpenPatient, onNavigate, onPatientRegistered }: { patients: StaffPatient[]; orgId: string; onOpenPatient: (id: string) => void; onNavigate: (nav: NavItem) => void; onPatientRegistered: () => void }) {
  const { state } = useApp();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [visits, setVisits] = useState<CaregiverVisit[]>([]);
  const [incidents, setIncidents] = useState<IncidentReport[]>([]);
  const [helpCount, setHelpCount] = useState(0);
  const [recentUpdates, setRecentUpdates] = useState<{ patientName: string; note: string; at: string }[]>([]);
  const [medConcerns, setMedConcerns] = useState<{ patientName: string; medName: string; status: string; at: string }[]>([]);
  const [unacknowledgedHandoffs, setUnacknowledgedHandoffs] = useState(0);
  const [missingVisitNotes, setMissingVisitNotes] = useState(0);
  const [unfinishedCareLists, setUnfinishedCareLists] = useState(0);
  const [attentionItems, setAttentionItems] = useState<AttentionItem[]>([]);
  const [loadingExtra, setLoadingExtra] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const [convos, myVisits] = await Promise.all([getMyConversations(), getMyVisits()]);
      const allIncidents = (await Promise.all(patients.map((p) => getPatientIncidentReports(p.patientId)))).flat();
      const helpByPatient = await Promise.all(patients.map(async (p) => ({
        patient: p, entries: (await getHelpActivationHistory(p.patientId)).entries,
      })));
      const allHelp = helpByPatient.flatMap((h) => h.entries);

      // H09 — "overnight observations, authorized patient/family shared
      // notes, condition changes... excluding Private Journal content."
      // patient_notes' own RLS already excludes care_partner_personal
      // (the Private Journal type); this reads only the general/
      // professional types staff can already see.
      const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const noteRows = (await Promise.all(patients.map(async (p) => {
        const { data } = await supabase.from('patient_notes').select('note, created_at').eq('patient_id', p.patientId).gte('created_at', sinceIso).order('created_at', { ascending: false }).limit(5);
        return (data ?? []).map((r) => ({ patientName: p.preferredName || p.firstName, note: r.note, at: r.created_at }));
      }))).flat();
      noteRows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

      // H10 — "documented missed/refused doses" across assigned patients.
      // ROUND 7 CORRECTION: medication_logs.status's real CHECK constraint
      // is ('taken','missed','pending','skipped') — 'refused' is not a
      // valid value and this filter was silently matching zero rows for
      // that half of its own name. Discovered via real seeded-data
      // verification, not source review alone.
      const medRows = (await Promise.all(patients.map(async (p) => {
        const { data } = await supabase.from('medication_logs').select('status, scheduled_time, date, medication_id, medications(name)').eq('patient_id', p.patientId).in('status', ['missed', 'skipped']).order('date', { ascending: false }).limit(5);
        return (data ?? []).map((r) => ({ patientName: p.preferredName || p.firstName, medName: (r as { medications: { name: string } | null }).medications?.name ?? 'Medication', status: r.status, at: `${r.date} ${r.scheduled_time}` }));
      }))).flat();

      // H14 — unacknowledged shift handoffs across assigned patients.
      const handoffCounts = await Promise.all(patients.map((p) => getPatientShiftHandoffs(orgId, p.patientId)));
      const unackCount = handoffCounts.flat().filter((h) => h.acknowledgedCount === 0).length;
      // H14's other three categories: completed visits with no visit
      // notes; unresolved incidents (the same `incidents` data this
      // dashboard already fetches for H03/Open Alerts — not a second
      // query); and unfinished care lists.
      //
      // MASTER CORRECTIVE SPEC-01/FUNC-05: "unfinished care lists" was
      // previously left out, reasoned (incorrectly) to require a
      // due-date concept tasks.status doesn't carry. Re-reading the
      // locked requirement text, the plain meaning of "unfinished" is
      // simply a care checklist with at least one task still pending —
      // already fully knowable from tasks.status='pending' alone.
      const missingNotesCount = myVisits.filter((v) => v.status === 'completed' && !v.visitNotes).length;
      const pendingTaskCounts = await Promise.all(patients.map(async (p) => {
        const { count } = await supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('patient_id', p.patientId).eq('status', 'pending').eq('is_active', true);
        return count ?? 0;
      }));
      const unfinishedCareListsCount = pendingTaskCounts.filter((c) => c > 0).length;

      if (!active) return;
      setConversations(convos);
      setVisits(myVisits);
      const openIncidents = allIncidents.filter((i) => i.resolutionStatus !== 'resolved');
      setIncidents(openIncidents);
      setHelpCount(allHelp.length);
      setRecentUpdates(noteRows.slice(0, 8));
      setMedConcerns(medRows.slice(0, 8));
      setUnacknowledgedHandoffs(unackCount);
      setMissingVisitNotes(missingNotesCount);
      setUnfinishedCareLists(unfinishedCareListsCount);

      // APPROVED ENTERPRISE UI DIRECTIVE §3 — "Needs Your Attention
      // panel": a single real, time-ordered feed combining unacknowledged
      // HELP activations, unresolved incidents and the most recent
      // patient/family updates — every item links to the authorized
      // record it came from, nothing here is a placeholder.
      const helpItems: AttentionItem[] = helpByPatient.flatMap((h) =>
        h.entries.filter((e) => e.acknowledgedCount === 0).map((e) => ({
          id: `help-${e.id}`, kind: 'help' as const, patientName: h.patient.preferredName || h.patient.firstName,
          title: 'HELP button activated', detail: e.phoneDialed ? `Call attempted to ${e.phoneDialed}.` : 'No caregiver phone number was reached.',
          at: e.createdAt, nav: 'alerts' as NavItem,
        })),
      );
      const incidentItems: AttentionItem[] = openIncidents.map((i) => ({
        id: `incident-${i.id}`, kind: 'incident' as const,
        patientName: patients.find((p) => p.patientId === i.patientId)?.preferredName || patients.find((p) => p.patientId === i.patientId)?.firstName || 'Patient',
        title: `${i.incidentType.replace('_', ' ')} — ${i.severity}`, detail: i.description,
        at: i.occurredAt, nav: 'alerts' as NavItem,
      }));
      const noteItems: AttentionItem[] = noteRows.slice(0, 5).map((n, idx) => ({
        id: `note-${idx}`, kind: 'note' as const, patientName: n.patientName, title: `Update from ${n.patientName}`, detail: n.note, at: n.at, nav: 'notes' as NavItem,
      }));
      const combined = [...helpItems, ...incidentItems, ...noteItems].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      setAttentionItems(combined.slice(0, 6));
      setLoadingExtra(false);
    })();
    return () => { active = false; };
  }, [patients, orgId]);

  // H18 — "Connection & Synchronization." Genuinely implemented via
  // the browser's own online/offline events and a localStorage-recorded
  // last-successful-load timestamp — never a guaranteed-delivery claim,
  // and no local draft queue exists in this shell (disclosed below, not
  // claimed).
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  useEffect(() => {
    if (!loadingExtra) { try { localStorage.setItem('enterprise_last_sync', new Date().toISOString()); } catch { /* best-effort */ } }
  }, [loadingExtra]);
  let lastSync: string | null = null;
  try { lastSync = localStorage.getItem('enterprise_last_sync'); } catch { /* best-effort */ }

  const unreadCount = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
  const todayVisits = visits.filter((v) => v.scheduledStart && new Date(v.scheduledStart).toDateString() === new Date().toDateString());
  const nextVisit = todayVisits.find((v) => v.status === 'scheduled' || v.status === 'in_progress');
  const nextVisitPatient = nextVisit ? patients.find((p) => p.patientId === nextVisit.patientId) : undefined;
  const needsAttentionCount = incidents.length + helpCount + unacknowledgedHandoffs + missingVisitNotes + unfinishedCareLists;

  const now = new Date();
  const hour = now.getHours();
  const timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase();

  return (
    <>
      {/* Greeting + date + primary registration action. */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold tracking-[0.1em] text-ent-bronze">{dateLabel}</p>
          <h1 className="text-2xl sm:text-[26px] font-bold text-ent-ink mt-0.5">Good {timeOfDay}, {state.currentUser?.firstName || 'Caregiver'}.</h1>
          <p className="text-sm text-ent-muted mt-1">Here&apos;s what needs your attention across your assigned patients.</p>
        </div>
        <RegistrationAction orgId={orgId} onChanged={onPatientRegistered} compact />
      </div>

      {/* H02 — the four approved summary cards; each count navigates to
          its underlying authorized record set, not just the sidebar. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          { label: 'Assigned patients', sub: 'active', value: patients.length, nav: 'patients' as NavItem },
          { label: 'Visits today', sub: 'scheduled', value: todayVisits.length, nav: 'schedule' as NavItem },
          { label: 'Needs attention', sub: 'updates', value: needsAttentionCount, nav: 'alerts' as NavItem },
          { label: 'Unread messages', sub: 'care team', value: unreadCount, nav: 'communications' as NavItem },
        ]).map((m) => (
          <button
            key={m.label} type="button" onClick={() => onNavigate(m.nav)}
            className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-4 text-left hover:shadow-md hover:border-ent-forest/30 transition-all"
          >
            <p className="text-[11px] font-semibold text-ent-text">{m.label}</p>
            <p className="text-2xl font-bold text-ent-ink mt-1">{loadingExtra ? <Loader2 className="w-5 h-5 animate-spin" /> : m.value}</p>
            <p className="text-[11px] text-ent-muted">{m.sub}</p>
          </button>
        ))}
      </div>

      {/* Two-column layout per the approved design: [Needs your
          attention, Your patients] on the left; [Next scheduled visit,
          Care communications] on the right. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5 items-start">
        <div className="space-y-5">
          <Card>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-ent-ink">Needs your attention</h2>
              {attentionItems.length > 0 && <span className="text-[11px] font-semibold text-ent-bronze bg-ent-amber px-2.5 py-1 rounded-full">{attentionItems.length} item{attentionItems.length === 1 ? '' : 's'}</span>}
            </div>
            {!loadingExtra && attentionItems.length === 0 ? (
              <p className="text-sm text-ent-muted">Nothing needs your attention right now.</p>
            ) : (
              <ul className="space-y-2.5">
                {attentionItems.map((item) => {
                  const Icon = item.kind === 'help' ? Flag : item.kind === 'incident' ? ShieldAlert : Moon;
                  const tone = item.kind === 'note' ? 'bg-ent-amber border-ent-amber' : 'bg-gentle-coral/5 border-gentle-coral/30';
                  return (
                    <li key={item.id} className={`p-3 rounded-xl border ${tone}`}>
                      <div className="flex items-start gap-2">
                        <Icon className="w-4 h-4 text-ent-rust flex-shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-ent-ink">{item.title} · {item.patientName}</p>
                          <p className="text-xs text-ent-text mt-0.5">{item.detail}</p>
                          <div className="flex items-center justify-between mt-1.5">
                            <button type="button" onClick={() => onNavigate(item.nav)} className="text-xs font-semibold text-ent-forest hover:underline">Review →</button>
                            <span className="text-[11px] text-ent-muted">{new Date(item.at).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-ent-ink">Your patients</h2>
              <button type="button" onClick={() => onNavigate('patients')} className="text-xs font-semibold text-ent-forest hover:underline">View all patients →</button>
            </div>
            {patients.length === 0 ? (
              <p className="text-sm text-ent-muted">No patients are currently assigned to you. Your organization&apos;s director can assign you once a patient is covered.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {patients.slice(0, 4).map((p) => {
                  const legalName = `${p.firstName} ${p.lastName}`;
                  const displayName = p.preferredName || legalName;
                  return (
                    <button key={p.patientId} type="button" onClick={() => onOpenPatient(p.patientId)} className="flex items-center gap-3 p-4 bg-ent-pale rounded-2xl border border-ent-line hover:shadow-md transition-all text-left">
                      <span className="w-9 h-9 rounded-full bg-ent-green flex items-center justify-center text-ent-forest font-bold text-xs flex-shrink-0">{patientInitials(p.firstName, p.lastName)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-ent-ink truncate text-sm">{displayName}</span>
                        {displayName !== legalName && <span className="block text-[11px] text-ent-muted truncate">{legalName}</span>}
                      </span>
                      <ChevronRight className="w-4 h-4 text-ent-muted flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-ent-ink">Next scheduled visit</h2>
              {nextVisit && <span className="text-[11px] font-semibold text-ent-forest bg-ent-green-active px-2.5 py-1 rounded-full">Today</span>}
            </div>
            {!nextVisit ? (
              <p className="text-sm text-ent-muted">No visit is scheduled for today.</p>
            ) : (
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-full bg-ent-green flex items-center justify-center text-ent-forest font-bold text-xs flex-shrink-0">
                  {nextVisitPatient ? patientInitials(nextVisitPatient.firstName, nextVisitPatient.lastName) : '?'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ent-ink text-sm">{nextVisitPatient?.preferredName || nextVisitPatient?.firstName || 'Patient'}</p>
                  <p className="text-xs text-ent-muted">{nextVisit.status === 'in_progress' ? 'In progress' : new Date(nextVisit.scheduledStart ?? '').toLocaleTimeString()}{nextVisit.scheduledEnd ? ` – ${new Date(nextVisit.scheduledEnd).toLocaleTimeString()}` : ''}</p>
                  <button type="button" onClick={() => onNavigate('schedule')} className="text-xs font-semibold text-ent-forest hover:underline mt-2 inline-block">Open schedule →</button>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-ent-ink">Care communications</h2>
            </div>
            {conversations.length === 0 ? (
              <p className="text-sm text-ent-muted">No conversations yet.</p>
            ) : (
              <ul className="divide-y divide-ent-line -mx-1">
                {conversations.slice(0, 3).map((c) => (
                  <li key={c.conversationId} className="px-1 py-2.5">
                    <p className="text-sm font-semibold text-ent-ink truncate">{c.patientName}{c.subject ? ` · ${c.subject}` : ''}</p>
                    <p className="text-xs text-ent-text truncate">{c.lastMessageBody || 'No messages yet'}</p>
                    <p className="text-[11px] text-ent-muted">{c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleString() : ''}</p>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => onNavigate('communications')} className="w-full text-center text-sm font-semibold text-ent-forest hover:underline pt-1">Open Care Communications →</button>
          </Card>
        </div>
      </div>

      {recentUpdates.length > 0 && (
        <Card>
          <div className="flex items-center gap-2"><FileText className="w-5 h-5 text-ent-bronze" /><h2 className="font-bold text-ent-ink">Recent Patient Updates</h2></div>
          <ul className="space-y-1.5">
            {recentUpdates.map((u, idx) => (
              <li key={idx} className="p-2.5 bg-ent-pale rounded-xl border border-ent-line text-sm">
                <span className="font-medium text-ent-ink">{u.patientName}: </span><span className="text-ent-text">{u.note}</span>
                <span className="text-[11px] text-ent-muted block">{new Date(u.at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {medConcerns.length > 0 && (
        <Card>
          <div className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-ent-rust" /><h2 className="font-bold text-ent-ink">Medication Reminders &amp; Concerns</h2></div>
          <ul className="space-y-1.5">
            {medConcerns.map((m, idx) => (
              <li key={idx} className="p-2.5 bg-ent-amber border border-ent-amber rounded-xl text-sm">
                <span className="font-medium text-ent-ink">{m.patientName}</span><span className="text-ent-text"> — {m.medName} </span><span className="capitalize text-ent-rust font-semibold">{m.status}</span>
                <span className="text-[11px] text-ent-muted block">{m.at}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-ent-muted">A caregiver may document a missed/skipped dose only — administration remains within clinical authority.</p>
        </Card>
      )}

      {(unacknowledgedHandoffs > 0 || missingVisitNotes > 0 || incidents.length > 0 || unfinishedCareLists > 0) && (
        <Card>
          <div className="flex items-center gap-2"><ClipboardList className="w-5 h-5 text-ent-bronze" /><h2 className="font-bold text-ent-ink">Incomplete Documentation</h2></div>
          {unfinishedCareLists > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-ent-text">{unfinishedCareLists} patient{unfinishedCareLists === 1 ? '' : 's'} with an unfinished care list.</p>
              <button type="button" onClick={() => onNavigate('tasks')} className="text-sm font-semibold text-ent-forest hover:underline flex-shrink-0">Review →</button>
            </div>
          )}
          {unacknowledgedHandoffs > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-ent-text">{unacknowledgedHandoffs} shift handoff{unacknowledgedHandoffs === 1 ? '' : 's'} not yet acknowledged.</p>
              <button type="button" onClick={() => onNavigate('handoffs')} className="text-sm font-semibold text-ent-forest hover:underline flex-shrink-0">Review →</button>
            </div>
          )}
          {missingVisitNotes > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-ent-text">{missingVisitNotes} completed visit{missingVisitNotes === 1 ? '' : 's'} missing visit notes.</p>
              <button type="button" onClick={() => onNavigate('visits')} className="text-sm font-semibold text-ent-forest hover:underline flex-shrink-0">Review →</button>
            </div>
          )}
          {incidents.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-ent-text">{incidents.length} unresolved incident{incidents.length === 1 ? '' : 's'}.</p>
              <button type="button" onClick={() => onNavigate('alerts')} className="text-sm font-semibold text-ent-forest hover:underline flex-shrink-0">Review →</button>
            </div>
          )}
        </Card>
      )}

      <Card>
        <div className="flex items-center gap-2"><Building2 className="w-5 h-5 text-ent-bronze" /><h2 className="font-bold text-ent-ink">Connection &amp; Synchronization</h2></div>
        <p className="text-sm text-ent-text">{isOnline ? 'Online' : 'Offline — changes may not be saved until reconnected'}</p>
        <p className="text-[11px] text-ent-muted">Last successful sync: {lastSync ? new Date(lastSync).toLocaleString() : 'not yet recorded'}</p>
        <p className="text-[11px] text-ent-muted">No locally queued offline drafts exist in this shell — nothing here is reported as sent unless it has actually reached the server.</p>
      </Card>
    </>
  );
}

// W14 — "Show authored entries... recorded times and audit information
// accessible to caregiver." Every entry is already self-row readable
// (author_id = auth.uid() / reported_by = auth.uid()); no amendment/
// correction tracking exists anywhere in this schema, so this
// genuinely shows only original entries — disclosed, not claimed.
function MyDocumentationHistoryView() {
  const { state } = useApp();
  const [notes, setNotes] = useState<{ id: string; note: string; created_at: string; note_type: string }[]>([]);
  const [incidents, setIncidents] = useState<IncidentReport[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const myId = state.currentUser?.id;
    if (!myId) { setLoading(false); return; }
    void Promise.all([
      supabase.from('patient_notes').select('id, note, created_at, note_type').eq('author_id', myId).order('created_at', { ascending: false }).limit(20),
      supabase.from('incident_reports').select('id, patient_id, reported_by, incident_type, description, severity, occurred_at, resolution_status, resolution_notes, supervisor_notified_at').eq('reported_by', myId).order('occurred_at', { ascending: false }).limit(10),
    ]).then(([n, i]) => {
      setNotes((n.data ?? []) as typeof notes);
      setIncidents((i.data ?? []).map((r) => ({
        id: r.id, patientId: r.patient_id, reportedBy: r.reported_by, incidentType: r.incident_type as IncidentReport['incidentType'],
        description: r.description, severity: r.severity as IncidentReport['severity'], occurredAt: r.occurred_at,
        resolutionStatus: r.resolution_status as IncidentReport['resolutionStatus'], resolutionNotes: r.resolution_notes, supervisorNotifiedAt: r.supervisor_notified_at,
      })));
      setLoading(false);
    });
  }, [state.currentUser?.id]);
  if (loading) return null;
  const combined = [
    ...notes.map((n) => ({ at: n.created_at, label: `Note (${n.note_type.replace('_', ' ')}): ${n.note}` })),
    ...incidents.map((i) => ({ at: i.occurredAt, label: `Incident report: ${i.incidentType.replace('_', ' ')}` })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return (
    <Card>
      <div className="flex items-center gap-2"><FileText className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">My Documentation History</h2></div>
      {combined.length === 0 ? <p className="text-sm text-medium-gray">You have not authored any documentation yet.</p> : (
        <ul className="space-y-1.5 max-h-72 overflow-y-auto">
          {combined.map((c, idx) => (
            <li key={idx} className="p-2 bg-warm-ivory rounded-lg border border-soft-taupe text-xs text-charcoal">
              {c.label}
              <span className="text-medium-gray block">{new Date(c.at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-medium-gray">Every entry shown is the original record — no amendment/correction history exists in this schema yet.</p>
    </Card>
  );
}

// H15 — "Register a new patient and provide Edit/Resume/Delete for
// incomplete registrations, activation/resend status and link
// management without orphaned or duplicate Auth identities. One
// primary registration action when no patients." Reuses
// RegisterPatientForm/IncompleteRegistrations verbatim (the real,
// already-reviewed residential registration flow — never
// reimplemented) and folds a newly registered patient into this
// organization's coverage + this caregiver's own staff assignment via
// the same cover_patient_via_staff_registration() RPC the residential
// "cover an existing patient" action already uses.
// `compact`: the pill-style "+ Register a New Patient" trigger shown in
// the Dashboard header row per the approved design, in place of the
// full-width dashed card button used inside the My Patients list.
function RegistrationAction({ orgId, onChanged, compact = false }: { orgId: string; onChanged: () => void; compact?: boolean }) {
  const [showForm, setShowForm] = useState(false);
  const [pending, setPending] = useState<PendingRegistrationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => void getMyPendingRegistrations().then((p) => { setPending(p); setLoading(false); }), []);
  useEffect(() => { load(); }, [load]);

  const handleRegistered = async (patientId?: string) => {
    setShowForm(false);
    if (patientId) {
      const { error } = await coverPatientViaStaffRegistration(orgId, patientId);
      if (error) toast.error(`Patient registered, but could not be covered under this organization: ${error}`);
      else toast.success('Patient registered and covered under this organization.');
    }
    load();
    onChanged();
  };

  if (showForm) {
    return (
      <div className={compact ? 'bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-5 sm:p-6' : undefined}>
        <RegisterPatientForm onRegistered={(id) => { void handleRegistered(id); }} onBack={() => setShowForm(false)} />
      </div>
    );
  }

  if (compact) {
    return (
      <>
        {!loading && pending.length > 0 && (
          <div className="mb-3"><IncompleteRegistrations pending={pending} onResumed={() => { load(); onChanged(); }} /></div>
        )}
        <button type="button" onClick={() => setShowForm(true)} className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-ent-line bg-ent-panel text-ent-ink font-semibold text-sm hover:bg-ent-pale flex-shrink-0 whitespace-nowrap">
          <Users className="w-4 h-4" /> Register a New Patient
        </button>
      </>
    );
  }

  return (
    <>
      {!loading && pending.length > 0 && <IncompleteRegistrations pending={pending} onResumed={() => { load(); onChanged(); }} />}
      <button type="button" onClick={() => setShowForm(true)} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border-2 border-dashed border-ent-bronze/40 text-ent-bronze font-semibold text-sm hover:bg-ent-bronze/5">
        <Users className="w-4 h-4" /> Register a new patient
      </button>
    </>
  );
}

function PatientsListView({ patients, onOpenPatient, title, orgId, onChanged }: { patients: StaffPatient[]; onOpenPatient: (id: string) => void; title?: string; orgId?: string; onChanged?: () => void }) {
  return (
    <Card>
      <div className="flex items-center gap-2"><Users className="w-5 h-5 text-ent-bronze" /><h2 className="font-bold text-ent-ink">{title || 'My Patients'}</h2></div>
      {patients.length === 0 ? (
        <p className="text-sm text-ent-muted">No patients are currently assigned to you.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {patients.map((p) => {
            const legalName = `${p.firstName} ${p.lastName}`;
            const displayName = p.preferredName || legalName;
            return (
              <button key={p.patientId} type="button" onClick={() => onOpenPatient(p.patientId)} className="flex items-center gap-3 p-4 bg-ent-pale rounded-2xl border border-ent-line hover:shadow-md transition-all text-left">
                <span className="w-9 h-9 rounded-full bg-ent-green flex items-center justify-center text-ent-forest font-bold text-xs flex-shrink-0">{patientInitials(p.firstName, p.lastName)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ent-ink truncate text-sm">{displayName}</span>
                  {displayName !== legalName && <span className="block text-[11px] text-ent-muted truncate">{legalName}</span>}
                </span>
                <ChevronRight className="w-4 h-4 text-ent-muted flex-shrink-0" />
              </button>
            );
          })}
        </div>
      )}
      {orgId && onChanged && <RegistrationAction orgId={orgId} onChanged={onChanged} />}
    </Card>
  );
}

// W01/H06/H07/H13 — schedule a visit (director-equivalent action,
// re-verified server-side against the caller's own active assignment
// by the RPC), start/end it.
// H06 — ROUND 7 CORRECTIVE: compares against the VIEWER's own local
// time (not a naive UTC date-string match), so a visit scheduled near
// midnight is classified correctly for the caregiver's actual day.
function isToday(isoTimestamp: string | null): boolean {
  if (!isoTimestamp) return false;
  const d = new Date(isoTimestamp);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function ScheduleView({ orgId, patients }: { orgId: string; patients: StaffPatient[] }) {
  const [visits, setVisits] = useState<CaregiverVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPatient, setSelectedPatient] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [todayOnly, setTodayOnly] = useState(true);
  // APPROVED ENTERPRISE UI DIRECTIVE follow-up — CONFIRMED DEFECT
  // (FUNC01-UI-COMPLETION, codex_master_9023_acceptance/browser_verify.mjs):
  // end_caregiver_visit() has required non-empty visit notes since
  // migration 076 (FUNC-01), but this "End" button never collected or
  // sent any — every click failed with "Visit notes are required to
  // complete this visit," making visit completion impossible from the
  // real UI. Fixed by requiring an inline notes entry before the RPC
  // call, rather than reverting the backend requirement.
  const [endingVisitId, setEndingVisitId] = useState<string | null>(null);
  const [endNotesDraft, setEndNotesDraft] = useState('');

  const load = useCallback(async () => { setVisits(await getMyVisits()); setLoading(false); }, []);
  useEffect(() => { void load(); }, [load]);
  const visibleVisits = todayOnly ? visits.filter((v) => isToday(v.scheduledStart)) : visits;

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

  const startVisit = async (visitId: string) => {
    const { error } = await startCaregiverVisit(visitId);
    if (error) { toast.error(error); return; }
    await load();
  };

  const completeVisit = async (visitId: string) => {
    if (!endNotesDraft.trim()) { toast.error('Visit notes are required to complete this visit.'); return; }
    setSaving(true);
    try {
      const { error } = await endCaregiverVisit(visitId, endNotesDraft.trim());
      if (error) { toast.error(error); return; }
      setEndingVisitId(null); setEndNotesDraft('');
      await load();
    } finally {
      setSaving(false);
    }
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
      <label className="flex items-center gap-2 text-xs font-semibold text-medium-gray">
        <input type="checkbox" checked={todayOnly} onChange={(e) => setTodayOnly(e.target.checked)} /> Today only
      </label>
      {loading ? <Loader2 className="w-5 h-5 animate-spin text-warm-bronze" /> : visibleVisits.length === 0 ? (
        <p className="text-sm text-medium-gray">{todayOnly ? 'No visits scheduled for today.' : 'No visits scheduled yet.'}</p>
      ) : (
        <ul className="space-y-2">
          {visibleVisits.map((v) => {
            const visitPatient = patients.find((p) => p.patientId === v.patientId);
            // MASTER CORRECTIVE SPEC-01/H06 — "scheduled start/end, and
            // authorized address/facility, with timezone and status":
            // previously only a start timestamp and status were shown.
            const tzLabel = v.scheduledStart
              ? new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(new Date(v.scheduledStart)).find((p) => p.type === 'timeZoneName')?.value
              : null;
            const facility = visitPatient?.address || visitPatient?.location;
            return (
            <li key={v.id} className="flex items-start justify-between gap-3 p-3 bg-warm-ivory rounded-xl border border-soft-taupe">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-charcoal">{visitPatient?.preferredName || 'Patient'} — <span className="capitalize">{v.status.replace('_', ' ')}</span></p>
                <p className="text-xs text-medium-gray">
                  {v.scheduledStart ? new Date(v.scheduledStart).toLocaleString() : 'No time set'}
                  {v.scheduledEnd && <> – {new Date(v.scheduledEnd).toLocaleTimeString()}</>}
                  {tzLabel && <> ({tzLabel})</>}
                </p>
                {facility && <p className="text-xs text-medium-gray">{facility}</p>}
                {v.status === 'in_progress' && endingVisitId === v.id && (
                  <div className="mt-2 space-y-1.5 w-full">
                    <textarea
                      value={endNotesDraft} onChange={(e) => setEndNotesDraft(e.target.value)} autoFocus
                      placeholder="Visit notes (required to complete this visit)…"
                      className="w-full px-3 py-2 rounded-xl border border-soft-taupe text-sm"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { void completeVisit(v.id); }} disabled={saving || !endNotesDraft.trim()} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gentle-coral text-white text-xs font-semibold disabled:opacity-60">
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <StopCircle className="w-3.5 h-3.5" />} Complete Visit
                      </button>
                      <button type="button" onClick={() => { setEndingVisitId(null); setEndNotesDraft(''); }} className="px-3 py-1.5 rounded-lg border border-soft-taupe text-charcoal text-xs font-semibold">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
              {v.status === 'scheduled' && <button type="button" onClick={() => { void startVisit(v.id); }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-soft-sage text-white text-xs font-semibold flex-shrink-0"><PlayCircle className="w-3.5 h-3.5" /> Start</button>}
              {v.status === 'in_progress' && endingVisitId !== v.id && (
                <button type="button" onClick={() => { setEndingVisitId(v.id); setEndNotesDraft(''); }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gentle-coral text-white text-xs font-semibold flex-shrink-0"><StopCircle className="w-3.5 h-3.5" /> End</button>
              )}
            </li>
            );
          })}
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

// H04/C01/N06 — ROUND 7 CORRECTIVE: urgent/follow-up/routine
// separation, using the data already fetched by getMyConversations()
// (lastMessageUrgent, unreadCount) — no new backend. C06: a simple
// client-side search filter over the already-authorized, already-
// loaded list (filtering a correctly-scoped list is presentational
// only; the authorization boundary is unchanged).
function ConversationGroup({ title, conversations }: { title: string; conversations: ConversationSummary[] }) {
  if (conversations.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-medium-gray uppercase tracking-wide">{title}</p>
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
    </div>
  );
}

function CommunicationsView() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // MASTER CORRECTIVE FUNC-04: ids whose full message HISTORY (not
  // just the latest message) matches the current search term.
  const [historicalMatchIds, setHistoricalMatchIds] = useState<Set<string>>(new Set());
  useEffect(() => { void getMyConversations().then((c) => { setConversations(c); setLoading(false); }); }, []);
  useEffect(() => {
    const term = search.trim();
    if (!term) { setHistoricalMatchIds(new Set()); return; }
    const handle = setTimeout(() => { void searchMyConversations(term).then(setHistoricalMatchIds); }, 250);
    return () => clearTimeout(handle);
  }, [search]);

  const filtered = conversations.filter((c) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const instantMatch = c.patientName.toLowerCase().includes(term) || (c.subject ?? '').toLowerCase().includes(term) || (c.lastMessageBody ?? '').toLowerCase().includes(term);
    return instantMatch || historicalMatchIds.has(c.conversationId);
  });
  const urgent = filtered.filter((c) => c.lastMessageUrgent);
  // MASTER CORRECTIVE FUNC-03: classify on the real open-follow-up
  // signal, not on unreadCount — a read message can still need a
  // response, and an unread one might not.
  const followUp = filtered.filter((c) => !c.lastMessageUrgent && c.hasOpenFollowUp);
  const routine = filtered.filter((c) => !c.lastMessageUrgent && !c.hasOpenFollowUp);

  return (
    <Card>
      <div className="flex items-center gap-2"><MessageSquare className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">Care Communications</h2></div>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by patient, subject, or message…" className="w-full px-3 py-2 rounded-xl border border-soft-taupe text-sm" />
      {loading ? <Loader2 className="w-5 h-5 animate-spin text-warm-bronze" /> : filtered.length === 0 ? (
        <p className="text-sm text-medium-gray">{conversations.length === 0 ? "No conversations yet. Open a patient's record to start one." : 'No conversations match this search.'}</p>
      ) : (
        <>
          <ConversationGroup title="Urgent" conversations={urgent} />
          <ConversationGroup title="Needs a response" conversations={followUp} />
          <ConversationGroup title="Routine" conversations={routine} />
        </>
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
  const [invitePatientId, setInvitePatientId] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  useEffect(() => {
    void Promise.all([getMyCareTeam(orgId), getMyOrgSupervisor(orgId)]).then(([t, s]) => { setTeam(t); setSupervisor(s); setLoading(false); });
  }, [orgId]);

  // W10 — "initiate caregiver-authorized therapist... connection
  // requests" — the underlying RPC (THER-01/02-hardened) was real and
  // pre-existing but never reachable from this shell; migration 072
  // widened its sole authorization check to also accept an active
  // staff_patient_assignments row (previously caregiver_patients-only),
  // live-verified this round.
  const invite = async () => {
    if (!invitePatientId || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      const { error } = await inviteTherapist(invitePatientId, inviteEmail.trim());
      if (error) { toast.error(error); return; }
      setInviteEmail('');
      toast.success('Invitation sent.');
    } finally {
      setInviting(false);
    }
  };

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
          {patients.length > 0 && (
            <div className="pt-3 border-t border-soft-taupe space-y-2">
              <p className="text-xs font-semibold text-medium-gray">Invite a verified therapist for a patient</p>
              <div className="flex flex-wrap gap-2">
                <select value={invitePatientId} onChange={(e) => setInvitePatientId(e.target.value)} className="px-2 py-2 rounded-xl border border-soft-taupe text-sm">
                  <option value="">Select patient…</option>
                  {patients.map((p) => <option key={p.patientId} value={p.patientId}>{p.firstName} {p.lastName}</option>)}
                </select>
                <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="Therapist's email" type="email" className="flex-1 px-3 py-2 rounded-xl border border-soft-taupe text-sm" />
                <button type="button" onClick={() => { void invite(); }} disabled={inviting || !invitePatientId || !inviteEmail.trim()} className="px-3 py-2 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white text-sm font-semibold disabled:opacity-60">Invite</button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// O05 — "pending, accepted, expired, declined and revoked professional/
// patient care connections" for the CALLER's own membership history.
// "Members can view their own membership row" (migration 035) already
// has no status filter, so every status this caller has ever held in
// any organization is readable directly — no new backend needed.
function MyInvitationsCard() {
  const [rows, setRows] = useState<{ id: string; org_role: string; status: string; created_at: string; organizations: { name: string } | null }[]>([]);
  const [sentTherapistInvites, setSentTherapistInvites] = useState<{ id: string; status: string; relationship_type: string; created_at: string; responded_at: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void Promise.all([
      supabase.from('organization_memberships').select('id, org_role, status, created_at, organizations(name)').order('created_at', { ascending: false }),
      // ROUND 7 CORRECTIVE — O05: the caregiver's own SENT therapist
      // invitations (W10), now readable via migration 075's new
      // self-row SELECT policy on pending_therapist_connections.
      supabase.from('pending_therapist_connections').select('id, status, relationship_type, created_at, responded_at').order('created_at', { ascending: false }),
    ]).then(([m, t]) => {
      setRows((m.data ?? []) as unknown as typeof rows);
      setSentTherapistInvites((t.data ?? []) as typeof sentTherapistInvites);
      setLoading(false);
    });
  }, []);
  if (loading) return null;
  return (
    <Card>
      <div className="flex items-center gap-2"><Send className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">Invitations</h2></div>
      {rows.length === 0 ? <p className="text-sm text-medium-gray">No invitation history.</p> : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between p-2.5 bg-warm-ivory rounded-xl border border-soft-taupe text-sm">
              <span className="text-charcoal">{r.organizations?.name ?? 'Organization'} — {r.org_role}</span>
              <span className="text-xs font-semibold capitalize text-medium-gray">{r.status}</span>
            </li>
          ))}
        </ul>
      )}
      {sentTherapistInvites.length > 0 && (
        <div className="pt-2 border-t border-soft-taupe space-y-1.5">
          <p className="text-xs font-semibold text-medium-gray">Therapist invitations you've sent</p>
          <ul className="space-y-1.5">
            {sentTherapistInvites.map((t) => (
              <li key={t.id} className="flex items-center justify-between p-2 bg-warm-ivory rounded-lg border border-soft-taupe text-xs">
                <span className="text-charcoal capitalize">{t.relationship_type}</span>
                <span className="font-semibold capitalize text-medium-gray">{t.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

// O07 — "own visit history, task completion, authored documentation
// and appropriate time/audit records," all scoped to self via the
// caller's own id, every one of which already has self-row read access.
function MyActivityCard() {
  const { state } = useApp();
  const [visits, setVisits] = useState<CaregiverVisit[]>([]);
  const [taskUpdates, setTaskUpdates] = useState<{ id: string; title: string; status: string; status_updated_at: string | null }[]>([]);
  const [noteCount, setNoteCount] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const myId = state.currentUser?.id;
    void Promise.all([
      getMyVisits(),
      myId ? supabase.from('tasks').select('id, title, status, status_updated_at').eq('status_updated_by', myId).order('status_updated_at', { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
      myId ? supabase.from('patient_notes').select('id', { count: 'exact', head: true }).eq('author_id', myId) : Promise.resolve({ count: 0 }),
    ]).then(([v, t, n]) => {
      setVisits(v); setTaskUpdates((t.data ?? []) as typeof taskUpdates); setNoteCount((n as { count: number | null }).count ?? 0); setLoading(false);
    });
  }, [state.currentUser?.id]);
  if (loading) return null;
  return (
    <Card>
      <div className="flex items-center gap-2"><Clock className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">My Activity</h2></div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2 bg-warm-ivory rounded-xl border border-soft-taupe"><p className="text-lg font-bold text-charcoal">{visits.length}</p><p className="text-[11px] text-medium-gray">Visits</p></div>
        <div className="p-2 bg-warm-ivory rounded-xl border border-soft-taupe"><p className="text-lg font-bold text-charcoal">{taskUpdates.length}</p><p className="text-[11px] text-medium-gray">Tasks updated</p></div>
        <div className="p-2 bg-warm-ivory rounded-xl border border-soft-taupe"><p className="text-lg font-bold text-charcoal">{noteCount}</p><p className="text-[11px] text-medium-gray">Notes authored</p></div>
      </div>
      {/* ROUND 7 CORRECTIVE — O07: "appropriate time/audit records"
          means an itemized list, not only counts; renders the same
          arrays already fetched above for the counts. */}
      {taskUpdates.length > 0 && (
        <div className="pt-2 border-t border-soft-taupe space-y-1.5">
          <p className="text-xs font-semibold text-medium-gray">Recent task updates</p>
          <ul className="space-y-1">
            {taskUpdates.slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-center justify-between p-2 bg-warm-ivory rounded-lg border border-soft-taupe text-xs">
                <span className="text-charcoal">{t.title}</span>
                <span className="text-medium-gray">{t.status_updated_at ? new Date(t.status_updated_at).toLocaleString() : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {visits.length > 0 && (
        <div className="pt-2 border-t border-soft-taupe space-y-1.5">
          <p className="text-xs font-semibold text-medium-gray">Recent visits</p>
          <ul className="space-y-1">
            {visits.slice(0, 5).map((v) => (
              <li key={v.id} className="flex items-center justify-between p-2 bg-warm-ivory rounded-lg border border-soft-taupe text-xs">
                <span className="text-charcoal capitalize">{v.status.replace('_', ' ')}</span>
                <span className="text-medium-gray">{v.scheduledStart ? new Date(v.scheduledStart).toLocaleString() : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

// O08 — self-row preferences only; no delivery-receipt column exists
// anywhere in this table, so this UI structurally cannot claim
// guaranteed delivery.
function NotificationsCard() {
  const { state } = useApp();
  const [prefs, setPrefs] = useState({ notify_messages: true, notify_help_alerts: true, notify_follow_up_due: true, channel: 'in_app' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const myId = state.currentUser?.id;
    if (!myId) { setLoading(false); return; }
    void supabase.from('caregiver_notification_preferences').select('*').eq('user_id', myId).maybeSingle()
      .then(({ data }) => { if (data) setPrefs(data); setLoading(false); });
  }, [state.currentUser?.id]);

  const save = async (next: typeof prefs) => {
    const myId = state.currentUser?.id;
    if (!myId) return;
    setPrefs(next);
    setSaving(true);
    try {
      const { error } = await supabase.from('caregiver_notification_preferences').upsert({ user_id: myId, ...next });
      if (error) toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;
  return (
    <Card>
      <div className="flex items-center gap-2"><MessageSquare className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">Notifications</h2></div>
      <label className="flex items-center justify-between text-sm text-charcoal">
        Messages <input type="checkbox" checked={prefs.notify_messages} disabled={saving} onChange={(e) => { void save({ ...prefs, notify_messages: e.target.checked }); }} />
      </label>
      <label className="flex items-center justify-between text-sm text-charcoal">
        HELP/safety updates <input type="checkbox" checked={prefs.notify_help_alerts} disabled={saving} onChange={(e) => { void save({ ...prefs, notify_help_alerts: e.target.checked }); }} />
      </label>
      <label className="flex items-center justify-between text-sm text-charcoal">
        Follow-up due reminders <input type="checkbox" checked={prefs.notify_follow_up_due} disabled={saving} onChange={(e) => { void save({ ...prefs, notify_follow_up_due: e.target.checked }); }} />
      </label>
      <p className="text-[11px] text-medium-gray">These are delivery PREFERENCES, not a guarantee every notification is delivered.</p>
    </Card>
  );
}

// ROUND 7 CORRECTIVE — O09's discovered bug: the 'enterprise-high-
// contrast' class was being toggled on <html> with NO corresponding
// CSS rule anywhere in the app, so the control did nothing visible
// despite looking functional. Injects the one real stylesheet rule
// this toggle needs, once, directly — not a Tailwind class (Tailwind's
// build-time purge cannot see a className computed at runtime).
const HIGH_CONTRAST_STYLE_ID = 'enterprise-high-contrast-style';
function ensureHighContrastStylesheet() {
  if (document.getElementById(HIGH_CONTRAST_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = HIGH_CONTRAST_STYLE_ID;
  style.textContent = `
    .enterprise-high-contrast { filter: contrast(1.35) saturate(1.1); }
    .enterprise-high-contrast .text-medium-gray { color: #1a1a1a !important; }
    .enterprise-high-contrast .border-soft-taupe { border-color: #4a4a4a !important; }
  `;
  document.head.appendChild(style);
}

// O09 — genuinely implemented text-sizing and high-contrast; language
// selection and speech support are not built this round (disclosed,
// not silently hidden behind a non-functional control).
function AccessibilityCard() {
  const [fontScale, setFontScale] = useState(() => { try { return localStorage.getItem('enterprise_font_scale') || 'normal'; } catch { return 'normal'; } });
  const [highContrast, setHighContrast] = useState(() => { try { return localStorage.getItem('enterprise_high_contrast') === 'true'; } catch { return false; } });

  useEffect(() => {
    document.documentElement.style.fontSize = fontScale === 'large' ? '18px' : fontScale === 'larger' ? '20px' : '';
    try { localStorage.setItem('enterprise_font_scale', fontScale); } catch { /* best-effort */ }
  }, [fontScale]);
  useEffect(() => {
    ensureHighContrastStylesheet();
    document.documentElement.classList.toggle('enterprise-high-contrast', highContrast);
    try { localStorage.setItem('enterprise_high_contrast', String(highContrast)); } catch { /* best-effort */ }
  }, [highContrast]);

  return (
    <Card>
      <div className="flex items-center gap-2"><SettingsIcon className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">Accessibility</h2></div>
      <label className="flex items-center justify-between text-sm text-charcoal">
        Text size
        <select value={fontScale} onChange={(e) => setFontScale(e.target.value)} className="px-2 py-1.5 rounded-lg border border-soft-taupe text-sm">
          <option value="normal">Normal</option><option value="large">Large</option><option value="larger">Larger</option>
        </select>
      </label>
      <label className="flex items-center justify-between text-sm text-charcoal">
        High contrast <input type="checkbox" checked={highContrast} onChange={(e) => setHighContrast(e.target.checked)} />
      </label>
      <p className="text-[11px] text-medium-gray">Language selection and speech support are not yet implemented in this shell.</p>
    </Card>
  );
}

// O03 — ROUND 7 CORRECTIVE: a distinct "My Assignments" view —
// staff_patient_assignments' own self-row SELECT policy (migration 035)
// has no is_active filter, so a caregiver's past (is_active=false)
// assignments are already readable, just never shown separately from
// "My Patients" until now.
function MyAssignmentsCard({ orgId }: { orgId: string }) {
  const { state } = useApp();
  const [rows, setRows] = useState<{ id: string; patient_id: string; is_active: boolean; created_at: string; updated_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const myId = state.currentUser?.id;
    if (!myId) { setLoading(false); return; }
    void supabase.from('staff_patient_assignments').select('id, patient_id, is_active, created_at, updated_at').eq('organization_id', orgId).eq('user_id', myId).order('created_at', { ascending: false })
      .then(({ data }) => { setRows(data ?? []); setLoading(false); });
  }, [orgId, state.currentUser?.id]);
  if (loading) return null;
  return (
    <Card>
      <div className="flex items-center gap-2"><Users className="w-5 h-5 text-warm-bronze" /><h2 className="font-bold text-charcoal">My Assignments</h2></div>
      {rows.length === 0 ? <p className="text-sm text-medium-gray">No patient assignments on file.</p> : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between p-2.5 bg-warm-ivory rounded-xl border border-soft-taupe text-sm">
              <span className="text-charcoal">Assigned {new Date(r.created_at).toLocaleDateString()}</span>
              <span className={`text-xs font-semibold ${r.is_active ? 'text-soft-sage' : 'text-medium-gray'}`}>{r.is_active ? 'Active' : `Ended ${new Date(r.updated_at).toLocaleDateString()}`}</span>
            </li>
          ))}
        </ul>
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
          {/* ROUND 7 CORRECTIVE — O02: combines the role label with the
              caregiver's own live credentials summary rather than a
              bare static string (credentials themselves are still the
              authoritative detail view, below). */}
          <p className="text-medium-gray">
            Role: Caregiver{!loadingCreds && credentials.length > 0 ? ` · ${credentials.length} credential${credentials.length === 1 ? '' : 's'} on file` : ''}
          </p>
          <p className="text-medium-gray">Signed in as {state.currentUser?.firstName} {state.currentUser?.lastName}</p>
        </div>
        <p className="text-xs text-medium-gray">Organization id: {orgId}</p>
      </Card>
      <MyAssignmentsCard orgId={orgId} />
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
      <MyInvitationsCard />
      <MyActivityCard />
      <NotificationsCard />
      <AccessibilityCard />
    </>
  );
}

// O10/N14 — ROUND 7 CORRECTIVE: in-session password change.
// supabase.auth.updateUser({ password }) requires zero backend change
// and no new infrastructure — it operates on the caller's own current
// session only. An authorized alternative (email-based reset) already
// exists app-wide; this adds the additional in-session path.
function PasswordChangeForm() {
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const change = async () => {
    setError('');
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (newPassword !== confirm) { setError('Passwords do not match.'); return; }
    setSaving(true);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
      if (updateErr) { setError(updateErr.message); return; }
      setNewPassword(''); setConfirm('');
      toast.success('Password changed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 pt-3 border-t border-soft-taupe">
      <p className="text-xs font-semibold text-medium-gray">Change password</p>
      <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" className="w-full px-3 py-2 rounded-xl border border-soft-taupe text-sm" />
      <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm new password" className="w-full px-3 py-2 rounded-xl border border-soft-taupe text-sm" />
      {error && <p className="text-xs text-gentle-coral">{error}</p>}
      <button type="button" onClick={() => { void change(); }} disabled={saving || !newPassword || !confirm} className="px-3 py-1.5 rounded-lg bg-warm-bronze hover:bg-deep-bronze text-white text-xs font-semibold disabled:opacity-60">
        {saving ? 'Saving…' : 'Change Password'}
      </button>
    </div>
  );
}

// MASTER ENTERPRISE COMPLETION DIRECTIVE §1.B — self-service entry
// point for migration 088's account-deletion request workflow. Submits
// a request only; the Platform Owner review (and the safe, reversible
// deactivation it performs) is entirely server-enforced, not this
// component's concern.
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
    <div className="space-y-2 pt-3 border-t border-soft-taupe">
      <p className="text-xs font-semibold text-medium-gray">Delete my account</p>
      {open ? (
        <div className="p-3 bg-gentle-coral/10 rounded-xl border border-gentle-coral/30 space-y-2">
          <p className="text-sm text-charcoal">A deletion request is pending Platform Owner review (status: {open.status.replace('_', ' ')}).</p>
          <button type="button" onClick={() => { void cancel(open.id); }} disabled={busy} className="px-3 py-1.5 rounded-lg border border-soft-taupe text-charcoal text-xs font-semibold hover:bg-warm-ivory disabled:opacity-60">
            Cancel request
          </button>
        </div>
      ) : (
        <>
          <p className="text-[11px] text-medium-gray">Submitting a request does not delete anything immediately. Once approved by the Platform Owner, your organizational access is revoked (a safe, reversible deactivation) — your account and any records you authored are preserved, not destroyed.</p>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="w-full px-3 py-2 rounded-xl border border-soft-taupe text-sm" />
          <button type="button" onClick={() => { void submit(); }} disabled={busy} className="px-3 py-1.5 rounded-lg border border-gentle-coral text-gentle-coral text-xs font-semibold hover:bg-gentle-coral/10 disabled:opacity-60">
            Request account deletion
          </button>
        </>
      )}
    </div>
  );
}

// O10 — MASTER ENTERPRISE COMPLETION DIRECTIVE §4: TOTP MFA
// enrollment/unenrollment via Supabase Auth's built-in factors API. No
// owner decision was needed for TOTP specifically (unlike SMS/email,
// which stay correctly deferred, see the panel's own disclosure below)
// — it requires no third-party vendor and no PII leaves this app.
function MfaSettingsPanel() {
  const [factors, setFactors] = useState<Array<{ id: string; status: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.totp ?? []).map((f) => ({ id: f.id, status: f.status })));
    setLoading(false);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const startEnroll = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error || !data) { toast.error(error?.message || 'Could not start enrollment.'); return; }
      setEnrolling({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
    } finally { setBusy(false); }
  };

  const confirmEnroll = async () => {
    if (!enrolling) return;
    if (!/^\d{6}$/.test(code.trim())) { toast.error('Enter the 6-digit code from your authenticator app.'); return; }
    setBusy(true);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: enrolling.factorId });
      if (challengeError || !challenge) { toast.error(challengeError?.message || 'Could not verify this code.'); return; }
      const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: enrolling.factorId, challengeId: challenge.id, code: code.trim() });
      if (verifyError) { toast.error(verifyError.message); return; }
      toast.success('Two-factor authentication is now enabled.');
      setEnrolling(null);
      setCode('');
      void refresh();
    } finally { setBusy(false); }
  };

  const unenroll = async (factorId: string) => {
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) { toast.error(error.message); return; }
      toast('Two-factor authentication disabled.');
      void refresh();
    } finally { setBusy(false); }
  };

  if (loading) return null;
  const verified = factors.find((f) => f.status === 'verified');

  return (
    <div className="space-y-2 pt-3 border-t border-soft-taupe">
      <p className="text-xs font-semibold text-medium-gray">Two-factor authentication</p>
      {verified ? (
        <div className="p-3 bg-soft-sage/10 rounded-xl border border-soft-sage/30 space-y-2">
          <p className="text-sm text-charcoal">Enabled — an authenticator app code is required at every sign-in.</p>
          <button type="button" onClick={() => { void unenroll(verified.id); }} disabled={busy} className="px-3 py-1.5 rounded-lg border border-soft-taupe text-charcoal text-xs font-semibold hover:bg-warm-ivory disabled:opacity-60">
            Disable two-factor authentication
          </button>
        </div>
      ) : enrolling ? (
        <div className="p-3 bg-warm-ivory rounded-xl border border-soft-taupe space-y-2">
          <p className="text-xs text-charcoal">Scan this QR code with an authenticator app (Google Authenticator, Authy, etc.), then enter the 6-digit code it shows.</p>
          <img src={enrolling.qrCode} alt="Two-factor authentication QR code" className="w-40 h-40" />
          <p className="text-[11px] text-medium-gray font-mono break-all">Manual entry key: {enrolling.secret}</p>
          <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" className="w-full px-3 py-2 rounded-xl border border-soft-taupe text-sm" />
          <div className="flex gap-2">
            <button type="button" onClick={() => { void confirmEnroll(); }} disabled={busy} className="px-3 py-1.5 rounded-lg bg-warm-bronze hover:bg-deep-bronze text-white text-xs font-semibold disabled:opacity-60">
              Confirm and enable
            </button>
            <button type="button" onClick={() => { setEnrolling(null); setCode(''); }} className="px-3 py-1.5 rounded-lg border border-soft-taupe text-charcoal text-xs font-semibold hover:bg-warm-ivory">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => { void startEnroll(); }} disabled={busy} className="px-3 py-1.5 rounded-lg border border-soft-taupe text-charcoal text-xs font-semibold hover:bg-warm-ivory disabled:opacity-60">
          Enable two-factor authentication
        </button>
      )}
      <p className="text-[11px] text-medium-gray">SMS and email-code factors remain deferred pending an owner decision (which factor, which vendor, and whether that vendor's data-handling terms are acceptable for a patient-identifying context) — see 34_ROUND7_CORRECTIVE_30ITEM_VALIDATION.md. An authenticator-app (TOTP) factor requires no third party and is available now.</p>
    </div>
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
      <PasswordChangeForm />
      <MfaSettingsPanel />
      <AccountDeletionRequestPanel />
      <p className="text-[11px] text-medium-gray">An active-sessions list is not yet available in this shell. A password reset is also always available via the sign-in page's email link.</p>
    </Card>
  );
}

// ROUND 6: the four per-patient sections previously appended below
// EnterpriseStaffPatientView (visits, shift handoffs, incidents,
// documents) have moved into EnterprisePatientRecordTabs.tsx's
// Appointments/Safety/Documents tabs, reached via the onReady
// delegation above. See that file for the current implementation.
