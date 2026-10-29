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
  getMyOrganizations, getOrgMembers, getOrgLicense, getOrgCoveredPatients, closePatientCoverage,
  inviteOrgMember, removeOrgMember, createOrganization,
  getOrgStaffPatientAssignments, assignStaffToPatient, unassignStaffFromPatient,
  getOrgCommunicationsOverview,
  amIOrgOwner, getMyOwnerCapabilityGrants, ownerSelfAssignCapability, ownerRevokeOwnCapability,
  OWNER_CAPABILITIES,
  type OrgLicense, type OrgRole, type OrgMembershipRow, type OrgPackageType,
  type StaffPatientAssignment, type StaffRole, type OrgCommunicationsOverview, type OrgCoveredPatient,
  type OwnerCapability, type OwnerCapabilityGrant,
} from '@/services/organizationService';
import {
  directorApproveApplication, requestApplicationCorrections, rejectApplication, recordCredentialVerification,
  getApplicationDocuments, getSignedDocumentUrl,
} from '@/services/professionalApplicationService';
import {
  getOrgVisitsResult, getOrgIncidentReportsResult, getOrgShiftHandoffsResult, resolveOrgIncidentReport,
  type OrgVisit, type OrgIncidentReport, type OrgShiftHandoff, type IncidentResolutionStatus,
} from '@/services/organizationDirectorOpsService';
import {
  getMyOrganizationOriginatingQuoteId, getMyEnterpriseBillingStatus, startEnterpriseCheckout, openEnterpriseBillingPortal,
  type EnterpriseBillingAccount,
} from '@/services/salesService';
import {
  requestOrganizationAmendment, withdrawAmendmentRequest, getMyOrgAmendmentRequests, getMyQuotedAmendmentForOrg,
  type OrganizationAmendmentRequest, type AmendmentRequestType,
} from '@/services/organizationAmendmentService';
import { getContractsForQuote, type EnterpriseContract } from '@/services/enterpriseContractService';
import OrganizationBillingPage from './OrganizationBillingPage';
import CareConversations from '@/components/communications/CareConversations';
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

// OWNER DIRECTIVE MMA-ENT-SALES-005 Phase F/G -- the missing link
// between a Platform-Owner-approved Director application and an
// actually-paid Enterprise license. Only renders when this
// organization was created through the quote-driven sales pipeline
// (an originating quote exists) and payment hasn't already succeeded
// -- an organization created the old, quote-less way (legacy
// CreateOrgCard) has nothing to pay against and sees nothing extra
// here, exactly as before this feature existed.
function EnterpriseActivationSection({ orgId }: { orgId: string }) {
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [billing, setBilling] = useState<EnterpriseBillingAccount | null>(null);
  const [contracts, setContracts] = useState<EnterpriseContract[]>([]);
  const [billingContactEmail, setBillingContactEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [startingCheckout, setStartingCheckout] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const foundQuoteId = await getMyOrganizationOriginatingQuoteId(orgId);
      if (cancelled) return;
      setQuoteId(foundQuoteId);
      if (foundQuoteId) {
        const [status, contractRows] = await Promise.all([getMyEnterpriseBillingStatus(foundQuoteId), getContractsForQuote(foundQuoteId)]);
        if (cancelled) return;
        setBilling(status);
        setContracts(contractRows);
        if (status?.billingContactEmail) setBillingContactEmail(status.billingContactEmail);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  // D9 — "Display: ... Agreement pending/executed..." derived from
  // the real enterprise_contracts rows this Director can see (RLS
  // only shows presented-or-later ones, migration 115), never an
  // invented frontend indicator. No contracts at all means no
  // agreement was required for this quote -- shown as nothing extra.
  const unexecutedContract = contracts.find((c) => c.status !== 'executed' && c.status !== 'void');

  const startCheckout = async () => {
    if (!quoteId) return;
    if (!billingContactEmail.trim()) { toast.error('Enter a billing contact email.'); return; }
    setStartingCheckout(true);
    try {
      const { url, error } = await startEnterpriseCheckout(quoteId, billingContactEmail.trim());
      if (error || !url) { toast.error(error ?? 'Could not start checkout.'); return; }
      window.location.href = url;
    } finally {
      setStartingCheckout(false);
    }
  };

  if (loading || !quoteId) return null;

  if (billing?.status === 'past_due' || billing?.status === 'canceled') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        Your Enterprise payment is {billing.status === 'past_due' ? 'past due' : 'canceled'}. Contact the Platform Owner to resolve billing and reactivate your license.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-ent-line bg-ent-bg p-4 space-y-3">
      <p className="text-sm font-semibold text-ent-ink">Activate your Enterprise license</p>
      <p className="text-xs text-ent-muted">
        Your application was approved, but your license stays proposed until Enterprise payment is confirmed. Enter a billing contact email and proceed to a secure Stripe checkout for the exact terms on your accepted quote.
      </p>
      {unexecutedContract && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
          Agreement status: <strong>{unexecutedContract.status === 'presented' ? 'pending your signature/execution' : 'preparing'}</strong>. Your license will not activate until this is complete, even after payment.
        </div>
      )}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-ent-ink">
          Billing contact email
          <input type="email" value={billingContactEmail} onChange={(e) => setBillingContactEmail(e.target.value)} placeholder="billing@yourorganization.com" className={`${inputCls} mt-1`} />
        </label>
      </div>
      <button type="button" onClick={() => { void startCheckout(); }} disabled={startingCheckout} className="px-4 py-2 rounded-xl bg-ent-bronze hover:opacity-90 text-white text-sm font-semibold disabled:opacity-60">
        {startingCheckout ? 'Starting checkout…' : 'Proceed to payment'}
      </button>
      <p className="text-[11px] text-ent-muted">
        {billing ? 'A checkout session was started previously but payment has not yet completed — starting again is safe.' : 'This calls out to Stripe; no charge happens until you complete payment there.'}
      </p>
    </div>
  );
}

