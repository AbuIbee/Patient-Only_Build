// ENTERPRISE CONSOLIDATED DELIVERY — Organization Director / Admin
// dashboard. Scoped entirely to organizations where the signed-in user is
// an ACTIVE director (server-verified by every RPC this page calls) —
// "an organization director must have authority within their own
// organization only," never a global admin.
import { useEffect, useState, useCallback } from 'react';
import { useApp } from '@/store/useApp';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  Building2, Users, UserPlus, Trash2, LayoutDashboard, UserCog,
  Loader2, CreditCard, ClipboardList, MessageSquare, Link2, Unlink, CalendarClock,
  ClipboardCheck, ShieldAlert, BarChart3, Settings as SettingsIcon, ChevronRight, CheckCircle2,
} from 'lucide-react';
import {
  getMyOrganizations, getOrgMembers, getOrgLicense, getOrgCoveredPatients,
  orgConfigureLicense, inviteOrgMember, removeOrgMember, createOrganization,
  getOrgStaffPatientAssignments, assignStaffToPatient, unassignStaffFromPatient,
  getOrgCommunicationsOverview,
  type OrgLicense, type OrgRole, type OrgMembershipRow, type OrgPackageType,
  type StaffPatientAssignment, type StaffRole, type OrgCommunicationsOverview,
} from '@/services/organizationService';
import {
  directorApproveApplication, requestApplicationCorrections, rejectApplication,
  getApplicationDocuments, getSignedDocumentUrl,
} from '@/services/professionalApplicationService';
import {
  getOrgVisits, getOrgIncidentReports, getOrgShiftHandoffs, resolveOrgIncidentReport,
  type OrgVisit, type OrgIncidentReport, type OrgShiftHandoff, type IncidentResolutionStatus,
} from '@/services/organizationDirectorOpsService';
import OrganizationBillingPage from './OrganizationBillingPage';
import { EnterpriseOfficeShell, OfficeCard, type OfficeNavItem, type OfficeNavGroup } from './EnterpriseOfficeShell';
import { useOfficeUrlSync } from '../professional/useOfficeUrlSync';

const inputCls = 'w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ent-bronze border-ent-line bg-ent-panel';

// Raw snake_case row shape as RLS returns it directly from
// professional_applications — the Director review UI below reads this
// table directly (RLS already scopes it to is_active_org_director(),
// confirmed by migration 083) rather than going through the
// camelCase-mapping service wrapper, since this view needs the full row.
interface ProfessionalApplicationRow {
  id: string; requested_office: string; status: string; legal_name: string; preferred_name: string | null;
  contact_email: string; contact_phone: string | null; professional_title: string | null; profession_category: string | null;
  application_details: Record<string, unknown>; credential_verification_status: string;
  correction_request: string | null; rejection_reason: string | null; created_at: string;
}

const ROLE_LABELS: Record<OrgRole, string> = {
  director: 'Director',
  caregiver: 'Caregiver',
  therapist: 'Therapist',
  medical_professional: 'Medical Professional',
  billing_admin: 'Billing Administrator',
};

// MASTER ENTERPRISE IDENTITY DIRECTIVE §7.1 — "the applicant must not
// become Director merely because they initiated an organization
// registration." Submitting this form now creates a PENDING
// professional_applications row, not an active organization — the copy
// and post-submit state are honest about that, matching §6.1's "do not
// claim completion... until a Platform Owner approves."
function CreateOrgCard({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [packageType, setPackageType] = useState<'therapist' | 'integrated_care'>('integrated_care');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) { toast.error('Organization name is required.'); return; }
    setLoading(true);
    try {
      const { applicationId, error } = await createOrganization(name, packageType);
      if (error || !applicationId) { toast.error(error || 'Could not submit your organization application.'); return; }
      toast.success('Your Director application has been submitted for review.');
      setSubmitted(true);
      onCreated();
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-6 space-y-3 max-w-md mx-auto text-center">
        <Building2 className="w-8 h-8 text-ent-forest mx-auto" />
        <h2 className="text-lg font-bold text-ent-ink">Application submitted</h2>
        <p className="text-sm text-ent-text">
          Your Director application for &quot;{name}&quot; is now pending Platform Owner review. You can sign back in at any
          time to see its status; your organization is created only once it is approved.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-6 space-y-4 max-w-md mx-auto">
      <div className="flex items-center gap-2">
        <Building2 className="w-5 h-5 text-ent-bronze" />
        <h2 className="text-lg font-bold text-ent-ink">Apply to Start Your Organization</h2>
      </div>
      <p className="text-xs text-ent-muted">
        A Platform Owner reviews and approves every new organization before it is created. Submitting this form does not
        grant Director access by itself.
      </p>
      <div className="space-y-1">
        <label className="text-sm font-medium text-ent-ink">Organization Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Riverside Home Care" className={inputCls} />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-ent-ink">Business Package</label>
        <select value={packageType} onChange={(e) => setPackageType(e.target.value as 'therapist' | 'integrated_care')} className={inputCls}>
          <option value="integrated_care">Enterprise Integrated Care</option>
          <option value="therapist">Enterprise Therapist</option>
        </select>
        <p className="text-xs text-ent-muted">Covered patients always receive the same Full Support experience regardless of package.</p>
      </div>
      <button
        type="button"
        onClick={() => { void handleCreate(); }}
        disabled={loading}
        className="w-full py-3 rounded-xl bg-ent-bronze hover:opacity-90 text-white font-semibold disabled:opacity-60 transition-colors"
      >
        {loading ? 'Submitting…' : 'Submit for Review'}
      </button>
    </div>
  );
}

