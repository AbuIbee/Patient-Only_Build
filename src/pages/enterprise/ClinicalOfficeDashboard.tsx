// FIVE-OFFICE ENTERPRISE PLATFORM — Office C (Medical Professional) and
// Office D (Therapist Professional). One shared, role-parameterized
// component rather than two near-duplicates, following the same
// pattern StaffCaseloadDashboard already established for these two
// roles — now built to the directive's actual per-office requirements
// (§9/§10: ~11-12 real destinations, the approved ent-* visual system)
// instead of StaffCaseloadDashboard's single flat patient list.
//
// CONFIRMED PRE-EXISTING GAP this closes: EnterpriseStaffPatientView.tsx
// itself already documents that its `onReady` delegation to the full
// 11-tab EnterprisePatientRecordTabs (diagnoses, vitals, care plans,
// medications, documents, safety/allergies, appointments, tasks,
// communications) was wired up ONLY for the Enterprise Caregiver office
// — "StaffCaseloadDashboard's existing therapist/medical-professional
// callers omit this and keep the original body" (a much thinner
// medications/mood/notes-only view). Medical and Therapist staff were
// never missing a different product — they were reaching an older,
// narrower view of the SAME already-built patient record. This
// component reaches the same `onReady` → EnterprisePatientRecordTabs
// path the caregiver office uses, with a role-appropriate `initialTab`
// per destination (added as an optional prop to that component).
//
// Authorization is unchanged: EnterpriseStaffPatientView still performs
// its own staff_patient_assignments check before any data renders, and
// RLS (migration 067 + 070) — not this component — is what actually
// grants or denies each table read. Office eligibility (holding an
// active medical_professional/therapist organization_memberships row)
// is resolved by EnterpriseDashboardRouter before this component is
// ever reached, never by a route the user typed.
import { useEffect, useState, useCallback } from 'react';
import { useApp } from '@/store/useApp';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  Stethoscope, Users, Calendar, ClipboardList, ShieldAlert, Pill, Target, FileText,
  MessageSquare, BarChart3, Award, Settings as SettingsIcon, ChevronRight, Loader2,
} from 'lucide-react';
import {
  getMyOrganizations, getMyStaffPatients,
  type MyOrganization, type StaffPatient, type StaffRole,
} from '@/services/organizationService';
import { getMyCredentials, type CaregiverCredential } from '@/services/enterpriseCaregiverWorkToolsService';
import { getMyConversations } from '@/services/communicationsService';
import EnterpriseStaffPatientView from './EnterpriseStaffPatientView';
import EnterprisePatientRecordTabs, { type TabKey } from './EnterprisePatientRecordTabs';
import { EnterpriseOfficeShell, OfficeCard, type OfficeNavItem, type OfficeNavGroup } from './EnterpriseOfficeShell';
import { useOfficeUrlSync } from '../professional/useOfficeUrlSync';

type ClinicalRole = Extract<StaffRole, 'medical_professional' | 'therapist'>;

type ClinicalNavKey =
  | 'dashboard' | 'patients' | 'schedule' | 'assessments' | 'diagnoses' | 'medications'
  | 'careplan' | 'documentation' | 'goals' | 'documents' | 'communication' | 'reports'
  | 'credentials' | 'settings';

const MEDICAL_NAV_ITEMS: OfficeNavItem<ClinicalNavKey>[] = [
  { key: 'dashboard', label: 'Clinical Dashboard', icon: Stethoscope },
  { key: 'patients', label: 'My Patients', icon: Users },
  { key: 'schedule', label: 'Clinical Schedule', icon: Calendar },
  { key: 'assessments', label: 'Assessments', icon: ClipboardList },
  { key: 'diagnoses', label: 'Diagnoses & Allergies', icon: ShieldAlert },
  { key: 'medications', label: 'Medications & Orders', icon: Pill },
  { key: 'careplan', label: 'Care Plan Review', icon: Target },
  { key: 'documentation', label: 'Clinical Documentation', icon: FileText },
  { key: 'communication', label: 'Care Team Communication', icon: MessageSquare },
  { key: 'reports', label: 'Reports & Outcomes', icon: BarChart3 },
  { key: 'credentials', label: 'My Credentials', icon: Award },
  { key: 'settings', label: 'Settings & Account', icon: SettingsIcon },
];
const MEDICAL_NAV_GROUPS: OfficeNavGroup<ClinicalNavKey>[] = [
  { label: 'CLINICAL WORKSPACE', items: ['dashboard', 'patients', 'schedule'] },
  { label: 'PATIENT RECORDS', items: ['assessments', 'diagnoses', 'medications', 'careplan', 'documentation'] },
  { label: 'PROFESSIONAL TOOLS', items: ['communication', 'reports', 'credentials', 'settings'] },
];