// OWNER DIRECTIVE MMA-ENT-SALES-003 §6 (Phase H) — "Director... may
// use hosted payment method update if billing permission allows."
// Shown only once a license is genuinely active under confirmed
// payment; a quote-less (legacy CreateOrgCard) organization has no
// Stripe customer to manage and sees nothing extra here.
function EnterpriseBillingManagementSection({ orgId }: { orgId: string }) {
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const foundQuoteId = await getMyOrganizationOriginatingQuoteId(orgId);
      if (!cancelled) setQuoteId(foundQuoteId);
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  const openPortal = async () => {
    if (!quoteId) return;
    setOpening(true);
    try {
      const { url, error } = await openEnterpriseBillingPortal(quoteId);
      if (error || !url) { toast.error(error ?? 'Could not open billing portal.'); return; }
      window.location.href = url;
    } finally {
      setOpening(false);
    }
  };

  if (!quoteId) return null;

  return (
    <button type="button" onClick={() => { void openPortal(); }} disabled={opening} className="px-3 py-2 rounded-lg border border-ent-line text-ent-ink text-sm font-semibold hover:bg-ent-pale disabled:opacity-60">
      {opening ? 'Opening…' : 'Manage billing & payment method'}
    </button>
  );
}

const AMENDMENT_TYPE_LABEL: Record<AmendmentRequestType, string> = {
  expansion: 'Expansion (more seats/capacity)', renewal: 'Renewal', downgrade: 'Downgrade', cancellation: 'Cancellation',
};
const AMENDMENT_STATUS_STYLE: Record<string, string> = {
  pending: 'text-amber-700 bg-amber-100', quoted: 'text-ent-green bg-ent-green-active',
  rejected: 'text-ent-rust bg-ent-rust/10', withdrawn: 'text-ent-muted bg-ent-pale', completed: 'text-ent-green bg-ent-green-active',
};