function LicenseCard({ orgId, license, onUpdated }: { orgId: string; license: OrgLicense | null; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false);
  const [seats, setSeats] = useState(license?.licensedSeats?.toString() ?? '');
  const [capacity, setCapacity] = useState(license?.coveredPatientCapacity?.toString() ?? '');
  const [fee, setFee] = useState(license?.annualLicenseFee?.toString() ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSeats(license?.licensedSeats?.toString() ?? '');
    setCapacity(license?.coveredPatientCapacity?.toString() ?? '');
    setFee(license?.annualLicenseFee?.toString() ?? '');
  }, [license]);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await orgConfigureLicense(
        orgId,
        seats.trim() === '' ? null : Number(seats),
        capacity.trim() === '' ? null : Number(capacity),
        fee.trim() === '' ? null : Number(fee),
      );
      if (error) { toast.error(error); return; }
      toast.success('License configuration updated.');
      setEditing(false);
      onUpdated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-5 sm:p-6 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-ent-bronze" />
          <h2 className="font-bold text-ent-ink">License &amp; Capacity</h2>
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${license?.status === 'active' ? 'text-ent-green bg-ent-green-active' : 'text-amber-700 bg-amber-100'}`}>
          {license?.status ?? 'proposed'}
        </span>
      </div>
      <p className="text-xs text-ent-muted">
        Seats, capacity and fee are proposed, configurable commercial terms — setting them here never activates the license or creates a charge. Only an admin can activate, expire, or cancel a license (a separate, staging-only mechanism for synthetic integration testing); this status also controls whether covered patients actually receive Full Support.
      </p>
      {editing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-ent-ink">Licensed Staff Seats</label>
              <input type="number" min={0} value={seats} onChange={(e) => setSeats(e.target.value)} placeholder="e.g. 5" className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-ent-ink">Covered Patient Capacity</label>
              <input type="number" min={0} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="e.g. 20" className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-ent-ink">Proposed Annual Fee ($)</label>
              <input type="number" min={0} step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="e.g. 999.00" className={inputCls} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => { void save(); }} disabled={saving} className="px-4 py-2 rounded-xl bg-ent-bronze hover:opacity-90 text-white text-sm font-semibold disabled:opacity-60">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="px-4 py-2 rounded-xl border border-ent-line text-ent-ink text-sm font-semibold">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="text-sm text-ent-ink space-y-0.5">
            <p>Seats: <strong>{license?.licensedSeats ?? 'Not configured'}</strong></p>
            <p>Patient capacity: <strong>{license?.coveredPatientCapacity ?? 'Not configured'}</strong></p>
            <p>Proposed annual fee: <strong>{license?.annualLicenseFee != null ? `$${license.annualLicenseFee.toFixed(2)}` : 'Not configured'}</strong></p>
          </div>
          <button type="button" onClick={() => setEditing(true)} className="px-3 py-2 rounded-lg border border-ent-line text-ent-ink text-sm font-semibold hover:bg-ent-pale">
            Configure
          </button>
        </div>
      )}
    </div>
  );
}

function StaffCard({ orgId, members, onChanged }: {
  orgId: string;
  members: (OrgMembershipRow & { firstName: string; lastName: string; email: string })[];
  onChanged: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Exclude<OrgRole, 'director'>>('caregiver');
  const [inviting, setInviting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const invite = async () => {
    if (!email.trim()) { toast.error('An email address is required.'); return; }
    setInviting(true);
    try {
      const { error } = await inviteOrgMember(orgId, email, role);
      if (error) { toast.error(error); return; }
      toast.success(`Invitation sent to ${email}.`);
      setEmail('');
      onChanged();
    } finally {
      setInviting(false);
    }
  };

  const remove = async (userId: string, label: string) => {
    if (!window.confirm(`Remove ${label} from this organization? Their patient assignments will be revoked immediately.`)) return;
    setRemovingId(userId);
    try {
      const { error } = await removeOrgMember(orgId, userId);
      if (error) { toast.error(error); return; }
      toast.success('Removed.');
      onChanged();
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-5 sm:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5 text-ent-bronze" />
        <h2 className="font-bold text-ent-ink">Staff</h2>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@example.com (must already have an account)" className={`${inputCls} flex-1`} />
        <select value={role} onChange={(e) => setRole(e.target.value as Exclude<OrgRole, 'director'>)} className={inputCls + ' sm:w-56'}>
          <option value="caregiver">Caregiver</option>
          <option value="therapist">Therapist</option>
          <option value="medical_professional">Medical Professional</option>
          <option value="billing_admin">Billing Administrator</option>
        </select>
        <button type="button" onClick={() => { void invite(); }} disabled={inviting} className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-ent-bronze hover:opacity-90 text-white text-sm font-semibold disabled:opacity-60 whitespace-nowrap">
          <UserPlus className="w-4 h-4" /> {inviting ? 'Inviting…' : 'Invite'}
        </button>
      </div>
      <p className="text-xs text-ent-muted -mt-2">
        The invited person must already have a My Memoria Ally account with this email — no invitation email is sent; they will see it waiting when they next sign in.
      </p>

      {members.length === 0 ? (
        <p className="text-sm text-ent-muted">No staff yet.</p>
      ) : (
        <ul className="space-y-2">
          {members.filter((m) => m.orgRole !== 'director').map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 p-3 bg-ent-bg rounded-xl border border-ent-line">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ent-ink truncate">{m.firstName} {m.lastName} <span className="text-xs text-ent-muted">({m.email})</span></p>
                <p className="text-xs text-ent-muted">{ROLE_LABELS[m.orgRole]} — {m.status}</p>
              </div>
              <button
                type="button"
                onClick={() => { void remove(m.userId, `${m.firstName} ${m.lastName}`); }}
                disabled={removingId === m.userId}
                className="flex-shrink-0 p-2 rounded-lg text-ent-rust hover:bg-ent-rust/10 disabled:opacity-60"
                aria-label="Remove staff member"
              >
                {removingId === m.userId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CoveredPatientsCard({ orgId }: { orgId: string }) {
  const [patients, setPatients] = useState<{ patientId: string; firstName: string; lastName: string; preferredName: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getOrgCoveredPatients(orgId).then((rows) => { if (!cancelled) { setPatients(rows); setLoading(false); } });
    return () => { cancelled = true; };
  }, [orgId]);

  return (
    <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-5 sm:p-6 space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardList className="w-5 h-5 text-ent-bronze" />
        <h2 className="font-bold text-ent-ink">Covered Patients ({patients.length})</h2>
      </div>
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-ent-bronze" />
      ) : patients.length === 0 ? (
        <p className="text-sm text-ent-muted">No patients are currently covered by this organization. Caregiver staff register and automatically cover patients from their own dashboard.</p>
      ) : (
        <ul className="space-y-2">
          {patients.map((p) => (
            <li key={p.patientId} className="p-3 bg-ent-bg rounded-xl border border-ent-line text-sm font-medium text-ent-ink">
              {p.preferredName || `${p.firstName} ${p.lastName}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CommunicationsOverviewCard({ orgId }: { orgId: string }) {
  const [overview, setOverview] = useState<OrgCommunicationsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void getOrgCommunicationsOverview(orgId).then((o) => { if (!cancelled) { setOverview(o); setLoading(false); } });
    return () => { cancelled = true; };
  }, [orgId]);

  return (
    <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-5 sm:p-6 space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-ent-bronze" />
        <h2 className="font-bold text-ent-ink">Therapist Office Communications</h2>
      </div>
      <p className="text-xs text-ent-muted">
        Aggregate activity only — as a director you see volume and follow-up status, never message content from a conversation you were not personally added to.
      </p>
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-ent-bronze" />
      ) : (
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-3 bg-ent-bg rounded-xl border border-ent-line">
            <p className="text-2xl font-bold text-ent-ink">{overview?.activeConversations ?? 0}</p>
            <p className="text-[11px] text-ent-muted mt-0.5">Active conversations</p>
          </div>
          <div className="p-3 bg-ent-bg rounded-xl border border-ent-line">
            <p className="text-2xl font-bold text-ent-ink">{overview?.patientsWithConversations ?? 0}</p>
            <p className="text-[11px] text-ent-muted mt-0.5">Patients discussed</p>
          </div>
          <div className="p-3 bg-ent-bg rounded-xl border border-ent-line">
            <p className="text-2xl font-bold text-ent-rust">{overview?.unresolvedFollowUps ?? 0}</p>
            <p className="text-[11px] text-ent-muted mt-0.5">Unresolved follow-ups</p>
          </div>
        </div>
      )}
    </div>
  );
}