const THERAPY_NAV_ITEMS: OfficeNavItem<ClinicalNavKey>[] = [
  { key: 'dashboard', label: 'Therapy Dashboard', icon: Stethoscope },
  { key: 'patients', label: 'My Therapy Patients', icon: Users },
  { key: 'schedule', label: 'Session Schedule', icon: Calendar },
  { key: 'careplan', label: 'Treatment Plans', icon: Target },
  { key: 'documentation', label: 'Therapy Notes', icon: FileText },
  { key: 'goals', label: 'Goals & Progress', icon: ClipboardList },
  { key: 'communication', label: 'Care Team Communication', icon: MessageSquare },
  { key: 'reports', label: 'Reports & Outcomes', icon: BarChart3 },
  { key: 'credentials', label: 'My Credentials', icon: Award },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'settings', label: 'Settings & Account', icon: SettingsIcon },
];
const THERAPY_NAV_GROUPS: OfficeNavGroup<ClinicalNavKey>[] = [
  { label: 'THERAPY WORKSPACE', items: ['dashboard', 'patients', 'schedule'] },
  { label: 'PATIENT RECORDS', items: ['careplan', 'documentation', 'goals', 'documents'] },
  { label: 'PROFESSIONAL TOOLS', items: ['communication', 'reports', 'credentials', 'settings'] },
];

// Which tab EnterprisePatientRecordTabs should open on when a
// destination leads straight into a specific patient's record. Every
// tab named here is a real, already-functional tab in that component —
// not a new page. The full tab bar remains reachable once open, so
// (e.g.) "Diagnoses & Allergies" landing on Safety still leaves
// diagnoses (on Medical) one click away, never hidden.
const INITIAL_TAB: Partial<Record<ClinicalNavKey, TabKey>> = {
  schedule: 'appointments', assessments: 'medical', diagnoses: 'safety', medications: 'medications',
  careplan: 'carePlan', documentation: 'medical', goals: 'medical', documents: 'documents', communication: 'communications',
};

const PATIENT_PICKER_DESTINATIONS: ClinicalNavKey[] = [
  'patients', 'schedule', 'assessments', 'diagnoses', 'medications', 'careplan', 'documentation', 'goals', 'documents',
  // Codex MMA-CODEX-10: 'communication' already had an INITIAL_TAB entry
  // ('communications') but was missing from this array, so the render
  // switch's PATIENT_PICKER_DESTINATIONS.includes(nav) check never
  // matched it and it fell through to `: null` -- a real blank page for
  // both Medical and Therapy staff. EnterprisePatientRecordTabs' own
  // 'communications' tab (CareConversations) already works correctly
  // once reached; this was the one missing wire-up.
  'communication',
];