// OWNER DIRECTIVE MMA-ENT-SALES-006 Phase H5/I1 — a Director requests
// an expansion/renewal/downgrade/cancellation; the Platform Owner
// reviews it elsewhere (PlatformOwnerAdminPage). Once quoted, the
// SAME checkout flow already built for initial activation lets the
// Director pay for it (migration 114 is what makes that work for an
// amendment quote specifically). Only renders for an organization
// with an already-active license -- an org whose license is still
// 'proposed' uses EnterpriseActivationSection instead.
function AmendmentRequestSection({ orgId }: { orgId: string }) {
  const [requests, setRequests] = useState<OrganizationAmendmentRequest[]>([]);
  const [quoted, setQuoted] = useState<OrganizationAmendmentRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [requestType, setRequestType] = useState<AmendmentRequestType>('expansion');
  const [details, setDetails] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [billingEmail, setBillingEmail] = useState('');
  const [startingCheckout, setStartingCheckout] = useState(false);

  const refresh = useCallback(async () => {
    const [all, quotedOne] = await Promise.all([getMyOrgAmendmentRequests(orgId), getMyQuotedAmendmentForOrg(orgId)]);
    setRequests(all);
    setQuoted(quotedOne);
    setLoading(false);
  }, [orgId]);
  useEffect(() => { void refresh(); }, [refresh]);

  const submit = async () => {
    if (!details.trim() && requestType !== 'cancellation') { toast.error('Describe what you need.'); return; }
    setSubmitting(true);
    try {
      const { error } = await requestOrganizationAmendment(orgId, requestType, { description: details.trim() }, notes.trim() || null);
      if (error) { toast.error(error); return; }
      toast.success('Request submitted to the Platform Owner.');
      setFormOpen(false);
      setDetails('');
      setNotes('');
      await refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const withdraw = async (id: string) => {
    const { error } = await withdrawAmendmentRequest(id);
    if (error) { toast.error(error); return; }
    toast.success('Request withdrawn.');
    await refresh();
  };

  const payForAmendment = async () => {
    if (!quoted?.resultingQuoteId) return;
    if (!billingEmail.trim()) { toast.error('Enter a billing contact email.'); return; }
    setStartingCheckout(true);
    try {
      const { url, error } = await startEnterpriseCheckout(quoted.resultingQuoteId, billingEmail.trim());
      if (error || !url) { toast.error(error ?? 'Could not start checkout.'); return; }
      window.location.href = url;
    } finally {
      setStartingCheckout(false);
    }
  };

  if (loading) return null;

  return (
    <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-5 sm:p-6 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-bold text-ent-ink">Expansion, Renewal &amp; Cancellation</h2>
        {!formOpen && !quoted && (
          <button type="button" onClick={() => setFormOpen(true)} className="px-3 py-2 rounded-lg border border-ent-line text-ent-ink text-sm font-semibold hover:bg-ent-pale">
            Request a change
          </button>
        )}
      </div>
      <p className="text-xs text-ent-muted">
        You can request a change to your Enterprise license here, but only the Platform Owner can price it, approve it, or alter your entitlements.
      </p>

      {quoted && (
        <div className="rounded-xl border border-ent-line bg-ent-bg p-4 space-y-3">
          <p className="text-sm font-semibold text-ent-ink">A quote is ready for your {AMENDMENT_TYPE_LABEL[quoted.requestType].toLowerCase()} request</p>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-ent-ink">
              Billing contact email
              <input type="email" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} placeholder="billing@yourorganization.com" className={`${inputCls} mt-1`} />
            </label>
          </div>
          <button type="button" onClick={() => { void payForAmendment(); }} disabled={startingCheckout} className="px-4 py-2 rounded-xl bg-ent-bronze hover:opacity-90 text-white text-sm font-semibold disabled:opacity-60">
            {startingCheckout ? 'Starting checkout…' : 'Proceed to payment'}
          </button>
        </div>
      )}

      {formOpen && (
        <div className="p-3 bg-ent-bg rounded-xl border border-ent-line space-y-2">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-ent-ink">
              What do you need?
              <select value={requestType} onChange={(e) => setRequestType(e.target.value as AmendmentRequestType)} className={`${inputCls} mt-1`}>
                {Object.entries(AMENDMENT_TYPE_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
          </div>
          {requestType !== 'cancellation' && (
            <div className="space-y-1">
              <label className="block text-xs font-medium text-ent-ink">
                Describe what you need (seats, capacity, timing, etc.)
                <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={2} className={`${inputCls} mt-1`} />
              </label>
            </div>
          )}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-ent-ink">
              Additional notes (optional)
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputCls} mt-1`} />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => { void submit(); }} disabled={submitting} className="px-4 py-2 rounded-xl bg-ent-bronze hover:opacity-90 text-white text-sm font-semibold disabled:opacity-60">
              {submitting ? 'Submitting…' : 'Submit request'}
            </button>
            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-xl border border-ent-line text-ent-ink text-sm font-semibold">Cancel</button>
          </div>
        </div>
      )}

      {requests.length > 0 && (
        <div className="space-y-1.5">
          {requests.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-ent-ink">{AMENDMENT_TYPE_LABEL[r.requestType]} — {new Date(r.createdAt).toLocaleDateString()}</span>
              <span className="flex items-center gap-2">
                <span className={`font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${AMENDMENT_STATUS_STYLE[r.status] ?? ''}`}>{r.status}</span>
                {r.status === 'pending' && (
                  <button type="button" onClick={() => { void withdraw(r.id); }} className="text-ent-rust hover:underline font-semibold">Withdraw</button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// PACKAGE 1 (migration 143) — org_configure_license() is now
// service_role-only; a Director can no longer self-declare their own
// org's licensed seats/capacity/fee/per-role caps with no real
// payment, quote, or Platform Owner review behind the numbers. This
// card used to offer a "Configure" control calling that RPC directly
// for a 'proposed' (not-yet-active) license -- removed entirely (it
// would now always fail with a permission error) rather than left as
// a dead button. The real, intended path for these numbers is the
// commercial pipeline this organization's EnterpriseActivationSection
// below already surfaces (the originating quote, billing status,
// required agreements, checkout) for a NEW license, and the existing
// director_request_organization_amendment() flow for a CHANGE to an
// ALREADY-active one -- never a direct, unreviewed client call.
function LicenseCard({ orgId, license }: { orgId: string; license: OrgLicense | null }) {
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
      {license?.licenseNumber && (
        <p className="text-sm font-mono text-ent-ink bg-ent-pale rounded-lg px-3 py-2 inline-block">
          License {license.licenseNumber}
        </p>
      )}
      <p className="text-xs text-ent-muted">
        {license?.status === 'active'
          ? 'This license is active under a confirmed commercial agreement. Seats, capacity, and fee are set from that agreement and cannot be self-edited — use "Expansion, Renewal & Cancellation" below to request a change from the Platform Owner.'
          : 'Seats, capacity, and fee are proposed commercial terms set from your originating quote and cannot be self-edited here. Activation happens automatically once Enterprise payment and the required agreements are confirmed — see below; this status also controls whether covered patients actually receive Full Support.'}
      </p>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm text-ent-ink space-y-0.5">
          <p>Seats: <strong>{license?.licensedSeats ?? 'Not configured'}</strong></p>
          <p>Patient capacity: <strong>{license?.coveredPatientCapacity ?? 'Not configured'}</strong></p>
          <p>Proposed annual fee: <strong>{license?.annualLicenseFee != null ? `$${license.annualLicenseFee.toFixed(2)}` : 'Not configured'}</strong></p>
          {(license?.maxCaregiverSeats != null || license?.maxMedicalProfessionalSeats != null || license?.maxTherapistSeats != null || license?.maxBillingAdminSeats != null) && (
            <p className="text-xs text-ent-muted">
              Per-office caps:{' '}
              {[
                license?.maxCaregiverSeats != null && `Caregivers ${license.maxCaregiverSeats}`,
                license?.maxMedicalProfessionalSeats != null && `Medical ${license.maxMedicalProfessionalSeats}`,
                license?.maxTherapistSeats != null && `Therapists ${license.maxTherapistSeats}`,
                license?.maxBillingAdminSeats != null && `Billing Admins ${license.maxBillingAdminSeats}`,
              ].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        {license?.status === 'active' && <EnterpriseBillingManagementSection orgId={orgId} />}
      </div>
      {license?.status === 'proposed' && <EnterpriseActivationSection orgId={orgId} />}
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
        The invited person must already have an account associated with this email — no invitation email is sent; they will see it waiting when they next sign in.
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

// MMA-P1-FINAL-CLOSURE Priority 3 — the Director closure workflow lives
// here: mandatory reason + notes, routed exclusively through
// close_patient_coverage() (the one authoritative RPC — see migration
// 148's retirement of the legacy end_patient_coverage() bypass; this UI
// never calls that legacy path). Closed/archived patients remain
// visible below, read-only, with their closure/archival state — never
// silently removed from view.
function CloseCoverageDialog({ orgId, patientId, patientName, onClose, onClosed }: {
  orgId: string; patientId: string; patientName: string; onClose: () => void; onClosed: () => void;
}) {
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!reason.trim() || !notes.trim()) { toast.error('A closure reason and explanatory notes are both required.'); return; }
    setSaving(true);
    try {
      const { error } = await closePatientCoverage(orgId, patientId, reason.trim(), notes.trim());
      if (error) { toast.error(error); return; }
      toast.success(`Coverage for ${patientName} has been closed.`);
      onClosed();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-ent-panel rounded-2xl shadow-lg border border-ent-line p-5 sm:p-6 space-y-3 max-w-md w-full">
        <h2 className="font-bold text-ent-ink">Close coverage for {patientName}</h2>
        <p className="text-xs text-ent-muted">
          This ends your organization&apos;s active coverage of this patient. The patient&apos;s record is preserved, never deleted,
          and is automatically archived after the approved retention interval. Closing one organization&apos;s coverage never
          affects this patient&apos;s relationship with any other organization.
        </p>
        <label className="block text-xs font-semibold text-ent-muted">Closure reason (required)</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} placeholder="e.g. Care no longer needed" />
        <label className="block text-xs font-semibold text-ent-muted">Explanatory notes (required)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputCls} min-h-[80px]`} placeholder="Describe the circumstances of this closure" />
        {!confirming ? (
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg border border-ent-line text-ent-ink text-xs font-semibold hover:bg-ent-ivory">Cancel</button>
            <button
              type="button"
              onClick={() => { if (!reason.trim() || !notes.trim()) { toast.error('A closure reason and explanatory notes are both required.'); return; } setConfirming(true); }}
              className="px-3 py-1.5 rounded-lg bg-ent-bronze hover:opacity-90 text-white text-xs font-semibold"
            >
              Continue
            </button>
          </div>
        ) : (
          <div className="p-3 bg-red-50 rounded-xl border border-red-200 space-y-2">
            <p className="text-sm text-ent-ink">Confirm closing coverage for {patientName}? This cannot be undone from this screen.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirming(false)} className="px-3 py-1.5 rounded-lg border border-ent-line text-ent-ink text-xs font-semibold hover:bg-ent-ivory">Back</button>
              <button type="button" onClick={() => { void submit(); }} disabled={saving} className="px-3 py-1.5 rounded-lg border border-red-300 text-red-600 text-xs font-semibold hover:bg-red-50 disabled:opacity-60">
                {saving ? 'Closing…' : 'Confirm closure'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CoveredPatientsCard({ orgId }: { orgId: string }) {
  const [patients, setPatients] = useState<OrgCoveredPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [closingTarget, setClosingTarget] = useState<OrgCoveredPatient | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    getOrgCoveredPatients(orgId).then((rows) => { setPatients(rows); setLoading(false); });
  }, [orgId]);

  useEffect(() => { refresh(); }, [refresh]);

  const active = patients.filter((p) => p.status === 'active');
  const closedOrArchived = patients.filter((p) => p.status === 'closed' || p.status === 'archived');

  return (
    <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-5 sm:p-6 space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardList className="w-5 h-5 text-ent-bronze" />
        <h2 className="font-bold text-ent-ink">Covered Patients ({active.length})</h2>
      </div>
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-ent-bronze" />
      ) : active.length === 0 ? (
        <p className="text-sm text-ent-muted">No patients are currently covered by this organization. Caregiver staff register and automatically cover patients from their own dashboard.</p>
      ) : (
        <ul className="space-y-2">
          {active.map((p) => (
            <li key={p.patientId} className="flex items-center justify-between gap-2 p-3 bg-ent-bg rounded-xl border border-ent-line text-sm font-medium text-ent-ink">
              <span>{p.preferredName || `${p.firstName} ${p.lastName}`}</span>
              <button type="button" onClick={() => setClosingTarget(p)} className="px-2.5 py-1 rounded-lg border border-ent-line text-xs font-semibold text-ent-rust hover:bg-red-50 flex-shrink-0">
                Close coverage
              </button>
            </li>
          ))}
        </ul>
      )}
      {closedOrArchived.length > 0 && (
        <div className="pt-2 border-t border-ent-line space-y-2">
          <p className="text-xs font-semibold text-ent-muted uppercase tracking-wide">Closed / Archived</p>
          <ul className="space-y-1.5">
            {closedOrArchived.map((p) => (
              <li key={p.patientId} className="p-2.5 bg-ent-bg rounded-xl border border-ent-line text-xs text-ent-muted">
                <span className="font-semibold text-ent-ink">{p.preferredName || `${p.firstName} ${p.lastName}`}</span>
                {' — '}
                <span className="capitalize">{p.status}</span>
                {p.closedAt ? ` · closed ${new Date(p.closedAt).toLocaleDateString()}` : ''}
                {p.status === 'closed' && p.scheduledArchivalAt ? ` · scheduled archival ${new Date(p.scheduledArchivalAt).toLocaleDateString()}` : ''}
                {p.status === 'archived' && p.archivedAt ? ` · archived ${new Date(p.archivedAt).toLocaleDateString()}` : ''}
                {p.closureReason ? ` · reason: ${p.closureReason}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {closingTarget && (
        <CloseCoverageDialog
          orgId={orgId} patientId={closingTarget.patientId}
          patientName={closingTarget.preferredName || `${closingTarget.firstName} ${closingTarget.lastName}`}
          onClose={() => setClosingTarget(null)}
          onClosed={() => { setClosingTarget(null); refresh(); }}
        />
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

// Codex MMA-CODEX-10 — migration 087 made 'director' a legal
// conversation participant (is_org_director_for_patient(), narrowly
// scoped to the director's own org's actively-covered patients), but no
// UI anywhere ever let a director actually open or send a message in
// one -- the aggregate-only CommunicationsOverviewCard above was the
// entire surface. This closes that gap by reusing CareConversations
// verbatim (the same component every other office uses) for a director-
// chosen covered patient. All authorization is unchanged and still
// entirely server-side: is_org_director_for_patient() is re-derived live
// on every call CareConversations makes, so this is a real UI wire-up,
// not a new access path.
function DirectorCommunicationsView({ orgId }: { orgId: string }) {
  const [patients, setPatients] = useState<{ patientId: string; firstName: string; lastName: string; preferredName: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [openPatientId, setOpenPatientId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // MMA-P1-FINAL-CLOSURE Priority 3: getOrgCoveredPatients() now
    // returns every lifecycle status; a closed/archived patient is never
    // a valid target to open or start a NEW conversation about here.
    getOrgCoveredPatients(orgId).then((rows) => { if (!cancelled) { setPatients(rows.filter((r) => r.status === 'active')); setLoading(false); } });
    return () => { cancelled = true; };
  }, [orgId]);

  if (openPatientId) {
    const p = patients.find((x) => x.patientId === openPatientId);
    return (
      <div className="space-y-3">
        <button type="button" onClick={() => setOpenPatientId(null)} className="text-xs font-semibold text-ent-bronze hover:underline">&larr; Back to communications</button>
        <CareConversations patientId={openPatientId} patientName={p?.preferredName || `${p?.firstName ?? ''} ${p?.lastName ?? ''}`.trim()} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CommunicationsOverviewCard orgId={orgId} />
      <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-5 sm:p-6 space-y-3">
        <h2 className="font-bold text-ent-ink">Open a patient conversation</h2>
        <p className="text-xs text-ent-muted">
          As director you may participate in a conversation for any patient this organization actively covers. This does not grant
          access to a conversation you have not joined — selecting a patient here opens or starts one, scoped to that patient only.
        </p>
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin text-ent-bronze" />
        ) : patients.length === 0 ? (
          <p className="text-sm text-ent-muted">No patients are currently covered by this organization.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {patients.map((p) => (
              <button
                key={p.patientId} type="button" onClick={() => setOpenPatientId(p.patientId)}
                className="flex items-center justify-between gap-2 p-3.5 bg-ent-bg rounded-xl border border-ent-line hover:shadow-sm transition-all text-left"
              >
                <span className="font-bold text-ent-ink text-sm truncate">{p.preferredName || `${p.firstName} ${p.lastName}`}</span>
                <ChevronRight className="w-4 h-4 text-ent-bronze flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
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
      // A closed/archived patient is never a valid NEW assignment target.
      setCoveredPatients(p.filter((r) => r.status === 'active'));
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
  | 'operations' | 'incidents' | 'communications' | 'reports' | 'licensing' | 'ownership' | 'settings';

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
  // MMA-P1-FINAL-CLOSURE Priority 2 — always present in the nav (so the
  // tab's own content can explain, to a non-owner, why it is empty),
  // but its content is gated inside OwnershipView on am_i_org_owner() —
  // never by hiding the tab, which would just be a different way of
  // "a hidden button is not authorization" (this directive's own
  // standard applies equally to showing a denial message vs an action).
  { key: 'ownership', label: 'Organization Ownership', icon: ShieldAlert },
  { key: 'settings', label: 'Organization Settings', icon: SettingsIcon },
];
const DIRECTOR_NAV_GROUPS: OfficeNavGroup<DirectorNavKey>[] = [
  { label: 'ORGANIZATION', items: ['dashboard', 'overview', 'applications', 'staff', 'patients'] },
  { label: 'CARE OPERATIONS', items: ['assignments', 'scheduling', 'operations', 'incidents', 'communications'] },
  { label: 'ADMINISTRATION', items: ['reports', 'licensing', 'ownership', 'settings'] },
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

  const [evidenceText, setEvidenceText] = useState('');
  const isCredentialVerified = app.credential_verification_status === 'independently_verified';

  const approve = async () => {
    setBusy(true);
    try {
      const { error } = await directorApproveApplication(app.id);
      if (error) { toast.error(error); return; }
      toast.success('Application approved.');
      onChanged(); onBack();
    } finally { setBusy(false); }
  };
  // MASTER ENTERPRISE COMPLETION DIRECTIVE §1.C — a distinct act from
  // approve(): confirms the credential itself was checked, separate
  // from the administrative decision to approve. The server refuses
  // approve() entirely until this has run and recorded
  // 'independently_verified' — this button is not merely a UI nicety,
  // it is the only path to satisfying that server-side gate.
  const verifyCredential = async (decision: 'independently_verified' | 'insufficient') => {
    if (!evidenceText.trim()) { toast.error('Describe what you checked to reach this decision.'); return; }
    setBusy(true);
    try {
      const { error } = await recordCredentialVerification(app.id, decision, evidenceText.trim());
      if (error) { toast.error(error); return; }
      toast.success(decision === 'independently_verified' ? 'Credential marked independently verified.' : 'Credential marked insufficient.');
      setEvidenceText('');
      onChanged();
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
          {!isCredentialVerified && (
            <div className="bg-ent-amber/10 border border-ent-amber/30 rounded-xl p-3 space-y-2">
              <p className="text-sm font-semibold text-ent-ink">Credential verification required before approval</p>
              <p className="text-xs text-ent-muted">Describe what you independently checked (e.g. a licensing-board lookup, a document review) — this is a separate, audited decision from approving the application itself.</p>
              <input value={evidenceText} onChange={(e) => setEvidenceText(e.target.value)} placeholder="What did you check, and what did you find?" className={`${inputCls} w-full`} />
              <div className="flex gap-2">
                <button type="button" onClick={() => { void verifyCredential('independently_verified'); }} disabled={busy} className="px-3 py-2 rounded-xl bg-ent-forest hover:opacity-90 text-white text-sm font-semibold disabled:opacity-60">
                  Mark Independently Verified
                </button>
                <button type="button" onClick={() => { void verifyCredential('insufficient'); }} disabled={busy} className="px-3 py-2 rounded-xl border border-ent-line text-ent-ink text-sm font-semibold hover:bg-ent-pale">
                  Mark Insufficient
                </button>
              </div>
            </div>
          )}
          <button type="button" onClick={() => { void approve(); }} disabled={busy || !isCredentialVerified} title={isCredentialVerified ? undefined : 'The credential must be independently verified first'} className="w-full py-2.5 rounded-xl bg-ent-bronze hover:opacity-90 text-white text-sm font-semibold disabled:opacity-60">
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

function SchedulingOversightView({ visits, loadError }: { visits: OrgVisit[]; loadError?: string | null }) {
  return (
    <OfficeCard>
      <div className="flex items-center gap-2"><CalendarClock className="w-5 h-5 text-ent-bronze" /><h2 className="font-bold text-ent-ink">Scheduling Oversight</h2></div>
      {visits.length === 0 ? (
        loadError ? (
          <p className="text-sm text-gentle-coral font-semibold">Visits could not be confirmed right now — this is not a statement that none are scheduled.</p>
        ) : (
          <p className="text-sm text-ent-text">No visits have been scheduled yet across your organization.</p>
        )
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

function CareOperationsView({ handoffs, loadError }: { handoffs: OrgShiftHandoff[]; loadError?: string | null }) {
  return (
    <OfficeCard>
      <div className="flex items-center gap-2"><ClipboardCheck className="w-5 h-5 text-ent-bronze" /><h2 className="font-bold text-ent-ink">Care Operations</h2></div>
      <p className="text-sm text-ent-text">Recent shift handoffs across your organization.</p>
      {handoffs.length === 0 ? (
        loadError ? (
          <p className="text-sm text-gentle-coral font-semibold">Shift handoffs could not be confirmed right now — this is not a statement that none are recorded.</p>
        ) : (
          <p className="text-sm text-ent-text">No shift handoffs recorded yet.</p>
        )
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

function IncidentsView({ incidents, onResolved, loadError }: { incidents: OrgIncidentReport[]; onResolved: () => void; loadError?: string | null }) {
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
        loadError ? (
          <p className="text-sm text-gentle-coral font-semibold">Incidents could not be confirmed right now — this is not a statement that none have been reported.</p>
        ) : (
          <p className="text-sm text-ent-text">No incidents have been reported across your organization.</p>
        )
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

// MMA-P1-FINAL-CLOSURE Priority 2 — Organization Owner controls.
// Backend (migration 144) has existed since the prior session; this is
// its first application UI. Gated on am_i_org_owner(), re-verified
// server-side by every mutation this view performs — a non-owner seeing
// this tab (everyone does; see the nav-item comment above) gets an
// explanatory denial, never a disabled-looking action.
const CAPABILITY_LABEL: Record<OwnerCapability, string> = {
  caregiver: 'Caregiver', therapist: 'Therapist', medical_professional: 'Medical Professional', billing_admin: 'Billing Admin',
};

function OwnershipView({ orgId }: { orgId: string }) {
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [grants, setGrants] = useState<OwnerCapabilityGrant[]>([]);
  const [busy, setBusy] = useState<OwnerCapability | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const owner = await amIOrgOwner(orgId);
      setIsOwner(owner);
      setGrants(owner ? await getMyOwnerCapabilityGrants(orgId) : []);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const activeFor = (capability: OwnerCapability) => grants.find((g) => g.capability === capability && g.status === 'active');

  const toggle = async (capability: OwnerCapability, currentlyActive: boolean) => {
    setBusy(capability);
    try {
      const { error } = currentlyActive ? await ownerRevokeOwnCapability(orgId, capability) : await ownerSelfAssignCapability(orgId, capability);
      if (error) { toast.error(error); return; }
      toast.success(currentlyActive ? `${CAPABILITY_LABEL[capability]} capability revoked.` : `${CAPABILITY_LABEL[capability]} capability self-assigned.`);
      void refresh();
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-ent-forest" /></div>;

  if (!isOwner) {
    return (
      <OfficeCard>
        <div className="flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-ent-bronze" /><h2 className="font-bold text-ent-ink">Organization Ownership</h2></div>
        <p className="text-sm text-ent-text">
          This section is available only to this organization&apos;s Owner. Director authority and Owner authority are
          distinct — holding Director access does not, by itself, grant Owner capability self-assignment.
        </p>
      </OfficeCard>
    );
  }

  return (
    <OfficeCard>
      <div className="flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-ent-bronze" /><h2 className="font-bold text-ent-ink">Organization Ownership</h2></div>
      <p className="text-sm text-ent-text">
        As this organization&apos;s Owner, you may explicitly self-assign operational capability within this organization.
        Ownership alone grants no clinical access — each capability below must be deliberately assigned, is scoped to
        this organization only, remains subject to active patient coverage and license status, and is fully auditable.
      </p>
      <ul className="space-y-2">
        {OWNER_CAPABILITIES.map((capability) => {
          const grant = activeFor(capability);
          const active = !!grant;
          return (
            <li key={capability} className="flex items-center justify-between gap-3 p-3 bg-ent-bg rounded-xl border border-ent-line">
              <div>
                <p className="font-semibold text-ent-ink">{CAPABILITY_LABEL[capability]}</p>
                <p className="text-xs text-ent-muted">
                  {active ? `Self-assigned ${new Date(grant.grantedAt).toLocaleDateString()}` : 'Not currently self-assigned'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { void toggle(capability, active); }}
                disabled={busy === capability}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60 ${
                  active ? 'border border-red-300 text-red-600 hover:bg-red-50' : 'bg-ent-bronze hover:opacity-90 text-white'
                }`}
              >
                {busy === capability ? 'Working…' : active ? 'Revoke' : 'Self-assign'}
              </button>
            </li>
          );
        })}
      </ul>
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
  // MMA-CODEX-011 finding 011-03 (NAV-06/F-18, P1): getOrgVisits/
  // getOrgIncidentReports/getOrgShiftHandoffs (all plain) discarded
  // their error and returned [] on failure, which Scheduling Oversight
  // (and Incidents & Escalations / handoff-adjacent views) then
  // rendered as an authoritative "no visits/incidents/handoffs" --
  // independently reproduced by the audit: a known real visit existing,
  // with the read faulted, still produced the successful-empty message.
  const [loadError, setDirectorLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [lic, mem, orgs, covered, v, inc, hoffs] = await Promise.all([
        getOrgLicense(organizationId),
        getOrgMembers(organizationId),
        getMyOrganizations(),
        getOrgCoveredPatients(organizationId),
        getOrgVisitsResult(organizationId),
        getOrgIncidentReportsResult(organizationId),
        getOrgShiftHandoffsResult(organizationId),
      ]);
      const org = orgs.find((o) => o.organizationId === organizationId);
      setLicense(lic);
      setMembers(mem);
      setOrgName(org?.organizationName ?? '');
      setPackageType(org?.packageType ?? 'integrated_care');
      setCoveredCount(covered.filter((r) => r.status === 'active').length);
      setVisits(v.data ?? []);
      setIncidents(inc.data ?? []);
      setHandoffs(hoffs.data ?? []);
      const errors = [v.error, inc.error, hoffs.error].filter((e): e is string => !!e);
      setDirectorLoadError(errors.length > 0 ? errors[0] : null);
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
      {!loading && loadError && (nav === 'dashboard' || nav === 'scheduling' || nav === 'operations' || nav === 'incidents' || nav === 'reports') && (
        <div role="alert" className="mb-4 p-3 rounded-xl bg-gentle-coral/10 border border-gentle-coral/30 flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm text-gentle-coral font-medium">Some organization data could not be loaded: {loadError} — counts/lists on this page may be incomplete, not confirmed empty.</p>
          <button type="button" onClick={() => { void refresh(); }} className="text-sm font-semibold text-ent-forest hover:underline flex-shrink-0">Retry</button>
        </div>
      )}
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
        <SchedulingOversightView visits={visits} loadError={loadError} />
      ) : nav === 'operations' ? (
        <CareOperationsView handoffs={handoffs} loadError={loadError} />
      ) : nav === 'incidents' ? (
        <IncidentsView incidents={incidents} onResolved={() => { void refresh(); }} loadError={loadError} />
      ) : nav === 'communications' ? (
        <DirectorCommunicationsView orgId={organizationId} />
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
            <LicenseCard orgId={organizationId} license={license} />
            {license?.status === 'active' && <AmendmentRequestSection orgId={organizationId} />}
            <button type="button" onClick={() => setBillingOpen(true)} className="flex items-center gap-1.5 text-sm font-semibold text-ent-bronze hover:underline">
              Open Billing &amp; Add-Ons <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )
      ) : nav === 'ownership' ? (
        <OwnershipView orgId={organizationId} />
      ) : nav === 'settings' ? (
        <OrganizationSettingsView orgName={orgName} packageType={packageType} onOpenBilling={() => { setNav('licensing'); setBillingOpen(true); }} />
      ) : null}
    </EnterpriseOfficeShell>
  );
}

export { CreateOrgCard };