function AssignmentsCard({ orgId, members }: {
  orgId: string;
  members: (OrgMembershipRow & { firstName: string; lastName: string; email: string })[];
}) {
  const [assignments, setAssignments] = useState<StaffPatientAssignment[]>([]);
  const [coveredPatients, setCoveredPatients] = useState<{ patientId: string; firstName: string; lastName: string; preferredName: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [staffId, setStaffId] = useState('');
  const [patientId, setPatientId] = useState('');
  const [role, setRole] = useState<StaffRole>('caregiver');
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [a, p] = await Promise.all([getOrgStaffPatientAssignments(orgId), getOrgCoveredPatients(orgId)]);
      setAssignments(a);
      setCoveredPatients(p);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const staffOptions = members.filter((m) => m.orgRole !== 'director' && m.status === 'active');

  const assign = async () => {
    if (!staffId || !patientId) { toast.error('Select both a staff member and a patient.'); return; }
    setSaving(true);
    try {
      const { error } = await assignStaffToPatient(orgId, staffId, patientId, role);
      if (error) { toast.error(error); return; }
      toast.success('Assignment created.');
      setStaffId(''); setPatientId('');
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const unassign = async (userId: string, patId: string) => {
    const { error } = await unassignStaffFromPatient(orgId, userId, patId);
    if (error) { toast.error(error); return; }
    toast.success('Assignment removed.');
    await refresh();
  };

  return (
    <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-5 sm:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Link2 className="w-5 h-5 text-ent-bronze" />
        <h2 className="font-bold text-ent-ink">Staff-to-Patient Assignments</h2>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className={`${inputCls} flex-1`}>
          <option value="">Select staff member…</option>
          {staffOptions.map((m) => <option key={m.userId} value={m.userId}>{m.firstName} {m.lastName} ({ROLE_LABELS[m.orgRole]})</option>)}
        </select>
        <select value={patientId} onChange={(e) => setPatientId(e.target.value)} className={`${inputCls} flex-1`}>
          <option value="">Select covered patient…</option>
          {coveredPatients.map((p) => <option key={p.patientId} value={p.patientId}>{p.preferredName || `${p.firstName} ${p.lastName}`}</option>)}
        </select>
        <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)} className={inputCls + ' sm:w-44'}>
          <option value="caregiver">Caregiver</option>
          <option value="therapist">Therapist</option>
          <option value="medical_professional">Medical Professional</option>
        </select>
        <button type="button" onClick={() => { void assign(); }} disabled={saving} className="px-4 py-2.5 rounded-xl bg-ent-bronze hover:opacity-90 text-white text-sm font-semibold disabled:opacity-60 whitespace-nowrap">
          {saving ? 'Saving…' : 'Assign'}
        </button>
      </div>
      <p className="text-xs text-ent-muted -mt-2">The staff member must already hold that role in this organization, and the patient must already be covered.</p>

      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-ent-bronze" />
      ) : assignments.length === 0 ? (
        <p className="text-sm text-ent-muted">No staff-to-patient assignments yet.</p>
      ) : (
        <ul className="space-y-2">
          {assignments.filter((a) => a.isActive).map((a) => (
            <li key={`${a.userId}-${a.patientId}`} className="flex items-center justify-between gap-3 p-3 bg-ent-bg rounded-xl border border-ent-line">
              <p className="text-sm text-ent-ink min-w-0 truncate">
                <strong>{a.firstName} {a.lastName}</strong> ({ROLE_LABELS[a.orgRole as OrgRole]}) → {a.patientPreferredName || `${a.patientFirstName} ${a.patientLastName}`}
              </p>
              <button type="button" onClick={() => { void unassign(a.userId, a.patientId); }} className="flex-shrink-0 p-2 rounded-lg text-ent-rust hover:bg-ent-rust/10" aria-label="Remove assignment">
                <Unlink className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// FIVE-OFFICE ENTERPRISE PLATFORM §7 — Office A's required 12
// destinations. Every destination below reuses an existing,
// already-authorized card component or service rather than inventing
// a new one; the three genuinely new destinations (Scheduling
// Oversight, Care Operations, Incidents & Escalations) are backed by
// organizationDirectorOpsService.ts's org-wide reads, which themselves
// rely entirely on migration 068's pre-existing
// `is_active_org_director()` RLS — no new authorization surface.
type DirectorNavKey =
  | 'dashboard' | 'overview' | 'applications' | 'staff' | 'patients' | 'assignments' | 'scheduling'
  | 'operations' | 'incidents' | 'communications' | 'reports' | 'licensing' | 'settings';

const DIRECTOR_NAV_ITEMS: OfficeNavItem<DirectorNavKey>[] = [
  { key: 'dashboard', label: 'Director Dashboard', icon: LayoutDashboard },
  { key: 'overview', label: 'Organization Overview', icon: Building2 },
  { key: 'applications', label: 'Professional Applications & Approvals', icon: ClipboardList },
  { key: 'staff', label: 'Staff Management', icon: Users },
  { key: 'patients', label: 'Patient Management', icon: UserCog },
  { key: 'assignments', label: 'Assignments and Coverage', icon: Link2 },
  { key: 'scheduling', label: 'Scheduling Oversight', icon: CalendarClock },
  { key: 'operations', label: 'Care Operations', icon: ClipboardCheck },
  { key: 'incidents', label: 'Incidents and Escalations', icon: ShieldAlert },
  { key: 'communications', label: 'Care Communications', icon: MessageSquare },
  { key: 'reports', label: 'Reports and Insights', icon: BarChart3 },
  { key: 'licensing', label: 'Licensing and Entitlements', icon: CreditCard },
  { key: 'settings', label: 'Organization Settings', icon: SettingsIcon },
];
const DIRECTOR_NAV_GROUPS: OfficeNavGroup<DirectorNavKey>[] = [
  { label: 'ORGANIZATION', items: ['dashboard', 'overview', 'applications', 'staff', 'patients'] },
  { label: 'CARE OPERATIONS', items: ['assignments', 'scheduling', 'operations', 'incidents', 'communications'] },
  { label: 'ADMINISTRATION', items: ['reports', 'licensing', 'settings'] },
];

function DashboardHome({ orgName, members, license, visits, incidents, handoffs, onNavigate }: {
  orgName: string; members: (OrgMembershipRow & { firstName: string; lastName: string; email: string })[];
  license: OrgLicense | null; visits: OrgVisit[]; incidents: OrgIncidentReport[]; handoffs: OrgShiftHandoff[];
  onNavigate: (key: DirectorNavKey) => void;
}) {
  const activeStaff = members.filter((m) => m.orgRole !== 'director' && m.status === 'active').length;
  const openIncidents = incidents.filter((i) => i.resolutionStatus !== 'resolved').length;
  const scheduledVisits = visits.filter((v) => v.status === 'scheduled' || v.status === 'in_progress').length;
  const recentHandoffs = handoffs.slice(0, 5);
  const recentIncidents = incidents.filter((i) => i.resolutionStatus !== 'resolved').slice(0, 5);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-ent-ink">Director Dashboard</h1>
        <p className="text-sm text-ent-muted mt-0.5">Organization-wide oversight for {orgName || 'your organization'}.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Care Team" value={String(activeStaff)} sub="active staff" />
        <MetricCard label="Open Incidents" value={String(openIncidents)} sub="need review" />
        <MetricCard label="Scheduled Visits" value={String(scheduledVisits)} sub="upcoming or in progress" />
        <MetricCard label="License" value={license?.status ?? 'proposed'} sub="current status" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <OfficeCard>
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-ent-ink">Needs Your Attention</h2>
            {recentIncidents.length > 0 && <span className="text-xs font-bold text-ent-rust">{recentIncidents.length}</span>}
          </div>
          {recentIncidents.length === 0 ? (
            <p className="text-sm text-ent-text">No unresolved incidents across your organization right now.</p>
          ) : (
            <ul className="space-y-2">
              {recentIncidents.map((i) => (
                <li key={i.id} className="p-2.5 bg-ent-bg rounded-xl border border-ent-line text-sm">
                  <p className="font-semibold text-ent-ink capitalize">{i.incidentType.replace('_', ' ')} — {i.patientName}</p>
                  <p className="text-xs text-ent-muted">{new Date(i.occurredAt).toLocaleString()} · {i.severity}</p>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => onNavigate('incidents')} className="text-sm font-semibold text-ent-bronze hover:underline">View all incidents →</button>
        </OfficeCard>

        <OfficeCard>
          <h2 className="font-bold text-ent-ink">Recent Staff Activity</h2>
          {recentHandoffs.length === 0 ? (
            <p className="text-sm text-ent-text">No shift handoffs recorded yet across your organization.</p>
          ) : (
            <ul className="space-y-2">
              {recentHandoffs.map((h) => (
                <li key={h.id} className="p-2.5 bg-ent-bg rounded-xl border border-ent-line text-sm">
                  <p className="font-semibold text-ent-ink">{h.authorName} — {h.patientName}</p>
                  <p className="text-xs text-ent-muted line-clamp-2">{h.summary}</p>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => onNavigate('operations')} className="text-sm font-semibold text-ent-bronze hover:underline">View care operations →</button>
        </OfficeCard>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-ent-panel rounded-2xl border border-ent-line p-4">
      <p className="text-xs font-semibold text-ent-muted capitalize">{label}</p>
      <p className="text-2xl font-bold text-ent-ink mt-1 capitalize">{value}</p>
      <p className="text-[11px] text-ent-muted">{sub}</p>
    </div>
  );
}

function OrganizationOverviewView({ orgName, packageType, members, coveredCount }: {
  orgName: string; packageType: OrgPackageType; members: (OrgMembershipRow & { firstName: string; lastName: string; email: string })[]; coveredCount: number;
}) {
  const activeStaff = members.filter((m) => m.status === 'active');
  return (
    <OfficeCard>
      <div className="flex items-center gap-2"><Building2 className="w-5 h-5 text-ent-bronze" /><h2 className="font-bold text-ent-ink">Organization Overview</h2></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-ent-ink">
        <p><span className="text-ent-muted">Organization name:</span> {orgName || 'Not set'}</p>
        <p><span className="text-ent-muted">Business package:</span> {packageType === 'integrated_care' ? 'Enterprise Integrated Care' : 'Enterprise Therapist'}</p>
        <p><span className="text-ent-muted">Active members:</span> {activeStaff.length}</p>
        <p><span className="text-ent-muted">Covered patients:</span> {coveredCount}</p>
      </div>
    </OfficeCard>
  );
}

// MASTER ENTERPRISE IDENTITY DIRECTIVE §8 — "Professional Applications
// & Approvals." A Director reviews every Caregiver/Medical/Therapist
// application that targets THEIR OWN organization (RLS already scopes
// getOrgApplications() to is_active_org_director(organization_id) —
// confirmed by migration 083's own policy, not re-asserted here).
// Director applications (new organizations) never appear here — they
// are Platform-Owner-only, by the backend's own design, not a frontend
// filter.
const OFFICE_LABEL: Record<string, string> = { caregiver: 'Enterprise Caregiver', medical_professional: 'Medical Professional', therapist: 'Therapist Professional', director: 'Admin / Director' };
const STATUS_BADGE: Record<string, string> = {
  pending_review: 'bg-ent-amber/20 text-ent-amber', resubmitted: 'bg-ent-amber/20 text-ent-amber', info_required: 'bg-ent-pale text-ent-ink',
  approved: 'bg-ent-green-active text-ent-forest', rejected: 'bg-ent-rust/15 text-ent-rust', withdrawn: 'bg-ent-pale text-ent-muted',
};

function ApplicationDetail({ app, onBack, onChanged }: { app: ProfessionalApplicationRow; onBack: () => void; onChanged: () => void }) {
  const [correctionText, setCorrectionText] = useState('');
  const [rejectionText, setRejectionText] = useState('');
  const [busy, setBusy] = useState(false);
  const [documents, setDocuments] = useState<{ id: string; fileName: string; documentType: string; storagePath: string }[]>([]);

  useEffect(() => { void getApplicationDocuments(app.id).then(setDocuments); }, [app.id]);

  const openDocument = async (storagePath: string) => {
    const url = await getSignedDocumentUrl(storagePath);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    else toast.error('Could not open this document.');
  };

  const approve = async () => {
    setBusy(true);
    try {
      const { error } = await directorApproveApplication(app.id);
      if (error) { toast.error(error); return; }
      toast.success('Application approved.');
      onChanged(); onBack();
    } finally { setBusy(false); }
  };
  const requestCorrections = async () => {
    if (!correctionText.trim()) { toast.error('Describe what needs to be corrected.'); return; }
    setBusy(true);
    try {
      const { error } = await requestApplicationCorrections(app.id, correctionText.trim(), {});
      if (error) { toast.error(error); return; }
      toast.success('Correction request sent to the applicant.');
      onChanged(); onBack();
    } finally { setBusy(false); }
  };
  const reject = async () => {
    if (!rejectionText.trim()) { toast.error('Provide a reason for rejection.'); return; }
    setBusy(true);
    try {
      const { error } = await rejectApplication(app.id, rejectionText.trim());
      if (error) { toast.error(error); return; }
      toast.success('Application rejected.');
      onChanged(); onBack();
    } finally { setBusy(false); }
  };

  const details = app.application_details || {};
  const canAct = app.status === 'pending_review' || app.status === 'resubmitted';

  return (
    <OfficeCard>
      <button type="button" onClick={onBack} className="text-xs font-semibold text-ent-bronze hover:underline">← Back to applications</button>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-bold text-ent-ink">{app.legal_name} — {OFFICE_LABEL[app.requested_office] ?? app.requested_office}</h2>
        <span className={`text-[11px] font-bold px-2 py-1 rounded-full capitalize ${STATUS_BADGE[app.status] ?? 'bg-ent-pale text-ent-ink'}`}>{app.status.replace('_', ' ')}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-ent-ink">
        <p><span className="text-ent-muted">Preferred name:</span> {app.preferred_name || '—'}</p>
        <p><span className="text-ent-muted">Email:</span> {app.contact_email}</p>
        <p><span className="text-ent-muted">Phone:</span> {app.contact_phone || '—'}</p>
        <p><span className="text-ent-muted">Title:</span> {app.professional_title || '—'}</p>
        <p><span className="text-ent-muted">Category:</span> {app.profession_category || '—'}</p>
        <p><span className="text-ent-muted">Credential status:</span> {app.credential_verification_status.replace('_', ' ')}</p>
      </div>
      {Object.keys(details).length > 0 && (
        <div className="bg-ent-bg rounded-xl border border-ent-line p-3 text-sm text-ent-ink space-y-1">
          {Object.entries(details).map(([k, v]) => v ? <p key={k}><span className="text-ent-muted capitalize">{k.replace(/_/g, ' ')}:</span> {String(v)}</p> : null)}
        </div>
      )}
      <div>
        <p className="text-sm font-semibold text-ent-ink mb-1">Submitted documents</p>
        {documents.length === 0 ? <p className="text-sm text-ent-text">No documents submitted.</p> : (
          <ul className="space-y-1">
            {documents.map((d) => (
              <li key={d.id}>
                <button type="button" onClick={() => { void openDocument(d.storagePath); }} className="text-sm text-ent-bronze hover:underline">{d.fileName} ({d.documentType})</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {app.correction_request && (
        <div className="bg-ent-amber/10 border border-ent-amber/30 rounded-xl p-3 text-sm text-ent-ink">
          <span className="font-semibold">Last correction request:</span> {app.correction_request}
        </div>
      )}
      {app.rejection_reason && (
        <div className="bg-ent-rust/10 border border-ent-rust/30 rounded-xl p-3 text-sm text-ent-ink">
          <span className="font-semibold">Rejection reason:</span> {app.rejection_reason}
        </div>
      )}
      {canAct && (
        <div className="space-y-3 pt-2 border-t border-ent-line">
          <button type="button" onClick={() => { void approve(); }} disabled={busy} className="w-full py-2.5 rounded-xl bg-ent-bronze hover:opacity-90 text-white text-sm font-semibold disabled:opacity-60">
            Approve Application
          </button>
          <div className="flex gap-2">
            <input value={correctionText} onChange={(e) => setCorrectionText(e.target.value)} placeholder="Describe what the applicant needs to correct…" className={`${inputCls} flex-1`} />
            <button type="button" onClick={() => { void requestCorrections(); }} disabled={busy} className="px-3 py-2 rounded-xl border border-ent-line text-ent-ink text-sm font-semibold hover:bg-ent-pale whitespace-nowrap">Request Corrections</button>
          </div>
          <div className="flex gap-2">
            <input value={rejectionText} onChange={(e) => setRejectionText(e.target.value)} placeholder="Reason for rejection…" className={`${inputCls} flex-1`} />
            <button type="button" onClick={() => { void reject(); }} disabled={busy} className="px-3 py-2 rounded-xl border border-ent-rust text-ent-rust text-sm font-semibold hover:bg-ent-rust/10 whitespace-nowrap">Reject</button>
          </div>
        </div>
      )}
    </OfficeCard>
  );
}

function ApplicationsReviewView({ organizationId }: { organizationId: string }) {
  const [apps, setApps] = useState<ProfessionalApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openAppId, setOpenAppId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [officeFilter, setOfficeFilter] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('professional_applications').select('*').eq('target_organization_id', organizationId).order('created_at', { ascending: false });
    setApps((data ?? []) as unknown as ProfessionalApplicationRow[]);
    setLoading(false);
  }, [organizationId]);
  useEffect(() => { void refresh(); }, [refresh]);

  const openApp = apps.find((a) => a.id === openAppId);
  const filtered = apps.filter((a) =>
    (!officeFilter || a.requested_office === officeFilter) &&
    (!search.trim() || a.legal_name.toLowerCase().includes(search.toLowerCase()) || a.contact_email.toLowerCase().includes(search.toLowerCase())));

  if (loading) return <Loader2 className="w-6 h-6 animate-spin text-ent-forest mx-auto" />;
  if (openApp) return <ApplicationDetail app={openApp} onBack={() => setOpenAppId(null)} onChanged={() => { void refresh(); }} />;

  return (
    <OfficeCard>
      <h2 className="font-bold text-ent-ink">Professional Applications &amp; Approvals</h2>
      <div className="flex flex-wrap gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email…" className={`${inputCls} flex-1 min-w-[180px]`} />
        <select value={officeFilter} onChange={(e) => setOfficeFilter(e.target.value)} className={inputCls + ' sm:w-56'}>
          <option value="">All offices</option>
          <option value="caregiver">Enterprise Caregiver</option>
          <option value="medical_professional">Medical Professional</option>
          <option value="therapist">Therapist Professional</option>
        </select>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-ent-text">No applications match. New applications to your organization will appear here.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => setOpenAppId(a.id)} className="w-full flex items-center justify-between gap-3 p-3 bg-ent-bg rounded-xl border border-ent-line hover:shadow-sm transition-all text-left">
                <div className="min-w-0">
                  <p className="font-semibold text-ent-ink truncate">{a.legal_name} <span className="text-ent-muted font-normal">— {OFFICE_LABEL[a.requested_office] ?? a.requested_office}</span></p>
                  <p className="text-xs text-ent-muted truncate">{a.contact_email} · submitted {new Date(a.created_at).toLocaleDateString()}</p>
                </div>
                <span className={`text-[11px] font-bold px-2 py-1 rounded-full capitalize flex-shrink-0 ${STATUS_BADGE[a.status] ?? 'bg-ent-pale text-ent-ink'}`}>{a.status.replace('_', ' ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </OfficeCard>
  );
}

function SchedulingOversightView({ visits }: { visits: OrgVisit[] }) {
  return (
    <OfficeCard>
      <div className="flex items-center gap-2"><CalendarClock className="w-5 h-5 text-ent-bronze" /><h2 className="font-bold text-ent-ink">Scheduling Oversight</h2></div>
      {visits.length === 0 ? (
        <p className="text-sm text-ent-text">No visits have been scheduled yet across your organization.</p>
      ) : (
        <ul className="space-y-2">
          {visits.map((v) => (
            <li key={v.id} className="p-3 bg-ent-bg rounded-xl border border-ent-line flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ent-ink truncate">{v.caregiverName} → {v.patientName}</p>
                <p className="text-xs text-ent-muted">{v.scheduledStart ? new Date(v.scheduledStart).toLocaleString() : 'No time set'}</p>
              </div>
              <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-ent-pale text-ent-ink capitalize flex-shrink-0">{v.status.replace('_', ' ')}</span>
            </li>
          ))}
        </ul>
      )}
    </OfficeCard>
  );
}

function CareOperationsView({ handoffs }: { handoffs: OrgShiftHandoff[] }) {
  return (
    <OfficeCard>
      <div className="flex items-center gap-2"><ClipboardCheck className="w-5 h-5 text-ent-bronze" /><h2 className="font-bold text-ent-ink">Care Operations</h2></div>
      <p className="text-sm text-ent-text">Recent shift handoffs across your organization.</p>
      {handoffs.length === 0 ? (
        <p className="text-sm text-ent-text">No shift handoffs recorded yet.</p>
      ) : (
        <ul className="space-y-2">
          {handoffs.map((h) => (
            <li key={h.id} className="p-3 bg-ent-bg rounded-xl border border-ent-line text-sm">
              <p className="font-semibold text-ent-ink">{h.authorName} — {h.patientName}</p>
              <p className="text-ent-text">{h.summary}</p>
              {h.pendingTasks && <p className="text-xs text-ent-muted mt-1">Pending: {h.pendingTasks}</p>}
              {h.concerns && <p className="text-xs text-ent-rust mt-1">Concerns: {h.concerns}</p>}
              <p className="text-[11px] text-ent-muted mt-1">{new Date(h.createdAt).toLocaleString()}</p>
            </li>
          ))}
        </ul>
      )}
    </OfficeCard>
  );
}

function IncidentsView({ incidents, onResolved }: { incidents: OrgIncidentReport[]; onResolved: () => void }) {
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const resolve = async (id: string, status: IncidentResolutionStatus) => {
    setResolvingId(id);
    try {
      const { error } = await resolveOrgIncidentReport(id, status);
      if (error) { toast.error(error); return; }
      toast.success('Incident updated.');
      onResolved();
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <OfficeCard>
      <div className="flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-ent-bronze" /><h2 className="font-bold text-ent-ink">Incidents and Escalations</h2></div>
      {incidents.length === 0 ? (
        <p className="text-sm text-ent-text">No incidents have been reported across your organization.</p>
      ) : (
        <ul className="space-y-2">
          {incidents.map((i) => (
            <li key={i.id} className="p-3 bg-ent-bg rounded-xl border border-ent-line space-y-1.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="font-semibold text-ent-ink capitalize">{i.incidentType.replace('_', ' ')} — {i.patientName}</p>
                <span className={`text-[11px] font-bold px-2 py-1 rounded-full capitalize ${
                  i.severity === 'critical' || i.severity === 'high' ? 'bg-ent-rust/15 text-ent-rust' : 'bg-ent-amber/20 text-ent-amber'
                }`}>{i.severity}</span>
              </div>
              <p className="text-sm text-ent-text">{i.description}</p>
              <p className="text-[11px] text-ent-muted">Reported by {i.reportedByName} · {new Date(i.occurredAt).toLocaleString()}</p>
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-ent-pale text-ent-ink capitalize">{i.resolutionStatus.replace('_', ' ')}</span>
                {i.resolutionStatus !== 'resolved' && (
                  <button
                    type="button" onClick={() => { void resolve(i.id, 'resolved'); }} disabled={resolvingId === i.id}
                    className="flex items-center gap-1 text-xs font-semibold text-ent-bronze hover:underline disabled:opacity-60"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Mark resolved
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </OfficeCard>
  );
}

function ReportsInsightsView({ members, visits, incidents, license }: {
  members: (OrgMembershipRow & { firstName: string; lastName: string; email: string })[];
  visits: OrgVisit[]; incidents: OrgIncidentReport[]; license: OrgLicense | null;
}) {
  const completedVisits = visits.filter((v) => v.status === 'completed').length;
  const unresolvedIncidents = incidents.filter((i) => i.resolutionStatus !== 'resolved').length;
  return (
    <OfficeCard>
      <div className="flex items-center gap-2"><BarChart3 className="w-5 h-5 text-ent-bronze" /><h2 className="font-bold text-ent-ink">Reports and Insights</h2></div>
      <p className="text-sm text-ent-text">A current-state operational summary drawn from live authorized records.</p>
      <ul className="text-sm text-ent-ink space-y-1.5">
        <li>• {members.filter((m) => m.status === 'active').length} active organization member{members.length === 1 ? '' : 's'}</li>
        <li>• {completedVisits} completed visit{completedVisits === 1 ? '' : 's'} on file</li>
        <li>• {unresolvedIncidents} unresolved incident{unresolvedIncidents === 1 ? '' : 's'}</li>
        <li>• License status: {license?.status ?? 'proposed'}{license?.coveredPatientCapacity != null ? ` · capacity ${license.coveredPatientCapacity}` : ''}</li>
      </ul>
      <p className="text-xs text-ent-muted pt-2 border-t border-ent-line">
        Trend analysis and staffing forecasts are not yet built on the backend — this view will not display estimated or
        invented figures for those until that data exists.
      </p>
    </OfficeCard>
  );
}

function OrganizationSettingsView({ orgName, packageType, onOpenBilling }: { orgName: string; packageType: OrgPackageType; onOpenBilling: () => void }) {
  return (
    <OfficeCard>
      <div className="flex items-center gap-2"><SettingsIcon className="w-5 h-5 text-ent-bronze" /><h2 className="font-bold text-ent-ink">Organization Settings</h2></div>
      <div className="text-sm text-ent-ink space-y-1">
        <p><span className="text-ent-muted">Organization name:</span> {orgName || 'Not set'}</p>
        <p><span className="text-ent-muted">Business package:</span> {packageType === 'integrated_care' ? 'Enterprise Integrated Care' : 'Enterprise Therapist'}</p>
      </div>
      <p className="text-sm text-ent-text pt-2 border-t border-ent-line">
        License seats, capacity and billing add-ons are configured from Licensing &amp; Entitlements. Staff roles and patient
        assignments are configured from Staff Management and Assignments and Coverage.
      </p>
      <button type="button" onClick={onOpenBilling} className="flex items-center gap-1.5 text-sm font-semibold text-ent-bronze hover:underline">
        Open Billing &amp; Add-Ons <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </OfficeCard>
  );
}

const DIRECTOR_NAV_KEYS = DIRECTOR_NAV_ITEMS.map((n) => n.key) as DirectorNavKey[];

// basePath defaults to null (no URL sync) so every EXISTING caller
// (/business, the old top-level /Admin) keeps its exact established
// behavior unchanged — only an explicit basePath (passed by
// ProfessionalOfficeResolver.tsx under /Professional/Admin) turns on
// nested-route URL sync (P1 CORRECTIVE ORDER §7).
export default function OrganizationDirectorDashboard({ organizationId, basePath = null }: { organizationId: string; basePath?: string | null }) {
  const { state, dispatch } = useApp();
  const [license, setLicense] = useState<OrgLicense | null>(null);
  const [members, setMembers] = useState<(OrgMembershipRow & { firstName: string; lastName: string; email: string })[]>([]);
  const [orgName, setOrgName] = useState('');
  const [packageType, setPackageType] = useState<OrgPackageType>('integrated_care');
  const [coveredCount, setCoveredCount] = useState(0);
  const [visits, setVisits] = useState<OrgVisit[]>([]);
  const [incidents, setIncidents] = useState<OrgIncidentReport[]>([]);
  const [handoffs, setHandoffs] = useState<OrgShiftHandoff[]>([]);
  const [loading, setLoading] = useState(true);
  const [nav, setNav] = useOfficeUrlSync<DirectorNavKey>(basePath, DIRECTOR_NAV_KEYS, 'dashboard');
  const [billingOpen, setBillingOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [lic, mem, orgs, covered, v, inc, hoffs] = await Promise.all([
        getOrgLicense(organizationId),
        getOrgMembers(organizationId),
        getMyOrganizations(),
        getOrgCoveredPatients(organizationId),
        getOrgVisits(organizationId),
        getOrgIncidentReports(organizationId),
        getOrgShiftHandoffs(organizationId),
      ]);
      const org = orgs.find((o) => o.organizationId === organizationId);
      setLicense(lic);
      setMembers(mem);
      setOrgName(org?.organizationName ?? '');
      setPackageType(org?.packageType ?? 'integrated_care');
      setCoveredCount(covered.length);
      setVisits(v);
      setIncidents(inc);
      setHandoffs(hoffs);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    dispatch({ type: 'LOGOUT' });
    toast('You have been logged out');
  };

  const fullName = state.currentUser?.firstName ? `${state.currentUser.firstName} ${state.currentUser.lastName ?? ''}`.trim() : 'Director';
  const initials = (state.currentUser?.firstName?.[0] ?? 'D').toUpperCase();

  const navigate = (key: DirectorNavKey) => { setBillingOpen(false); setNav(key); };

  return (
    <EnterpriseOfficeShell
      officeBadge="ADMIN OFFICE" orgLabel={orgName || 'Organization'} roleLabel="Director" fullName={fullName} initials={initials}
      navItems={DIRECTOR_NAV_ITEMS} navGroups={DIRECTOR_NAV_GROUPS} activeNav={nav} onNavigate={navigate}
      onLogout={() => { void handleLogout(); }}
    >
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-ent-forest" /></div>
      ) : nav === 'dashboard' ? (
        <DashboardHome orgName={orgName} members={members} license={license} visits={visits} incidents={incidents} handoffs={handoffs} onNavigate={navigate} />
      ) : nav === 'overview' ? (
        <OrganizationOverviewView orgName={orgName} packageType={packageType} members={members} coveredCount={coveredCount} />
      ) : nav === 'applications' ? (
        <ApplicationsReviewView organizationId={organizationId} />
      ) : nav === 'staff' ? (
        <StaffCard orgId={organizationId} members={members} onChanged={() => { void refresh(); }} />
      ) : nav === 'patients' ? (
        <CoveredPatientsCard orgId={organizationId} />
      ) : nav === 'assignments' ? (
        <AssignmentsCard orgId={organizationId} members={members} />
      ) : nav === 'scheduling' ? (
        <SchedulingOversightView visits={visits} />
      ) : nav === 'operations' ? (
        <CareOperationsView handoffs={handoffs} />
      ) : nav === 'incidents' ? (
        <IncidentsView incidents={incidents} onResolved={() => { void refresh(); }} />
      ) : nav === 'communications' ? (
        <CommunicationsOverviewCard orgId={organizationId} />
      ) : nav === 'reports' ? (
        <ReportsInsightsView members={members} visits={visits} incidents={incidents} license={license} />
      ) : nav === 'licensing' ? (
        billingOpen ? (
          <div className="space-y-4">
            <button type="button" onClick={() => setBillingOpen(false)} className="text-sm font-semibold text-ent-bronze hover:underline">← Back to Licensing</button>
            <OrganizationBillingPage organizationId={organizationId} orgName={orgName || 'Organization'} packageType={packageType} />
          </div>
        ) : (
          <div className="space-y-4">
            <LicenseCard orgId={organizationId} license={license} onUpdated={() => { void refresh(); }} />
            <button type="button" onClick={() => setBillingOpen(true)} className="flex items-center gap-1.5 text-sm font-semibold text-ent-bronze hover:underline">
              Open Billing &amp; Add-Ons <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )
      ) : nav === 'settings' ? (
        <OrganizationSettingsView orgName={orgName} packageType={packageType} onOpenBilling={() => { setNav('licensing'); setBillingOpen(true); }} />
      ) : null}
    </EnterpriseOfficeShell>
  );
}

export { CreateOrgCard };
