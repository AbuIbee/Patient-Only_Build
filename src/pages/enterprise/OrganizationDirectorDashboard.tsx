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
  Building2, Users, LogOut, UserPlus, Trash2,
  Loader2, CreditCard, ClipboardList, MessageSquare, Link2, Unlink,
} from 'lucide-react';
import {
  getMyOrganizations, getOrgMembers, getOrgLicense, getOrgCoveredPatients,
  orgConfigureLicense, inviteOrgMember, removeOrgMember, createOrganization,
  getOrgStaffPatientAssignments, assignStaffToPatient, unassignStaffFromPatient,
  getOrgCommunicationsOverview,
  type OrgLicense, type OrgRole, type OrgMembershipRow, type OrgPackageType,
  type StaffPatientAssignment, type StaffRole, type OrgCommunicationsOverview,
} from '@/services/organizationService';
import OrganizationBillingPage from './OrganizationBillingPage';

const inputCls = 'w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze border-soft-taupe bg-white';

const ROLE_LABELS: Record<OrgRole, string> = {
  director: 'Director',
  caregiver: 'Caregiver',
  therapist: 'Therapist',
  medical_professional: 'Medical Professional',
  billing_admin: 'Billing Administrator',
};

function CreateOrgCard({ onCreated }: { onCreated: (orgId: string) => void }) {
  const [name, setName] = useState('');
  const [packageType, setPackageType] = useState<'therapist' | 'integrated_care'>('integrated_care');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) { toast.error('Organization name is required.'); return; }
    setLoading(true);
    try {
      const { organizationId, error } = await createOrganization(name, packageType);
      if (error || !organizationId) { toast.error(error || 'Could not create the organization.'); return; }
      toast.success(`${name} has been created.`);
      onCreated(organizationId);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-6 space-y-4 max-w-md mx-auto">
      <div className="flex items-center gap-2">
        <Building2 className="w-5 h-5 text-warm-bronze" />
        <h2 className="text-lg font-bold text-charcoal">Create Your Organization</h2>
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-charcoal">Organization Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Riverside Home Care" className={inputCls} />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-charcoal">Business Package</label>
        <select value={packageType} onChange={(e) => setPackageType(e.target.value as 'therapist' | 'integrated_care')} className={inputCls}>
          <option value="integrated_care">Enterprise Integrated Care</option>
          <option value="therapist">Enterprise Therapist</option>
        </select>
        <p className="text-xs text-medium-gray">Covered patients always receive the same Full Support experience regardless of package.</p>
      </div>
      <button
        type="button"
        onClick={() => { void handleCreate(); }}
        disabled={loading}
        className="w-full py-3 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white font-semibold disabled:opacity-60 transition-colors"
      >
        {loading ? 'Creating…' : 'Create Organization'}
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
    <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-warm-bronze" />
          <h2 className="font-bold text-charcoal">License &amp; Capacity</h2>
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${license?.status === 'active' ? 'text-soft-sage bg-soft-sage/10' : 'text-amber-700 bg-amber-100'}`}>
          {license?.status ?? 'proposed'}
        </span>
      </div>
      <p className="text-xs text-medium-gray">
        Seats, capacity and fee are proposed, configurable commercial terms — setting them here never activates the license or creates a charge. Only an admin can activate, expire, or cancel a license (a separate, staging-only mechanism for synthetic integration testing); this status also controls whether covered patients actually receive Full Support.
      </p>
      {editing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-charcoal">Licensed Staff Seats</label>
              <input type="number" min={0} value={seats} onChange={(e) => setSeats(e.target.value)} placeholder="e.g. 5" className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-charcoal">Covered Patient Capacity</label>
              <input type="number" min={0} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="e.g. 20" className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-charcoal">Proposed Annual Fee ($)</label>
              <input type="number" min={0} step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="e.g. 999.00" className={inputCls} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => { void save(); }} disabled={saving} className="px-4 py-2 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white text-sm font-semibold disabled:opacity-60">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="px-4 py-2 rounded-xl border border-soft-taupe text-charcoal text-sm font-semibold">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="text-sm text-charcoal space-y-0.5">
            <p>Seats: <strong>{license?.licensedSeats ?? 'Not configured'}</strong></p>
            <p>Patient capacity: <strong>{license?.coveredPatientCapacity ?? 'Not configured'}</strong></p>
            <p>Proposed annual fee: <strong>{license?.annualLicenseFee != null ? `$${license.annualLicenseFee.toFixed(2)}` : 'Not configured'}</strong></p>
          </div>
          <button type="button" onClick={() => setEditing(true)} className="px-3 py-2 rounded-lg border border-soft-taupe text-charcoal text-sm font-semibold hover:bg-soft-taupe/20">
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
    <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5 text-warm-bronze" />
        <h2 className="font-bold text-charcoal">Staff</h2>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@example.com (must already have an account)" className={`${inputCls} flex-1`} />
        <select value={role} onChange={(e) => setRole(e.target.value as Exclude<OrgRole, 'director'>)} className={inputCls + ' sm:w-56'}>
          <option value="caregiver">Caregiver</option>
          <option value="therapist">Therapist</option>
          <option value="medical_professional">Medical Professional</option>
          <option value="billing_admin">Billing Administrator</option>
        </select>
        <button type="button" onClick={() => { void invite(); }} disabled={inviting} className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white text-sm font-semibold disabled:opacity-60 whitespace-nowrap">
          <UserPlus className="w-4 h-4" /> {inviting ? 'Inviting…' : 'Invite'}
        </button>
      </div>
      <p className="text-xs text-medium-gray -mt-2">
        The invited person must already have a My Memoria Ally account with this email — no invitation email is sent; they will see it waiting when they next sign in.
      </p>

      {members.length === 0 ? (
        <p className="text-sm text-medium-gray">No staff yet.</p>
      ) : (
        <ul className="space-y-2">
          {members.filter((m) => m.orgRole !== 'director').map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 p-3 bg-warm-ivory rounded-xl border border-soft-taupe">
              <div className="min-w-0">
                <p className="text-sm font-medium text-charcoal truncate">{m.firstName} {m.lastName} <span className="text-xs text-medium-gray">({m.email})</span></p>
                <p className="text-xs text-medium-gray">{ROLE_LABELS[m.orgRole]} — {m.status}</p>
              </div>
              <button
                type="button"
                onClick={() => { void remove(m.userId, `${m.firstName} ${m.lastName}`); }}
                disabled={removingId === m.userId}
                className="flex-shrink-0 p-2 rounded-lg text-gentle-coral hover:bg-gentle-coral/10 disabled:opacity-60"
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
    <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardList className="w-5 h-5 text-warm-bronze" />
        <h2 className="font-bold text-charcoal">Covered Patients ({patients.length})</h2>
      </div>
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-warm-bronze" />
      ) : patients.length === 0 ? (
        <p className="text-sm text-medium-gray">No patients are currently covered by this organization. Caregiver staff register and automatically cover patients from their own dashboard.</p>
      ) : (
        <ul className="space-y-2">
          {patients.map((p) => (
            <li key={p.patientId} className="p-3 bg-warm-ivory rounded-xl border border-soft-taupe text-sm font-medium text-charcoal">
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
    <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-warm-bronze" />
        <h2 className="font-bold text-charcoal">Therapist Office Communications</h2>
      </div>
      <p className="text-xs text-medium-gray">
        Aggregate activity only — as a director you see volume and follow-up status, never message content from a conversation you were not personally added to.
      </p>
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-warm-bronze" />
      ) : (
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-3 bg-warm-ivory rounded-xl border border-soft-taupe">
            <p className="text-2xl font-bold text-charcoal">{overview?.activeConversations ?? 0}</p>
            <p className="text-[11px] text-medium-gray mt-0.5">Active conversations</p>
          </div>
          <div className="p-3 bg-warm-ivory rounded-xl border border-soft-taupe">
            <p className="text-2xl font-bold text-charcoal">{overview?.patientsWithConversations ?? 0}</p>
            <p className="text-[11px] text-medium-gray mt-0.5">Patients discussed</p>
          </div>
          <div className="p-3 bg-warm-ivory rounded-xl border border-soft-taupe">
            <p className="text-2xl font-bold text-gentle-coral">{overview?.unresolvedFollowUps ?? 0}</p>
            <p className="text-[11px] text-medium-gray mt-0.5">Unresolved follow-ups</p>
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
    <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Link2 className="w-5 h-5 text-warm-bronze" />
        <h2 className="font-bold text-charcoal">Staff-to-Patient Assignments</h2>
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
        <button type="button" onClick={() => { void assign(); }} disabled={saving} className="px-4 py-2.5 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white text-sm font-semibold disabled:opacity-60 whitespace-nowrap">
          {saving ? 'Saving…' : 'Assign'}
        </button>
      </div>
      <p className="text-xs text-medium-gray -mt-2">The staff member must already hold that role in this organization, and the patient must already be covered.</p>

      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-warm-bronze" />
      ) : assignments.length === 0 ? (
        <p className="text-sm text-medium-gray">No staff-to-patient assignments yet.</p>
      ) : (
        <ul className="space-y-2">
          {assignments.filter((a) => a.isActive).map((a) => (
            <li key={`${a.userId}-${a.patientId}`} className="flex items-center justify-between gap-3 p-3 bg-warm-ivory rounded-xl border border-soft-taupe">
              <p className="text-sm text-charcoal min-w-0 truncate">
                <strong>{a.firstName} {a.lastName}</strong> ({ROLE_LABELS[a.orgRole as OrgRole]}) → {a.patientPreferredName || `${a.patientFirstName} ${a.patientLastName}`}
              </p>
              <button type="button" onClick={() => { void unassign(a.userId, a.patientId); }} className="flex-shrink-0 p-2 rounded-lg text-gentle-coral hover:bg-gentle-coral/10" aria-label="Remove assignment">
                <Unlink className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function OrganizationDirectorDashboard({ organizationId }: { organizationId: string }) {
  const { dispatch } = useApp();
  const [tab, setTab] = useState<'overview' | 'billing'>('overview');
  const [license, setLicense] = useState<OrgLicense | null>(null);
  const [members, setMembers] = useState<(OrgMembershipRow & { firstName: string; lastName: string; email: string })[]>([]);
  const [orgName, setOrgName] = useState('');
  const [packageType, setPackageType] = useState<OrgPackageType>('integrated_care');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [lic, mem, orgs] = await Promise.all([
        getOrgLicense(organizationId),
        getOrgMembers(organizationId),
        getMyOrganizations(),
      ]);
      const org = orgs.find((o) => o.organizationId === organizationId);
      setLicense(lic);
      setMembers(mem);
      setOrgName(org?.organizationName ?? '');
      setPackageType(org?.packageType ?? 'integrated_care');
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

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-warm-bronze" /></div>;
  }

  return (
    <div className="min-h-screen bg-warm-ivory">
      <header className="bg-white border-b border-soft-taupe px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/images/MymemoriaDayTime.png" alt="My Memoria Ally" className="w-8 h-8 rounded-lg object-cover" />
            <div>
              <div className="font-semibold text-charcoal">{orgName || 'Organization'}</div>
              <div className="text-xs text-medium-gray">Director Dashboard</div>
            </div>
          </div>
          <button type="button" onClick={() => { void handleLogout(); }} className="flex items-center gap-1.5 text-sm text-medium-gray hover:text-charcoal px-3 py-2 rounded-lg hover:bg-soft-taupe/30 transition-colors">
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
        <div className="max-w-3xl mx-auto flex gap-1 mt-3">
          {([['overview', 'Overview'], ['billing', 'Billing & Add-Ons']] as const).map(([id, label]) => (
            <button
              key={id} type="button" onClick={() => setTab(id)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${tab === id ? 'bg-warm-bronze text-white' : 'text-medium-gray hover:bg-soft-taupe/30'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        {tab === 'overview' ? (
          <>
            <LicenseCard orgId={organizationId} license={license} onUpdated={() => { void refresh(); }} />
            <StaffCard orgId={organizationId} members={members} onChanged={() => { void refresh(); }} />
            <CoveredPatientsCard orgId={organizationId} />
            <AssignmentsCard orgId={organizationId} members={members} />
            <CommunicationsOverviewCard orgId={organizationId} />
          </>
        ) : (
          <OrganizationBillingPage organizationId={organizationId} orgName={orgName || 'Organization'} packageType={packageType} />
        )}
      </main>
    </div>
  );
}

export { CreateOrgCard };