// basePath defaults to null (no URL sync) so every EXISTING caller
// (/business, the old top-level /Medical and /Therapy) keeps its exact
// established behavior unchanged — only an explicit basePath (passed by
// ProfessionalOfficeResolver.tsx under /Professional/Medical or
// /Professional/Therapy) turns on nested-route URL sync (P1 CORRECTIVE
// ORDER §7).
export default function ClinicalOfficeDashboard({ filterRole, basePath = null }: { filterRole: ClinicalRole; basePath?: string | null }) {
  const { state, dispatch } = useApp();
  const isTherapy = filterRole === 'therapist';
  const navItems = isTherapy ? THERAPY_NAV_ITEMS : MEDICAL_NAV_ITEMS;
  const navGroups = isTherapy ? THERAPY_NAV_GROUPS : MEDICAL_NAV_GROUPS;
  const officeBadge = isTherapy ? 'THERAPY OFFICE' : 'CLINICAL OFFICE';
  const roleLabel = isTherapy ? 'Therapist' : 'Medical Professional';
  const navKeys = navItems.map((n) => n.key) as ClinicalNavKey[];

  const [myOrg, setMyOrg] = useState<MyOrganization | null>(null);
  const [patients, setPatients] = useState<StaffPatient[]>([]);
  const [credentials, setCredentials] = useState<CaregiverCredential[]>([]);
  // CODEX F-18 FIX: get_org_communications_overview() is Director-only
  // (correctly so -- it's an org-wide oversight aggregate). This
  // dashboard is NEVER reached by a director (Medical/Therapist only),
  // so calling it here always raised, the client wrapper swallowed
  // the error into null, and the UI rendered a false "0" for every
  // real user of this dashboard, not merely sometimes. Replaced with
  // the caller's own real conversation data (get_my_conversations(),
  // already scoped to patients they're actually authorized for) --
  // an honest personal metric, not an org-wide one they were never
  // entitled to see.
  const [commsOverview, setCommsOverview] = useState<{ activeConversations: number; unresolvedFollowUps: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [nav, setNav] = useOfficeUrlSync<ClinicalNavKey>(basePath, navKeys, 'dashboard');
  const [openPatient, setOpenPatient] = useState<{ orgId: string | null; patientId: string; tab?: TabKey } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [orgs, allPatients] = await Promise.all([getMyOrganizations(), getMyStaffPatients()]);
      const org = orgs.find((o) => o.orgRole === filterRole) ?? null;
      setMyOrg(org);
      setPatients(allPatients.filter((p) => p.orgRole === filterRole));
      const [creds, myConversations] = await Promise.all([
        getMyCredentials(),
        getMyConversations(),
      ]);
      setCredentials(creds);
      setCommsOverview({
        activeConversations: myConversations.length,
        unresolvedFollowUps: myConversations.filter((c) => c.hasOpenFollowUp).length,
      });
    } finally {
      setLoading(false);
    }
  }, [filterRole]);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    dispatch({ type: 'LOGOUT' });
    toast('You have been logged out');
  };

  const navigate = (key: ClinicalNavKey) => { setOpenPatient(null); setNav(key); };
  const openPatientRecord = (p: StaffPatient, tab?: TabKey) => setOpenPatient({ orgId: p.organizationId, patientId: p.patientId, tab });

  const fullName = state.currentUser?.firstName ? `${state.currentUser.firstName} ${state.currentUser.lastName ?? ''}`.trim() : roleLabel;
  const initials = (state.currentUser?.firstName?.[0] ?? roleLabel[0] ?? '?').toUpperCase();

  return (
    <EnterpriseOfficeShell
      officeBadge={officeBadge} orgLabel={myOrg?.organizationName ?? 'No organization connected'} roleLabel={roleLabel}
      fullName={fullName} initials={initials} navItems={navItems} navGroups={navGroups} activeNav={nav}
      onNavigate={navigate} onLogout={() => { void handleLogout(); }}
    >
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-ent-forest" /></div>
      ) : openPatient ? (
        <EnterpriseStaffPatientView
          organizationId={openPatient.orgId} patientId={openPatient.patientId} staffRole={filterRole}
          onBack={() => setOpenPatient(null)}
          // CODEX F-16 FIX: a direct (residential) Therapist connection
          // has no organization at all -- several of the tabbed view's
          // tabs (care plan scope-concern routing, appointments, shift
          // handoff timeline) are genuinely Enterprise-operational
          // concepts that do not apply to one. Rather than fabricate an
          // organization context for them, a direct connection falls
          // back to this component's own flat view (medications, mood,
          // notes, communication needs, code status) -- real,
          // authorized data, just without the org-scoped tabs.
          onReady={openPatient.orgId ? (patient) => (
            <EnterprisePatientRecordTabs
              patientId={openPatient.patientId} patientHeader={patient} staffRole={filterRole} orgId={openPatient.orgId as string}
              onBack={() => setOpenPatient(null)} initialTab={openPatient.tab}
            />
          ) : undefined}
        />
      ) : nav === 'dashboard' ? (
        <DashboardHome isTherapy={isTherapy} roleLabel={roleLabel} patients={patients} commsOverview={commsOverview} onOpenPatient={(p) => openPatientRecord(p)} />
      ) : PATIENT_PICKER_DESTINATIONS.includes(nav) ? (
        <PatientPicker
          patients={patients}
          title={navItems.find((n) => n.key === nav)?.label ?? 'Select a patient'}
          onOpenPatient={(p) => openPatientRecord(p, INITIAL_TAB[nav])}
        />
      ) : nav === 'credentials' ? (
        <CredentialsView credentials={credentials} />
      ) : nav === 'reports' ? (
        <ReportsView isTherapy={isTherapy} patients={patients} commsOverview={commsOverview} />
      ) : nav === 'settings' ? (
        <SettingsView roleLabel={roleLabel} orgName={myOrg?.organizationName ?? null} onLogout={() => { void handleLogout(); }} />
      ) : null}
    </EnterpriseOfficeShell>
  );
}

function DashboardHome({ isTherapy, roleLabel, patients, commsOverview, onOpenPatient }: {
  isTherapy: boolean; roleLabel: string; patients: StaffPatient[]; commsOverview: { activeConversations: number; unresolvedFollowUps: number } | null;
  onOpenPatient: (p: StaffPatient) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-ent-ink">{isTherapy ? 'Therapy Dashboard' : 'Clinical Dashboard'}</h1>
        <p className="text-sm text-ent-muted mt-0.5">Here&apos;s what needs your attention across your {isTherapy ? 'therapy ' : ''}patients.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <MetricCard label={isTherapy ? 'Therapy patients' : 'Clinical patients'} value={String(patients.length)} sub="active" />
        <MetricCard label="Care team messages" value={String(commsOverview?.activeConversations ?? 0)} sub="active conversations" />
        <MetricCard label="Unresolved follow-ups" value={String(commsOverview?.unresolvedFollowUps ?? 0)} sub="care team" />
      </div>

      <OfficeCard>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-ent-ink">{isTherapy ? 'My Therapy Patients' : 'My Patients'}</h2>
          <span className="text-xs text-ent-muted">{patients.length} assigned</span>
        </div>
        {patients.length === 0 ? (
          <p className="text-sm text-ent-text">
            No patients are currently assigned to you{roleLabel ? ` as a ${roleLabel.toLowerCase()}` : ''}. Your organization&apos;s
            director assigns coverage directly — you&apos;ll see patients here as soon as you&apos;re assigned.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {patients.map((p) => (
              <button
                key={`${p.organizationId}-${p.patientId}`} type="button" onClick={() => onOpenPatient(p)}
                className="flex items-center justify-between gap-2 p-3.5 bg-ent-bg rounded-xl border border-ent-line hover:shadow-sm transition-all text-left"
              >
                <div className="min-w-0">
                  <p className="font-bold text-ent-ink text-sm truncate">{p.preferredName || `${p.firstName} ${p.lastName}`}</p>
                  <p className="text-xs text-ent-muted truncate">{p.organizationName}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-ent-bronze flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </OfficeCard>
    </div>
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

function PatientPicker({ patients, title, onOpenPatient }: { patients: StaffPatient[]; title: string; onOpenPatient: (p: StaffPatient) => void }) {
  return (
    <OfficeCard>
      <div className="flex items-center gap-2"><Users className="w-5 h-5 text-ent-bronze" /><h2 className="font-bold text-ent-ink">{title}</h2></div>
      {patients.length === 0 ? (
        <p className="text-sm text-ent-text">No patients are currently assigned to you. Your organization&apos;s director assigns coverage directly.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {patients.map((p) => (
            <button
              key={`${p.organizationId}-${p.patientId}`} type="button" onClick={() => onOpenPatient(p)}
              className="flex items-center justify-between gap-2 p-3.5 bg-ent-bg rounded-xl border border-ent-line hover:shadow-sm transition-all text-left"
            >
              <div className="min-w-0">
                <p className="font-bold text-ent-ink text-sm truncate">{p.preferredName || `${p.firstName} ${p.lastName}`}</p>
                <p className="text-xs text-ent-muted truncate">{p.organizationName}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-ent-bronze flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </OfficeCard>
  );
}

function CredentialsView({ credentials }: { credentials: CaregiverCredential[] }) {
  return (
    <OfficeCard>
      <div className="flex items-center gap-2"><Award className="w-5 h-5 text-ent-bronze" /><h2 className="font-bold text-ent-ink">My Credentials</h2></div>
      {credentials.length === 0 ? (
        <p className="text-sm text-ent-text">No credentials have been recorded for your account yet. Your organization&apos;s director records credentials on file.</p>
      ) : (
        <ul className="space-y-2">
          {credentials.map((c) => (
            <li key={c.id} className="p-3 bg-ent-bg rounded-xl border border-ent-line flex items-center justify-between">
              <div>
                <p className="font-semibold text-ent-ink text-sm">{c.credentialName}</p>
                <p className="text-xs text-ent-muted">
                  {c.issuedAt ? `Issued ${c.issuedAt}` : 'Issue date on file'}{c.expiresAt ? ` · expires ${c.expiresAt}` : ''}
                </p>
              </div>
              <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${
                c.status === 'active' ? 'bg-ent-green-active text-ent-forest' : c.status === 'expiring_soon' ? 'bg-ent-amber/20 text-ent-amber' : 'bg-ent-rust/15 text-ent-rust'
              }`}>{c.status.replace('_', ' ')}</span>
            </li>
          ))}
        </ul>
      )}
    </OfficeCard>
  );
}

// Real, honest aggregate drawn entirely from data already fetched for
// this office — never a fabricated analytics engine. No due-date or
// outcome-scoring schema exists yet for assessments/sessions, so this
// stays a plain current-state summary rather than inventing trend
// metrics the backend cannot actually support.
function ReportsView({ isTherapy, patients, commsOverview }: { isTherapy: boolean; patients: StaffPatient[]; commsOverview: { activeConversations: number; unresolvedFollowUps: number } | null }) {
  return (
    <OfficeCard>
      <div className="flex items-center gap-2"><BarChart3 className="w-5 h-5 text-ent-bronze" /><h2 className="font-bold text-ent-ink">Reports & Outcomes</h2></div>
      <p className="text-sm text-ent-text">A current-state summary of your {isTherapy ? 'therapy ' : 'clinical '}caseload, drawn from live authorized records.</p>
      <ul className="text-sm text-ent-ink space-y-1.5">
        <li>• {patients.length} {isTherapy ? 'therapy patient' : 'clinical patient'}{patients.length === 1 ? '' : 's'} currently assigned to you</li>
        <li>• {commsOverview?.activeConversations ?? 0} active care-team conversation{commsOverview?.activeConversations === 1 ? '' : 's'}</li>
        <li>• {commsOverview?.unresolvedFollowUps ?? 0} unresolved follow-up{commsOverview?.unresolvedFollowUps === 1 ? '' : 's'} across your patients</li>
      </ul>
      <p className="text-xs text-ent-muted pt-2 border-t border-ent-line">
        Outcome trends and assessment-due tracking are not yet built on the backend — this view will not display estimated or
        invented figures for those until that data exists.
      </p>
    </OfficeCard>
  );
}

function SettingsView({ roleLabel, orgName, onLogout }: { roleLabel: string; orgName: string | null; onLogout: () => void }) {
  const { state } = useApp();
  return (
    <OfficeCard>
      <div className="flex items-center gap-2"><SettingsIcon className="w-5 h-5 text-ent-bronze" /><h2 className="font-bold text-ent-ink">Settings &amp; Account</h2></div>
      <div className="text-sm text-ent-ink space-y-1">
        <p><span className="text-ent-muted">Name:</span> {state.currentUser?.firstName} {state.currentUser?.lastName}</p>
        <p><span className="text-ent-muted">Email:</span> {state.currentUser?.email}</p>
        <p><span className="text-ent-muted">Role:</span> {roleLabel}</p>
        <p><span className="text-ent-muted">Organization:</span> {orgName ?? 'No organization connected'}</p>
      </div>
      <button type="button" onClick={onLogout} className="mt-2 px-4 py-2 rounded-xl bg-ent-bronze hover:opacity-90 text-white text-sm font-semibold">Logout</button>
    </OfficeCard>
  );
}
