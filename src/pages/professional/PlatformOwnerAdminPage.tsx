// MASTER ENTERPRISE IDENTITY DIRECTIVE §10 — Platform Owner backend
// administration. Gated client-side by profiles.role IN
// ('admin','superadmin') for presentation only — every actual action
// independently re-verifies is_platform_owner() server-side inside its
// own RPC (migration 083), so this client check is a UX convenience,
// never the real security boundary. RLS on professional_applications/
// organization_memberships/organizations already restricts every read
// here to a real Platform Owner regardless of what this component does.
import { useEffect, useState, useCallback } from 'react';
import { useApp } from '@/store/useApp';
import { supabase } from '@/lib/supabase';
import { NotificationBell } from '@/components/enterprise/NotificationBell';
import { toast } from 'sonner';
import { Loader2, Sparkles, LogOut, ShieldCheck, Search, Building2, Plus, Send, Ban, FileText, Copy, KeyRound } from 'lucide-react';
import {
  getDirectorApplications, platformOwnerApproveDirectorApplication, rejectApplication, requestApplicationCorrections,
  platformOwnerCorrectOfficeClassification, platformOwnerResolveManualReview, getApplicationEvents, type ProfessionalApplication,
} from '@/services/professionalApplicationService';
import { getPendingAccountDeletionRequests, platformOwnerReviewAccountDeletion, type AccountDeletionRequest } from '@/services/accountDeletionService';
import { findSimilarOrganizations } from '@/services/organizationService';
import {
  getAllAmendmentRequests, rejectAmendmentRequest, approveCancellationRequest, quoteAmendmentRequest,
  type OrganizationAmendmentRequest, type AmendmentRequestType,
} from '@/services/organizationAmendmentService';
import {
  getAllLicenseTiers, platformOwnerSetLicenseTierPrice, platformOwnerSetLicenseTierPublished,
  getAllCoupons, platformOwnerCreateCoupon, platformOwnerSetCouponStatus, platformOwnerSetCouponLimit,
  type LicenseTierAdmin, type CouponAdmin,
} from '@/services/licenseTierAdminService';
import {
  getContractsForQuote, createContract, presentContract, recordContractExecution, voidContract,
  type EnterpriseContract, type ContractType,
} from '@/services/enterpriseContractService';
import {
  getSalesProspects, createProspect, getSalesQuotes, createQuote, sendQuote, revokeQuote,
  getQuoteInvitations, issueQuoteInvitation, revokeQuoteInvitation, getQuoteWithAncestry,
  type SalesProspect, type SalesQuote, type SalesQuoteInvitation, type SalesPackageType,
} from '@/services/salesService';

const inputCls = 'w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ent-bronze border-ent-line bg-ent-panel';

interface MembershipRow { id: string; organization_id: string; org_role: string; status: string; organizations: { name: string } | null }

const CORRECTABLE_STEPS: { key: string; label: string }[] = [
  { key: 'step1', label: 'Legal Entity' }, { key: 'step2', label: 'Director' }, { key: 'step3', label: 'Package' },
  { key: 'step4', label: 'Operations' }, { key: 'step5', label: 'Billing' }, { key: 'step6', label: 'Review' },
];

// OWNER DIRECTIVE MMA-ENT-SALES-003 §3 (Phase E) — "submitted version
// inspection": a generic, field-order-preserving renderer for the raw
// six-step wizard snapshot (application_details) rather than
// hardcoding every one of D1-D6's field names here a second time --
// this is strictly a read-only review surface, so a label derived from
// the key is sufficient and never falls out of sync with the wizard.
function titleCaseFromKey(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}
function StepFieldsReadout({ details, stepKey, label }: { details: Record<string, unknown>; stepKey: string; label: string }) {
  const step = details[stepKey] as Record<string, unknown> | undefined;
  if (!step || Object.keys(step).length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-bold text-ent-ink uppercase tracking-wide">{label}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
        {Object.entries(step).map(([k, v]) => (
          <p key={k} className="text-xs text-ent-text truncate">
            <span className="text-ent-muted">{titleCaseFromKey(k)}:</span>{' '}
            <span className="font-medium">{typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v ?? '—')}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

interface ApplicationReviewDetails {
  events: { eventType: string; actorRole: string | null; notes: string | null; createdAt: string }[];
  quoteChain: SalesQuote[];
  duplicateOrgs: { id: string; name: string }[];
}

function DirectorApplicationsPanel({ apps, onChanged }: { apps: ProfessionalApplication[]; onChanged: () => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [correctionOpenId, setCorrectionOpenId] = useState<string | null>(null);
  const [correctionNote, setCorrectionNote] = useState<Record<string, string>>({});
  const [correctionSteps, setCorrectionSteps] = useState<Record<string, Set<string>>>({});
  const [searchText, setSearchText] = useState('');
  const [showAllStatuses, setShowAllStatuses] = useState(false);
  const [detailsOpenId, setDetailsOpenId] = useState<string | null>(null);
  const [detailsCache, setDetailsCache] = useState<Record<string, ApplicationReviewDetails>>({});
  const [detailsLoading, setDetailsLoading] = useState<string | null>(null);
  const [manualReviewNote, setManualReviewNote] = useState<Record<string, string>>({});

  const approve = async (id: string) => {
    setBusyId(id);
    try {
      const { error } = await platformOwnerApproveDirectorApplication(id);
      if (error) { toast.error(error); return; }
      toast.success('Director approved — organization created.');
      onChanged();
    } finally { setBusyId(null); }
  };
  const reject = async (id: string) => {
    const reason = rejectReason[id]?.trim();
    if (!reason) { toast.error('Provide a reason.'); return; }
    setBusyId(id);
    try {
      const { error } = await rejectApplication(id, reason);
      if (error) { toast.error(error); return; }
      toast.success('Application rejected.');
      onChanged();
    } finally { setBusyId(null); }
  };
  // MMA-PROF-ONBOARD-004 -- the Platform Owner's resolution of a
  // self-service application run_automated_application_verification()
  // flagged into exception review (currently: a suspected duplicate
  // organization name). 'confirmed_distinct' proceeds the application
  // to agreements_pending exactly as if verification had passed
  // cleanly; 'rejected' and 'return_for_correction' reuse the SAME
  // rejection-reason/correction-request fields the pending_review path
  // already collects, rather than inventing a second UI for the same
  // two concepts.
  const resolveManualReview = async (id: string, decision: 'confirmed_distinct' | 'rejected' | 'return_for_correction') => {
    const reason = (decision === 'confirmed_distinct' ? manualReviewNote[id] : (decision === 'rejected' ? rejectReason[id] : manualReviewNote[id]))?.trim();
    if (decision !== 'confirmed_distinct' && !reason) { toast.error('Provide a reason.'); return; }
    setBusyId(id);
    try {
      const { error } = await platformOwnerResolveManualReview(id, decision, reason || 'Confirmed as a genuinely distinct organization.');
      if (error) { toast.error(error); return; }
      toast.success(decision === 'confirmed_distinct' ? 'Confirmed distinct — application proceeds to agreements.' : decision === 'rejected' ? 'Application rejected.' : 'Returned for correction.');
      onChanged();
    } finally { setBusyId(null); }
  };

  const toggleStep = (appId: string, stepKey: string) => {
    setCorrectionSteps((prev) => {
      const current = new Set(prev[appId] ?? []);
      if (current.has(stepKey)) current.delete(stepKey); else current.add(stepKey);
      return { ...prev, [appId]: current };
    });
  };
  const requestCorrections = async (id: string) => {
    const note = correctionNote[id]?.trim();
    const steps = Array.from(correctionSteps[id] ?? []);
    if (!note) { toast.error('Describe what needs to change.'); return; }
    if (steps.length === 0) { toast.error('Select at least one step to reopen.'); return; }
    setBusyId(id);
    try {
      const { error } = await requestApplicationCorrections(id, note, { allowedSteps: steps });
      if (error) { toast.error(error); return; }
      toast.success('Correction request sent.');
      setCorrectionOpenId(null);
      onChanged();
    } finally { setBusyId(null); }
  };

  const toggleDetails = async (a: ProfessionalApplication) => {
    if (detailsOpenId === a.id) { setDetailsOpenId(null); return; }
    setDetailsOpenId(a.id);
    if (detailsCache[a.id]) return;
    setDetailsLoading(a.id);
    try {
      const quoteId = (a.applicationDetails as { originatingQuoteId?: string } | undefined)?.originatingQuoteId;
      const [events, quoteChain, duplicateOrgs] = await Promise.all([
        getApplicationEvents(a.id),
        quoteId ? getQuoteWithAncestry(quoteId) : Promise.resolve([]),
        a.proposedOrganizationName ? findSimilarOrganizations(a.proposedOrganizationName) : Promise.resolve([]),
      ]);
      setDetailsCache((prev) => ({ ...prev, [a.id]: { events, quoteChain, duplicateOrgs } }));
    } finally {
      setDetailsLoading(null);
    }
  };

  const basePool = showAllStatuses ? apps : apps.filter((a) => a.status === 'pending_review' || a.status === 'resubmitted' || a.status === 'manual_review');
  const search = searchText.trim().toLowerCase();
  const visible = search
    ? basePool.filter((a) =>
        a.legalName.toLowerCase().includes(search) ||
        (a.proposedOrganizationName ?? '').toLowerCase().includes(search) ||
        a.contactEmail.toLowerCase().includes(search))
    : basePool;

  return (
    <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-5 sm:p-6 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-bold text-ent-ink">Initial Director Applications Awaiting Approval</h2>
        <label className="flex items-center gap-1.5 text-xs text-ent-muted cursor-pointer">
          <input type="checkbox" checked={showAllStatuses} onChange={(e) => setShowAllStatuses(e.target.checked)} />
          Show all statuses (including rejected/withdrawn)
        </label>
      </div>
      <div className="relative">
        <Search className="w-4 h-4 text-ent-muted absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={searchText} onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search by legal name, organization, or email…" className={`${inputCls} pl-9`}
        />
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-ent-text">No Director applications match.</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((a) => {
            const isPendingReview = a.status === 'pending_review' || a.status === 'resubmitted';
            const isManualReview = a.status === 'manual_review';
            const details = detailsCache[a.id];
            return (
            <li key={a.id} className="p-4 bg-ent-bg rounded-xl border border-ent-line space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="font-semibold text-ent-ink">{a.legalName} — proposing &quot;{a.proposedOrganizationName}&quot;</p>
                <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-ent-amber/20 text-ent-amber capitalize">{a.status.replace('_', ' ')}</span>
              </div>
              <p className="text-xs text-ent-muted">{a.contactEmail}{a.contactPhone ? ` · ${a.contactPhone}` : ''} · submitted {new Date(a.createdAt).toLocaleDateString()}</p>
              <p className="text-xs text-ent-muted">Package: {a.proposedPackageType === 'integrated_care' ? 'Enterprise Integrated Care' : 'Enterprise Therapist'}{a.selectedTierCode ? ` · Tier: ${a.selectedTierCode}` : ''}{a.entryMethod ? ` · Entry: ${a.entryMethod.replace('_', ' ')}` : ''}</p>
              {isManualReview && a.exceptionReviewReason && (
                <div className="p-2 bg-ent-amber/10 border border-ent-amber/40 rounded-lg">
                  <p className="text-xs font-semibold text-ent-amber">Automated verification flagged this application:</p>
                  <p className="text-xs text-ent-ink">{a.exceptionReviewReason}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {isPendingReview && (
                  <>
                    <button type="button" onClick={() => { void approve(a.id); }} disabled={busyId === a.id} className="px-3 py-2 rounded-xl bg-ent-bronze hover:opacity-90 text-white text-sm font-semibold disabled:opacity-60">
                      Approve &amp; Activate Director
                    </button>
                    <input value={rejectReason[a.id] ?? ''} onChange={(e) => setRejectReason((p) => ({ ...p, [a.id]: e.target.value }))} placeholder="Rejection reason…" className={`${inputCls} flex-1 min-w-[160px]`} />
                    <button type="button" onClick={() => { void reject(a.id); }} disabled={busyId === a.id} className="px-3 py-2 rounded-xl border border-ent-rust text-ent-rust text-sm font-semibold hover:bg-ent-rust/10">Reject</button>
                    <button type="button" onClick={() => setCorrectionOpenId(correctionOpenId === a.id ? null : a.id)} className="px-3 py-2 rounded-xl border border-ent-line text-ent-ink text-sm font-semibold hover:bg-ent-pale">
                      Request corrections
                    </button>
                  </>
                )}
                {isManualReview && (
                  <>
                    <button type="button" onClick={() => { void resolveManualReview(a.id, 'confirmed_distinct'); }} disabled={busyId === a.id} className="px-3 py-2 rounded-xl bg-ent-bronze hover:opacity-90 text-white text-sm font-semibold disabled:opacity-60">
                      Confirm distinct — proceed to agreements
                    </button>
                    <input value={manualReviewNote[a.id] ?? ''} onChange={(e) => setManualReviewNote((p) => ({ ...p, [a.id]: e.target.value }))} placeholder="Reason (required to reject/return)…" className={`${inputCls} flex-1 min-w-[160px]`} />
                    <button type="button" onClick={() => { void resolveManualReview(a.id, 'rejected'); }} disabled={busyId === a.id} className="px-3 py-2 rounded-xl border border-ent-rust text-ent-rust text-sm font-semibold hover:bg-ent-rust/10">Reject</button>
                    <button type="button" onClick={() => { void resolveManualReview(a.id, 'return_for_correction'); }} disabled={busyId === a.id} className="px-3 py-2 rounded-xl border border-ent-line text-ent-ink text-sm font-semibold hover:bg-ent-pale">
                      Return for correction
                    </button>
                  </>
                )}
                <button type="button" onClick={() => { void toggleDetails(a); }} className="px-3 py-2 rounded-xl border border-ent-line text-ent-ink text-sm font-semibold hover:bg-ent-pale">
                  {detailsOpenId === a.id ? 'Hide details & history' : 'View details & history'}
                </button>
              </div>
              {correctionOpenId === a.id && (
                <div className="p-3 bg-ent-panel rounded-xl border border-ent-line space-y-2">
                  <p className="text-xs font-semibold text-ent-ink">Which steps need to change?</p>
                  <div className="flex flex-wrap gap-2">
                    {CORRECTABLE_STEPS.map((s) => (
                      <label key={s.key} className="flex items-center gap-1.5 text-xs text-ent-ink px-2 py-1 rounded-lg border border-ent-line cursor-pointer">
                        <input type="checkbox" checked={correctionSteps[a.id]?.has(s.key) ?? false} onChange={() => toggleStep(a.id, s.key)} /> {s.label}
                      </label>
                    ))}
                  </div>
                  <textarea
                    value={correctionNote[a.id] ?? ''} onChange={(e) => setCorrectionNote((p) => ({ ...p, [a.id]: e.target.value }))}
                    placeholder="Describe exactly what needs to change in the selected steps…" rows={2} className={inputCls}
                  />
                  <button type="button" onClick={() => { void requestCorrections(a.id); }} disabled={busyId === a.id} className="px-3 py-2 rounded-xl bg-ent-amber hover:opacity-90 text-white text-xs font-semibold disabled:opacity-60">
                    Send correction request
                  </button>
                </div>
              )}
              {detailsOpenId === a.id && (
                <div className="p-3 bg-ent-panel rounded-xl border border-ent-line space-y-3">
                  {detailsLoading === a.id || !details ? (
                    <p className="text-xs text-ent-muted flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading review details…</p>
                  ) : (
                    <>
                      {details.duplicateOrgs.length > 0 && (
                        <div className="p-2 bg-ent-amber/10 border border-ent-amber/40 rounded-lg">
                          <p className="text-xs font-semibold text-ent-amber">Possible duplicate organization — review before approving:</p>
                          {details.duplicateOrgs.map((o) => (
                            <p key={o.id} className="text-xs text-ent-ink">• {o.name}</p>
                          ))}
                        </div>
                      )}
                      {details.quoteChain.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-ent-ink uppercase tracking-wide">Linked quote history (newest first)</p>
                          {details.quoteChain.map((q) => (
                            <p key={q.id} className="text-xs text-ent-text">
                              {q.status === 'superseded' ? 'Superseded quote' : 'Quote'} — {q.packageType === 'integrated_care' ? 'Full Enterprise' : 'Therapist Enterprise'}, {q.proposedLicensedSeats} seats, {q.annualLicenseFee != null ? `$${q.annualLicenseFee.toFixed(2)}/${q.billingCadence ?? ''}` : 'no price yet'} ({q.status})
                            </p>
                          ))}
                        </div>
                      )}
                      <StepFieldsReadout details={a.applicationDetails} stepKey="step1" label="Legal Entity" />
                      <StepFieldsReadout details={a.applicationDetails} stepKey="step2" label="Director" />
                      <StepFieldsReadout details={a.applicationDetails} stepKey="step4" label="Operations" />
                      <StepFieldsReadout details={a.applicationDetails} stepKey="step5" label="Billing" />
                      <StepFieldsReadout details={a.applicationDetails} stepKey="step6" label="Declarations & Signature" />
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-ent-ink uppercase tracking-wide">Audit history</p>
                        {details.events.length === 0 ? (
                          <p className="text-xs text-ent-muted">No recorded events yet.</p>
                        ) : (
                          details.events.map((ev, i) => (
                            <p key={i} className="text-xs text-ent-text">
                              {new Date(ev.createdAt).toLocaleString()} — <span className="font-medium capitalize">{ev.eventType.replace(/_/g, ' ')}</span>{ev.actorRole ? ` (${ev.actorRole})` : ''}{ev.notes ? `: ${ev.notes}` : ''}
                            </p>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </li>
          );})}
        </ul>
      )}
    </div>
  );
}

// MASTER ENTERPRISE COMPLETION DIRECTIVE §1.B — Platform Owner review
// queue for migration 088's account-deletion requests. Approval
// performs a safe, reversible deactivation server-side (every active
// membership/assignment/relationship revoked, audited) — never a hard
// delete of the account or any clinical record it authored.
function AccountDeletionRequestsPanel() {
  const [requests, setRequests] = useState<AccountDeletionRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => { setRequests(await getPendingAccountDeletionRequests()); }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const review = async (id: string, approve: boolean) => {
    setBusyId(id);
    try {
      const { error } = await platformOwnerReviewAccountDeletion(id, approve, notes[id] ?? '');
      if (error) { toast.error(error); return; }
      toast.success(approve ? 'Account safely deactivated.' : 'Deletion request denied.');
      void refresh();
    } finally { setBusyId(null); }
  };

  return (
    <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-5 sm:p-6 space-y-3">
      <h2 className="font-bold text-ent-ink">Account Deletion Requests Awaiting Review</h2>
      {requests.length === 0 ? (
        <p className="text-sm text-ent-text">No deletion requests are currently pending.</p>
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => (
            <li key={r.id} className="p-4 bg-ent-bg rounded-xl border border-ent-line space-y-2">
              <p className="text-sm text-ent-ink font-mono">{r.targetUserId}</p>
              {r.reason && <p className="text-xs text-ent-muted">Reason: {r.reason}</p>}
              <p className="text-xs text-ent-muted">Requested {new Date(r.createdAt).toLocaleString()}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" onClick={() => { void review(r.id, true); }} disabled={busyId === r.id} className="px-3 py-2 rounded-xl bg-ent-rust hover:opacity-90 text-white text-sm font-semibold disabled:opacity-60">
                  Approve &amp; Safely Deactivate
                </button>
                <input value={notes[r.id] ?? ''} onChange={(e) => setNotes((p) => ({ ...p, [r.id]: e.target.value }))} placeholder="Review notes…" className={`${inputCls} flex-1 min-w-[160px]`} />
                <button type="button" onClick={() => { void review(r.id, false); }} disabled={busyId === r.id} className="px-3 py-2 rounded-xl border border-ent-line text-ent-ink text-sm font-semibold hover:bg-ent-pale">Deny</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AccountClassificationPanel() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [newRole, setNewRole] = useState<Record<string, string>>({});
  const [newStatus, setNewStatus] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');

  const search = async () => {
    if (!email.trim()) return;
    setLoading(true);
    try {
      const { data: profile } = await supabase.from('profiles').select('id').eq('email', email.trim().toLowerCase()).maybeSingle();
      if (!profile) { toast.error('No account found with that email.'); setUserId(null); setMemberships([]); return; }
      setUserId(profile.id);
      const { data: mem } = await supabase.from('organization_memberships').select('id, organization_id, org_role, status, organizations(name)').eq('user_id', profile.id);
      setMemberships((mem ?? []) as unknown as MembershipRow[]);
    } finally {
      setLoading(false);
    }
  };

  const correct = async (m: MembershipRow) => {
    if (!userId) return;
    const role = newRole[m.id] ?? m.org_role;
    const status = newStatus[m.id] ?? m.status;
    if (!reason.trim()) { toast.error('Provide a reason for this correction (audited).'); return; }
    const { error } = await platformOwnerCorrectOfficeClassification(userId, m.organization_id, role, status, reason.trim());
    if (error) { toast.error(error); return; }
    toast.success('Office classification corrected.');
    void search();
  };

  return (
    <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-5 sm:p-6 space-y-3">
      <h2 className="font-bold text-ent-ink">Account Classification Review &amp; Correction</h2>
      <div className="flex gap-2">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="account email address" className={`${inputCls} flex-1`} />
        <button type="button" onClick={() => { void search(); }} disabled={loading} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-ent-bronze hover:opacity-90 text-white text-sm font-semibold disabled:opacity-60">
          <Search className="w-4 h-4" /> Locate
        </button>
      </div>
      {userId && (
        <div className="space-y-3">
          <p className="text-xs text-ent-muted font-mono">{userId}</p>
          {memberships.length === 0 ? <p className="text-sm text-ent-text">No organization memberships.</p> : (
            <ul className="space-y-2">
              {memberships.map((m) => (
                <li key={m.id} className="p-3 bg-ent-bg rounded-xl border border-ent-line space-y-2">
                  <div className="flex items-center gap-2 text-sm text-ent-ink"><Building2 className="w-4 h-4 text-ent-bronze" /> {m.organizations?.name ?? m.organization_id}</div>
                  <div className="flex flex-wrap gap-2">
                    <select defaultValue={m.org_role} onChange={(e) => setNewRole((p) => ({ ...p, [m.id]: e.target.value }))} className={inputCls + ' sm:w-48'}>
                      {['director', 'caregiver', 'therapist', 'medical_professional', 'billing_admin'].map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                    </select>
                    <select defaultValue={m.status} onChange={(e) => setNewStatus((p) => ({ ...p, [m.id]: e.target.value }))} className={inputCls + ' sm:w-40'}>
                      {['invited', 'active', 'revoked', 'declined'].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button type="button" onClick={() => { void correct(m); }} className="px-3 py-2 rounded-xl border border-ent-line text-ent-ink text-sm font-semibold hover:bg-ent-pale">Apply Correction</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for correction (required, audited)…" className={inputCls} />
        </div>
      )}
    </div>
  );
}

// OWNER DIRECTIVE MMA-ENT-SALES-002, PHASE C — Platform Owner console UI
// for migration 107's prospect/quote/invitation pipeline. Every write
// goes through one of the nine RPCs (never a direct insert/update on
// sales_prospects/sales_quotes/sales_quote_invitations); list reads use
// the standard RLS-protected table read, matching this file's own
// existing DirectorApplicationsPanel/professional_applications
// convention exactly. The raw invitation token is shown to the owner
// exactly once, immediately after issuance (it is returned only in that
// one RPC response and is never persisted anywhere, including here --
// this component holds it only in transient React state, cleared the
// moment a different invitation is issued or the panel unmounts).
function QuoteInvitationsSection({ quote }: { quote: SalesQuote }) {
  const [invitations, setInvitations] = useState<SalesQuoteInvitation[]>([]);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [expiresInHours, setExpiresInHours] = useState(168);
  const [busy, setBusy] = useState(false);
  const [justIssued, setJustIssued] = useState<{ invitationId: string; rawToken: string } | null>(null);

  const refresh = useCallback(async () => { setInvitations(await getQuoteInvitations(quote.id)); }, [quote.id]);
  useEffect(() => { void refresh(); }, [refresh]);

  const issue = async () => {
    if (!recipientEmail.trim()) { toast.error('Recipient email is required.'); return; }
    setBusy(true);
    try {
      const { data, error } = await issueQuoteInvitation(quote.id, recipientEmail.trim(), expiresInHours);
      if (error || !data) { toast.error(error || 'Could not issue invitation.'); return; }
      setJustIssued({ invitationId: data.invitationId, rawToken: data.rawToken });
      setRecipientEmail('');
      void refresh();
    } finally { setBusy(false); }
  };
  const revoke = async (id: string) => {
    setBusy(true);
    try {
      const { error } = await revokeQuoteInvitation(id);
      if (error) { toast.error(error); return; }
      if (justIssued?.invitationId === id) setJustIssued(null);
      toast.success('Invitation revoked.');
      void refresh();
    } finally { setBusy(false); }
  };
  const copyToken = async () => {
    if (!justIssued) return;
    try { await navigator.clipboard.writeText(justIssued.rawToken); toast.success('Token copied.'); }
    catch { toast.error('Could not copy automatically — select and copy manually.'); }
  };

  return (
    <div className="pl-4 border-l-2 border-ent-line space-y-2 mt-2">
      {justIssued && (
        <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl space-y-1.5">
          <p className="text-xs font-bold text-amber-900 flex items-center gap-1"><KeyRound className="w-3.5 h-3.5" /> Shown once — deliver this to the recipient now; it cannot be retrieved again</p>
          <div className="flex items-center gap-2">
            <code className="text-[11px] bg-white px-2 py-1 rounded border border-amber-200 break-all flex-1">{justIssued.rawToken}</code>
            <button type="button" onClick={() => { void copyToken(); }} className="p-1.5 rounded-lg hover:bg-amber-100 text-amber-900"><Copy className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <input value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="recipient@example.com" className={`${inputCls} flex-1 min-w-[160px]`} />
        <input type="number" min={1} max={720} value={expiresInHours} onChange={(e) => setExpiresInHours(Number(e.target.value))} className={`${inputCls} w-28`} title="Expires in (hours)" />
        <button type="button" onClick={() => { void issue(); }} disabled={busy} className="flex items-center gap-1 px-3 py-2 rounded-xl bg-ent-bronze hover:opacity-90 text-white text-xs font-semibold disabled:opacity-60">
          <Plus className="w-3.5 h-3.5" /> Issue invitation
        </button>
      </div>
      {invitations.length > 0 && (
        <ul className="space-y-1.5">
          {invitations.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between gap-2 text-xs p-2 bg-ent-bg rounded-lg border border-ent-line">
              <span className="text-ent-ink">{inv.recipientEmail} <span className="text-ent-muted">· expires {new Date(inv.expiresAt).toLocaleString()}</span></span>
              <div className="flex items-center gap-2">
                <span className={`font-bold capitalize ${inv.status === 'pending' ? 'text-ent-amber' : inv.status === 'accepted' ? 'text-ent-green-active' : 'text-ent-muted'}`}>{inv.status}</span>
                {inv.status === 'pending' && (
                  <button type="button" onClick={() => { void revoke(inv.id); }} disabled={busy} className="text-ent-rust hover:underline disabled:opacity-60">Revoke</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuoteCard({ quote, onChanged }: { quote: SalesQuote; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      const { error } = await sendQuote(quote.id);
      if (error) { toast.error(error); return; }
      toast.success('Quote sent.');
      onChanged();
    } finally { setBusy(false); }
  };
  const revoke = async () => {
    setBusy(true);
    try {
      const { error } = await revokeQuote(quote.id);
      if (error) { toast.error(error); return; }
      toast.success('Quote revoked.');
      onChanged();
    } finally { setBusy(false); }
  };

  return (
    <li className="p-3 bg-ent-bg rounded-xl border border-ent-line space-y-1.5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold text-ent-ink">
          {quote.packageType === 'integrated_care' ? 'Full Enterprise' : 'Therapist Enterprise'} · {quote.proposedLicensedSeats} seats · {quote.proposedCoveredPatientCapacity} covered patients
        </p>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full capitalize ${quote.status === 'sent' ? 'bg-ent-amber/20 text-ent-amber' : quote.status === 'revoked' || quote.status === 'superseded' ? 'bg-ent-line text-ent-muted' : 'bg-ent-pale text-ent-ink'}`}>{quote.status}</span>
      </div>
      <p className="text-xs text-ent-muted">
        {quote.annualLicenseFee != null ? `$${quote.annualLicenseFee.toLocaleString()}/yr` : 'Pricing not yet entered'}
        {quote.billingCadence ? ` · ${quote.billingCadence}` : ''}
        {quote.validUntil ? ` · valid until ${new Date(quote.validUntil).toLocaleDateString()}` : ''}
      </p>
      {(quote.status === 'draft' || quote.status === 'sent') && (
        <div className="flex gap-2 pt-1">
          {quote.status === 'draft' && (
            <button type="button" onClick={() => { void send(); }} disabled={busy} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ent-bronze hover:opacity-90 text-white text-xs font-semibold disabled:opacity-60">
              <Send className="w-3 h-3" /> Send quote
            </button>
          )}
          <button type="button" onClick={() => { void revoke(); }} disabled={busy} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-ent-rust text-ent-rust text-xs font-semibold hover:bg-ent-rust/10 disabled:opacity-60">
            <Ban className="w-3 h-3" /> Revoke
          </button>
        </div>
      )}
      {quote.status === 'sent' && <QuoteInvitationsSection quote={quote} />}
      {quote.status === 'sent' && <ContractManagementSection quoteId={quote.id} />}
    </li>
  );
}

const CONTRACT_TYPE_LABEL: Record<ContractType, string> = { saas_license: 'SaaS License Agreement', baa: 'BAA', dpa: 'DPA' };
const CONTRACT_STATUS_STYLE: Record<string, string> = {
  draft: 'text-ent-muted bg-ent-pale', presented: 'text-amber-700 bg-amber-100',
  executed: 'text-ent-green bg-ent-green-active', void: 'text-ent-rust bg-ent-rust/10',
};

// OWNER DIRECTIVE MMA-ENT-SALES-006 Phase F3 — per-quote agreement
// management. "Executed" is never a button the Platform Owner clicks
// without evidence: platform_owner_record_contract_execution() itself
// rejects an empty method or reference, so this form simply surfaces
// that same requirement rather than re-validating it client-side only.
function ContractManagementSection({ quoteId }: { quoteId: string }) {
  const [contracts, setContracts] = useState<EnterpriseContract[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [contractType, setContractType] = useState<ContractType>('saas_license');
  const [templateVersion, setTemplateVersion] = useState('');
  const [signatoryName, setSignatoryName] = useState('');
  const [signatoryTitle, setSignatoryTitle] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [execForm, setExecForm] = useState<Record<string, { method: string; reference: string }>>({});
  const [voidReason, setVoidReason] = useState<Record<string, string>>({});
  const [replaceOpenId, setReplaceOpenId] = useState<string | null>(null);
  const [replaceForm, setReplaceForm] = useState<Record<string, { templateVersion: string; signatoryName: string; signatoryTitle: string }>>({});

  const refresh = useCallback(async () => { setContracts(await getContractsForQuote(quoteId)); }, [quoteId]);
  useEffect(() => { void refresh(); }, [refresh]);

  const submitCreate = async () => {
    if (!templateVersion.trim() || !signatoryName.trim()) { toast.error('Template version and signatory name are required.'); return; }
    setBusyId('new');
    try {
      const { error } = await createContract(quoteId, contractType, templateVersion.trim(), signatoryName.trim(), signatoryTitle.trim() || null);
      if (error) { toast.error(error); return; }
      toast.success('Agreement record created as a draft.');
      setShowForm(false);
      setTemplateVersion(''); setSignatoryName(''); setSignatoryTitle('');
      void refresh();
    } finally { setBusyId(null); }
  };
  const present = async (id: string) => {
    setBusyId(id);
    try {
      const { error } = await presentContract(id);
      if (error) { toast.error(error); return; }
      toast.success('Presented to the customer.');
      void refresh();
    } finally { setBusyId(null); }
  };
  const recordExecution = async (id: string) => {
    const form = execForm[id] ?? { method: '', reference: '' };
    if (!form.method.trim() || !form.reference.trim()) { toast.error('An execution method and evidence reference are both required.'); return; }
    setBusyId(id);
    try {
      const { error } = await recordContractExecution(id, form.method.trim(), form.reference.trim());
      if (error) { toast.error(error); return; }
      toast.success('Execution recorded.');
      void refresh();
    } finally { setBusyId(null); }
  };
  const doVoid = async (id: string) => {
    const reason = voidReason[id]?.trim();
    if (!reason) { toast.error('A reason is required.'); return; }
    setBusyId(id);
    try {
      const { error } = await voidContract(id, reason);
      if (error) { toast.error(error); return; }
      toast.success('Agreement voided.');
      void refresh();
    } finally { setBusyId(null); }
  };
  // MMA-ENT-SALES-007 §5/F2 — migration 117's supersession path: the
  // only way to create a new agreement for a quote+type that already
  // has a voided one. Without this, voiding a contract would leave
  // the Platform Owner with no UI path to ever satisfy that
  // requirement again (only a direct RPC/SQL call could).
  const submitReplace = async (voidedContract: EnterpriseContract) => {
    const form = replaceForm[voidedContract.id] ?? { templateVersion: '', signatoryName: '', signatoryTitle: '' };
    if (!form.templateVersion.trim() || !form.signatoryName.trim()) { toast.error('Template version and signatory name are required.'); return; }
    setBusyId(voidedContract.id);
    try {
      const { error } = await createContract(
        quoteId, voidedContract.contractType, form.templateVersion.trim(), form.signatoryName.trim(), form.signatoryTitle.trim() || null, voidedContract.id,
      );
      if (error) { toast.error(error); return; }
      toast.success('Replacement agreement created as a draft.');
      setReplaceOpenId(null);
      void refresh();
    } finally { setBusyId(null); }
  };
  const supersededIds = new Set(contracts.map((c) => c.supersedesContractId).filter((id): id is string => !!id));

  return (
    <div className="pt-1 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-ent-ink uppercase tracking-wide">Agreements</p>
        <button type="button" onClick={() => setShowForm((s) => !s)} className="text-xs font-semibold text-ent-bronze hover:underline">
          + Add agreement record
        </button>
      </div>
      {showForm && (
        <div className="p-3 bg-ent-panel rounded-xl border border-ent-line space-y-2">
          <div className="flex flex-wrap gap-2">
            <select value={contractType} onChange={(e) => setContractType(e.target.value as ContractType)} className={`${inputCls} w-48`}>
              {Object.entries(CONTRACT_TYPE_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <input value={templateVersion} onChange={(e) => setTemplateVersion(e.target.value)} placeholder="Template version (e.g. MMA-SAAS-2026-v1)" className={`${inputCls} flex-1 min-w-[180px]`} />
          </div>
          <div className="flex flex-wrap gap-2">
            <input value={signatoryName} onChange={(e) => setSignatoryName(e.target.value)} placeholder="Signatory name" className={`${inputCls} flex-1 min-w-[140px]`} />
            <input value={signatoryTitle} onChange={(e) => setSignatoryTitle(e.target.value)} placeholder="Signatory title (optional)" className={`${inputCls} flex-1 min-w-[140px]`} />
          </div>
          <button type="button" onClick={() => { void submitCreate(); }} disabled={busyId === 'new'} className="px-3 py-2 rounded-xl bg-ent-bronze hover:opacity-90 text-white text-xs font-semibold disabled:opacity-60">
            Create as draft
          </button>
        </div>
      )}
      {contracts.map((c) => (
        <div key={c.id} className="p-3 bg-ent-panel rounded-xl border border-ent-line space-y-1.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs font-semibold text-ent-ink">{CONTRACT_TYPE_LABEL[c.contractType]} · {c.templateVersion} · {c.signatoryName}</p>
            <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${CONTRACT_STATUS_STYLE[c.status] ?? ''}`}>{c.status}</span>
          </div>
          {c.status === 'executed' && (
            <p className="text-xs text-ent-muted">Executed via {c.executionMethod} ({c.executionEvidenceReference}) on {c.executedAt ? new Date(c.executedAt).toLocaleDateString() : ''}</p>
          )}
          {c.status === 'void' && (
            <div className="space-y-1.5">
              <p className="text-xs text-ent-muted">Voided: {c.voidedReason}</p>
              {!supersededIds.has(c.id) && (
                replaceOpenId === c.id ? (
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap gap-2">
                      <input
                        value={replaceForm[c.id]?.templateVersion ?? ''}
                        onChange={(e) => setReplaceForm((p) => ({ ...p, [c.id]: { ...(p[c.id] ?? { templateVersion: '', signatoryName: '', signatoryTitle: '' }), templateVersion: e.target.value } }))}
                        placeholder="Template version (e.g. MMA-SAAS-2026-v1)" className={`${inputCls} flex-1 min-w-[180px]`}
                      />
                      <input
                        value={replaceForm[c.id]?.signatoryName ?? ''}
                        onChange={(e) => setReplaceForm((p) => ({ ...p, [c.id]: { ...(p[c.id] ?? { templateVersion: '', signatoryName: '', signatoryTitle: '' }), signatoryName: e.target.value } }))}
                        placeholder="Signatory name" className={`${inputCls} flex-1 min-w-[180px]`}
                      />
                      <input
                        value={replaceForm[c.id]?.signatoryTitle ?? ''}
                        onChange={(e) => setReplaceForm((p) => ({ ...p, [c.id]: { ...(p[c.id] ?? { templateVersion: '', signatoryName: '', signatoryTitle: '' }), signatoryTitle: e.target.value } }))}
                        placeholder="Signatory title (optional)" className={`${inputCls} flex-1 min-w-[180px]`}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { void submitReplace(c); }} disabled={busyId === c.id} className="px-3 py-1.5 rounded-lg bg-ent-bronze hover:opacity-90 text-white text-xs font-semibold disabled:opacity-60">
                        Create replacement as draft
                      </button>
                      <button type="button" onClick={() => setReplaceOpenId(null)} className="px-3 py-1.5 rounded-lg border border-ent-line text-ent-ink text-xs font-semibold">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setReplaceOpenId(c.id)} className="px-3 py-1.5 rounded-lg border border-ent-line text-ent-ink text-xs font-semibold">
                    Replace with new agreement
                  </button>
                )
              )}
            </div>
          )}
          {c.status === 'draft' && (
            <button type="button" onClick={() => { void present(c.id); }} disabled={busyId === c.id} className="px-3 py-1.5 rounded-lg bg-ent-bronze hover:opacity-90 text-white text-xs font-semibold disabled:opacity-60">
              Present to customer
            </button>
          )}
          {c.status === 'presented' && (
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-2">
                <input
                  value={execForm[c.id]?.method ?? ''} onChange={(e) => setExecForm((p) => ({ ...p, [c.id]: { ...(p[c.id] ?? { method: '', reference: '' }), method: e.target.value } }))}
                  placeholder="Execution method (e.g. DocuSign envelope #...)" className={`${inputCls} flex-1 min-w-[180px]`}
                />
                <input
                  value={execForm[c.id]?.reference ?? ''} onChange={(e) => setExecForm((p) => ({ ...p, [c.id]: { ...(p[c.id] ?? { method: '', reference: '' }), reference: e.target.value } }))}
                  placeholder="Evidence reference (document id, storage path, etc.)" className={`${inputCls} flex-1 min-w-[180px]`}
                />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { void recordExecution(c.id); }} disabled={busyId === c.id} className="px-3 py-1.5 rounded-lg bg-ent-bronze hover:opacity-90 text-white text-xs font-semibold disabled:opacity-60">
                  Record execution
                </button>
                <input value={voidReason[c.id] ?? ''} onChange={(e) => setVoidReason((p) => ({ ...p, [c.id]: e.target.value }))} placeholder="Void reason…" className={`${inputCls} flex-1 min-w-[140px]`} />
                <button type="button" onClick={() => { void doVoid(c.id); }} disabled={busyId === c.id} className="px-3 py-1.5 rounded-lg border border-ent-rust text-ent-rust text-xs font-semibold hover:bg-ent-rust/10 disabled:opacity-60">
                  Void
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ProspectCard({ prospect, onChanged }: { prospect: SalesProspect; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [quotes, setQuotes] = useState<SalesQuote[]>([]);
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [packageType, setPackageType] = useState<SalesPackageType>('integrated_care');
  const [seats, setSeats] = useState(5);
  const [capacity, setCapacity] = useState(25);
  const [fee, setFee] = useState('');
  const [cadence, setCadence] = useState('');
  const [busy, setBusy] = useState(false);

  const refreshQuotes = useCallback(async () => { setQuotes(await getSalesQuotes(prospect.id)); }, [prospect.id]);
  useEffect(() => { if (expanded) void refreshQuotes(); }, [expanded, refreshQuotes]);

  const submitQuote = async () => {
    setBusy(true);
    try {
      const { error } = await createQuote({
        prospectId: prospect.id, packageType, proposedLicensedSeats: seats, proposedCoveredPatientCapacity: capacity,
        annualLicenseFee: fee.trim() ? Number(fee) : null, billingCadence: cadence.trim() || null,
        quoteTermMonths: null, discountNotes: null, validUntil: null,
      });
      if (error) { toast.error(error); return; }
      toast.success('Quote created as a draft.');
      setShowQuoteForm(false);
      void refreshQuotes();
      onChanged();
    } finally { setBusy(false); }
  };

  return (
    <li className="p-4 bg-ent-panel rounded-xl border border-ent-line space-y-2">
      <button type="button" onClick={() => setExpanded((e) => !e)} className="w-full flex items-center justify-between gap-2 text-left">
        <div>
          <p className="font-semibold text-ent-ink">{prospect.prospectiveOrganizationName}</p>
          <p className="text-xs text-ent-muted">{prospect.contactName} · {prospect.contactEmail}{prospect.contactPhone ? ` · ${prospect.contactPhone}` : ''}</p>
        </div>
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-ent-pale text-ent-ink capitalize flex-shrink-0">{prospect.status}</span>
      </button>
      {expanded && (
        <div className="pt-2 space-y-2">
          {prospect.notes && <p className="text-xs text-ent-muted italic">{prospect.notes}</p>}
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-ent-muted uppercase tracking-wide">Quotes</h3>
            <button type="button" onClick={() => setShowQuoteForm((s) => !s)} className="flex items-center gap-1 text-xs font-semibold text-ent-bronze hover:underline">
              <Plus className="w-3.5 h-3.5" /> New quote
            </button>
          </div>
          {showQuoteForm && (
            <div className="p-3 bg-ent-bg rounded-xl border border-ent-line space-y-2">
              <div className="flex flex-wrap gap-2">
                <select value={packageType} onChange={(e) => setPackageType(e.target.value as SalesPackageType)} className={`${inputCls} flex-1 min-w-[160px]`}>
                  <option value="integrated_care">Full Enterprise</option>
                  <option value="therapist">Therapist Enterprise</option>
                </select>
                <input type="number" min={1} value={seats} onChange={(e) => setSeats(Number(e.target.value))} placeholder="Seats" className={`${inputCls} w-24`} />
                <input type="number" min={0} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} placeholder="Covered patients" className={`${inputCls} w-32`} />
              </div>
              <div className="flex flex-wrap gap-2">
                <input value={fee} onChange={(e) => setFee(e.target.value)} placeholder="Annual fee (owner-entered, optional)" className={`${inputCls} flex-1 min-w-[160px]`} />
                <input value={cadence} onChange={(e) => setCadence(e.target.value)} placeholder="Billing cadence (e.g. annual)" className={`${inputCls} w-48`} />
              </div>
              <button type="button" onClick={() => { void submitQuote(); }} disabled={busy} className="px-3 py-2 rounded-xl bg-ent-bronze hover:opacity-90 text-white text-xs font-semibold disabled:opacity-60">
                Create quote (draft)
              </button>
            </div>
          )}
          {quotes.length === 0 ? (
            <p className="text-xs text-ent-muted">No quotes yet.</p>
          ) : (
            <ul className="space-y-2">{quotes.map((q) => <QuoteCard key={q.id} quote={q} onChanged={() => { void refreshQuotes(); onChanged(); }} />)}</ul>
          )}
        </div>
      )}
    </li>
  );
}

// MMA-PROF-ONBOARD-004 -- the Platform Owner's control surface for the
// three published license tiers (price, specialist-slot capacity,
// publish/unpublish). A price change never retroactively alters an
// already-issued application/invoice's own snapshot
// (annual_license_fee_snapshot_cents) -- this panel only ever changes
// what a FUTURE applicant sees and pays.
function LicenseTierPricingPanel() {
  const [tiers, setTiers] = useState<LicenseTierAdmin[]>([]);
  const [editing, setEditing] = useState<Record<string, { displayName: string; annualFeeDollars: string; specialistSlotCount: string }>>({});
  const [busyTier, setBusyTier] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const rows = await getAllLicenseTiers();
    setTiers(rows);
    setEditing((prev) => {
      const next = { ...prev };
      for (const t of rows) {
        if (!next[t.tierCode]) {
          next[t.tierCode] = { displayName: t.displayName, annualFeeDollars: (t.annualFeeCents / 100).toFixed(2), specialistSlotCount: String(t.specialistSlotCount) };
        }
      }
      return next;
    });
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const save = async (tierCode: string) => {
    const e = editing[tierCode];
    if (!e) return;
    const cents = Math.round(Number(e.annualFeeDollars) * 100);
    const slots = Number(e.specialistSlotCount);
    if (!Number.isFinite(cents) || cents < 0 || !Number.isFinite(slots) || slots < 0) { toast.error('Enter a valid price and slot count.'); return; }
    setBusyTier(tierCode);
    try {
      const { error } = await platformOwnerSetLicenseTierPrice(tierCode, e.displayName, cents, slots);
      if (error) { toast.error(error); return; }
      toast.success(`${e.displayName} updated.`);
      await refresh();
    } finally { setBusyTier(null); }
  };
  const togglePublished = async (t: LicenseTierAdmin) => {
    setBusyTier(t.tierCode);
    try {
      const { error } = await platformOwnerSetLicenseTierPublished(t.tierCode, !t.isPublished);
      if (error) { toast.error(error); return; }
      toast.success(t.isPublished ? `${t.displayName} unpublished.` : `${t.displayName} published.`);
      await refresh();
    } finally { setBusyTier(null); }
  };

  return (
    <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-5 sm:p-6 space-y-3">
      <h2 className="font-bold text-ent-ink">License Tiers &amp; Pricing</h2>
      <div className="space-y-2">
        {tiers.map((t) => {
          const e = editing[t.tierCode] ?? { displayName: t.displayName, annualFeeDollars: '', specialistSlotCount: '' };
          return (
            <div key={t.tierCode} data-testid={`tier-row-${t.tierCode}`} className="p-3 bg-ent-bg rounded-xl border border-ent-line flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-ent-muted uppercase w-20">{t.tierCode}</span>
              <input value={e.displayName} onChange={(ev) => setEditing((p) => ({ ...p, [t.tierCode]: { ...e, displayName: ev.target.value } }))} className={`${inputCls} w-32`} />
              <span className="text-xs text-ent-muted">$</span>
              <input value={e.annualFeeDollars} onChange={(ev) => setEditing((p) => ({ ...p, [t.tierCode]: { ...e, annualFeeDollars: ev.target.value } }))} className={`${inputCls} w-20`} />
              <span className="text-xs text-ent-muted">/yr, slots:</span>
              <input value={e.specialistSlotCount} onChange={(ev) => setEditing((p) => ({ ...p, [t.tierCode]: { ...e, specialistSlotCount: ev.target.value } }))} className={`${inputCls} w-14`} />
              <button type="button" onClick={() => { void save(t.tierCode); }} disabled={busyTier === t.tierCode} className="px-3 py-2 rounded-xl bg-ent-bronze hover:opacity-90 text-white text-xs font-semibold disabled:opacity-60">Save</button>
              <button type="button" onClick={() => { void togglePublished(t); }} disabled={busyTier === t.tierCode} className={`px-3 py-2 rounded-xl border text-xs font-semibold ${t.isPublished ? 'border-ent-rust text-ent-rust hover:bg-ent-rust/10' : 'border-ent-forest text-ent-forest hover:bg-ent-forest/10'}`}>
                {t.isPublished ? 'Unpublish' : 'Publish'}
              </button>
              <span className="text-[11px] text-ent-muted ml-auto">v{t.version}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// MMA-PROF-ONBOARD-004 -- WELCOME100/WELCOME50 coupon administration:
// pause/expire/revoke, bounded redemption limits, and a form for the
// owner to create a new custom code. Coupon codes are never listed
// anywhere a client can browse them ANONYMOUSLY (migration 161's own
// RLS) -- this panel itself is Platform-Owner-only.
function CouponManagementPanel() {
  const [coupons, setCoupons] = useState<CouponAdmin[]>([]);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newKind, setNewKind] = useState<'full_waiver' | 'half_off_minus_fifty_cents'>('half_off_minus_fifty_cents');
  const [newLimit, setNewLimit] = useState('');

  const refresh = useCallback(async () => { setCoupons(await getAllCoupons()); }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const setStatus = async (code: string, status: 'active' | 'paused' | 'expired' | 'revoked') => {
    setBusyCode(code);
    try {
      const { error } = await platformOwnerSetCouponStatus(code, status);
      if (error) { toast.error(error); return; }
      toast.success(`${code} set to ${status}.`);
      await refresh();
    } finally { setBusyCode(null); }
  };
  const setLimit = async (code: string, limitStr: string) => {
    const limit = limitStr.trim() === '' ? null : Number(limitStr);
    if (limit !== null && (!Number.isFinite(limit) || limit <= 0)) { toast.error('Enter a positive number, or leave blank for unlimited.'); return; }
    setBusyCode(code);
    try {
      const { error } = await platformOwnerSetCouponLimit(code, limit);
      if (error) { toast.error(error); return; }
      toast.success(`${code} limit updated.`);
      await refresh();
    } finally { setBusyCode(null); }
  };
  const createCoupon = async () => {
    if (!newCode.trim()) { toast.error('Enter a code.'); return; }
    setBusyCode('new');
    try {
      const { error } = await platformOwnerCreateCoupon(newCode.trim().toUpperCase(), newKind, newLimit.trim() ? Number(newLimit) : null, null, null);
      if (error) { toast.error(error); return; }
      toast.success(`${newCode.toUpperCase()} created.`);
      setNewCode(''); setNewLimit(''); setShowForm(false);
      await refresh();
    } finally { setBusyCode(null); }
  };

  return (
    <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-5 sm:p-6 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-ent-ink">Promotional Coupons</h2>
        <button type="button" onClick={() => setShowForm((v) => !v)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-ent-bronze hover:opacity-90 text-white text-xs font-semibold">
          <Plus className="w-3.5 h-3.5" /> New code
        </button>
      </div>
      {showForm && (
        <div className="p-3 bg-ent-bg rounded-xl border border-ent-line flex flex-wrap items-center gap-2">
          <input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="CODE" className={`${inputCls} w-32`} />
          <select value={newKind} onChange={(e) => setNewKind(e.target.value as 'full_waiver' | 'half_off_minus_fifty_cents')} className={`${inputCls} w-56`}>
            <option value="half_off_minus_fifty_cents">50% off, then −$0.50</option>
            <option value="full_waiver">100% off (full waiver)</option>
          </select>
          <input value={newLimit} onChange={(e) => setNewLimit(e.target.value)} placeholder="Max redemptions (blank=unlimited)" className={`${inputCls} w-56`} />
          <button type="button" onClick={() => { void createCoupon(); }} disabled={busyCode === 'new'} className="px-3 py-2 rounded-xl bg-ent-bronze hover:opacity-90 text-white text-xs font-semibold disabled:opacity-60">Create</button>
        </div>
      )}
      <div className="space-y-2">
        {coupons.length === 0 && <p className="text-sm text-ent-text">No coupons configured.</p>}
        {coupons.map((c) => (
          <div key={c.code} data-testid={`coupon-row-${c.code}`} className="p-3 bg-ent-bg rounded-xl border border-ent-line flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-ent-ink w-32">{c.code}</span>
            <span className="text-xs text-ent-muted w-40">{c.discountKind === 'full_waiver' ? '100% off' : '50% off − $0.50'}</span>
            <span className={`text-[11px] font-bold px-2 py-1 rounded-full capitalize ${c.status === 'active' ? 'bg-ent-forest/20 text-ent-forest' : 'bg-ent-amber/20 text-ent-amber'}`}>{c.status}</span>
            <span className="text-xs text-ent-muted">{c.redemptionsUsed} used{c.maxRedemptionsTotal != null ? ` / ${c.maxRedemptionsTotal}` : ' (unlimited)'}</span>
            <input defaultValue={c.maxRedemptionsTotal ?? ''} onBlur={(e) => { if (e.target.value !== String(c.maxRedemptionsTotal ?? '')) void setLimit(c.code, e.target.value); }} placeholder="limit" className={`${inputCls} w-20`} />
            {c.status !== 'paused' && <button type="button" onClick={() => { void setStatus(c.code, 'paused'); }} disabled={busyCode === c.code} className="px-3 py-1.5 rounded-xl border border-ent-line text-ent-ink text-xs font-semibold hover:bg-ent-pale">Pause</button>}
            {c.status === 'paused' && <button type="button" onClick={() => { void setStatus(c.code, 'active'); }} disabled={busyCode === c.code} className="px-3 py-1.5 rounded-xl border border-ent-forest text-ent-forest text-xs font-semibold hover:bg-ent-forest/10">Resume</button>}
            {c.status !== 'revoked' && <button type="button" onClick={() => { void setStatus(c.code, 'revoked'); }} disabled={busyCode === c.code} className="px-3 py-1.5 rounded-xl border border-ent-rust text-ent-rust text-xs font-semibold hover:bg-ent-rust/10">Revoke</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

function SalesPipelinePanel() {
  const [prospects, setProspects] = useState<SalesProspect[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [orgName, setOrgName] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => { setProspects(await getSalesProspects()); }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const submit = async () => {
    if (!contactName.trim() || !contactEmail.trim() || !orgName.trim()) { toast.error('Contact name, email, and prospective organization name are required.'); return; }
    setBusy(true);
    try {
      const { error } = await createProspect(contactName.trim(), contactEmail.trim(), contactPhone.trim() || null, orgName.trim(), notes.trim() || null);
      if (error) { toast.error(error); return; }
      toast.success('Prospect created.');
      setContactName(''); setContactEmail(''); setContactPhone(''); setOrgName(''); setNotes(''); setShowForm(false);
      void refresh();
    } finally { setBusy(false); }
  };

  return (
    <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-5 sm:p-6 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-ent-ink flex items-center gap-2"><FileText className="w-4 h-4 text-ent-bronze" /> Enterprise Sales Pipeline</h2>
        <button type="button" onClick={() => setShowForm((s) => !s)} className="flex items-center gap-1 text-sm font-semibold text-ent-bronze hover:underline">
          <Plus className="w-4 h-4" /> New prospect
        </button>
      </div>
      {showForm && (
        <div className="p-4 bg-ent-bg rounded-xl border border-ent-line space-y-2">
          <div className="flex flex-wrap gap-2">
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Contact name" className={`${inputCls} flex-1 min-w-[140px]`} />
            <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Contact email" className={`${inputCls} flex-1 min-w-[160px]`} />
            <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="Phone (optional)" className={`${inputCls} w-40`} />
          </div>
          <input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Prospective organization name" className={inputCls} />
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" className={inputCls} />
          <button type="button" onClick={() => { void submit(); }} disabled={busy} className="px-3 py-2 rounded-xl bg-ent-bronze hover:opacity-90 text-white text-sm font-semibold disabled:opacity-60">
            Create prospect
          </button>
        </div>
      )}
      {prospects.length === 0 ? (
        <p className="text-sm text-ent-text">No sales prospects yet.</p>
      ) : (
        <ul className="space-y-2">{prospects.map((p) => <ProspectCard key={p.id} prospect={p} onChanged={() => { void refresh(); }} />)}</ul>
      )}
    </div>
  );
}

const AMENDMENT_TYPE_LABEL: Record<AmendmentRequestType, string> = {
  expansion: 'Expansion', renewal: 'Renewal', downgrade: 'Downgrade', cancellation: 'Cancellation',
};

// OWNER DIRECTIVE MMA-ENT-SALES-006 Phase H5/I1 — "Director request ->
// Platform Owner commercial review -> terms/amendment -> ...". A
// cancellation request is approved directly (no quote, no checkout --
// see migration 113's own comment on why); every other request type
// is priced through the same quoting form shape as a brand-new
// prospect, which the server then wires into the existing sales
// pipeline (platform_owner_quote_amendment_request()).
function AmendmentRequestsPanel() {
  const [requests, setRequests] = useState<(OrganizationAmendmentRequest & { organizationName: string })[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});
  const [cancelNotes, setCancelNotes] = useState<Record<string, string>>({});
  const [quoteOpenId, setQuoteOpenId] = useState<string | null>(null);
  const [quoteForm, setQuoteForm] = useState<Record<string, {
    contactName: string; contactEmail: string; packageType: 'integrated_care' | 'therapist';
    seats: string; capacity: string; fee: string; cadence: string; termMonths: string; notes: string;
  }>>({});

  const refresh = useCallback(async () => { setRequests(await getAllAmendmentRequests()); }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const pending = requests.filter((r) => r.status === 'pending');

  const reject = async (id: string) => {
    const notes = rejectNotes[id]?.trim();
    if (!notes) { toast.error('Provide a reason.'); return; }
    setBusyId(id);
    try {
      const { error } = await rejectAmendmentRequest(id, notes);
      if (error) { toast.error(error); return; }
      toast.success('Request rejected.');
      void refresh();
    } finally { setBusyId(null); }
  };

  const approveCancellation = async (id: string) => {
    setBusyId(id);
    try {
      const { error } = await approveCancellationRequest(id, cancelNotes[id]?.trim() ?? '');
      if (error) { toast.error(error); return; }
      toast.success('Cancellation approved — the organization\'s license is now canceled.');
      void refresh();
    } finally { setBusyId(null); }
  };

  const defaultQuoteForm = () => ({
    contactName: '', contactEmail: '', packageType: 'integrated_care' as const,
    seats: '', capacity: '', fee: '', cadence: 'annual', termMonths: '', notes: '',
  });

  const submitQuote = async (id: string) => {
    const form = quoteForm[id] ?? defaultQuoteForm();
    if (!form.contactName.trim() || !form.contactEmail.trim() || !form.seats || !form.capacity) {
      toast.error('Contact name, email, seats, and capacity are required.');
      return;
    }
    setBusyId(id);
    try {
      const { error } = await quoteAmendmentRequest(id, {
        contactName: form.contactName.trim(), contactEmail: form.contactEmail.trim(), packageType: form.packageType,
        proposedLicensedSeats: Number(form.seats), proposedCoveredPatientCapacity: Number(form.capacity),
        annualLicenseFee: form.fee.trim() === '' ? null : Number(form.fee), billingCadence: form.cadence.trim() || null,
        quoteTermMonths: form.termMonths.trim() === '' ? null : Number(form.termMonths), notes: form.notes.trim() || null,
      });
      if (error) { toast.error(error); return; }
      toast.success('Amendment quoted — the Director can now pay for it.');
      setQuoteOpenId(null);
      void refresh();
    } finally { setBusyId(null); }
  };

  return (
    <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-5 sm:p-6 space-y-3">
      <h2 className="font-bold text-ent-ink">Organization Expansion / Renewal / Cancellation Requests</h2>
      {pending.length === 0 ? (
        <p className="text-sm text-ent-text">No amendment requests are currently pending.</p>
      ) : (
        <ul className="space-y-3">
          {pending.map((r) => {
            const form = quoteForm[r.id] ?? defaultQuoteForm();
            const setForm = (patch: Partial<typeof form>) => setQuoteForm((prev) => ({ ...prev, [r.id]: { ...form, ...patch } }));
            return (
              <li key={r.id} className="p-4 bg-ent-bg rounded-xl border border-ent-line space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="font-semibold text-ent-ink">{r.organizationName} — {AMENDMENT_TYPE_LABEL[r.requestType]}</p>
                  <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-ent-amber/20 text-ent-amber capitalize">{r.status}</span>
                </div>
                {typeof r.requestedDetails.description === 'string' && r.requestedDetails.description && (
                  <p className="text-xs text-ent-text">{r.requestedDetails.description}</p>
                )}
                {r.directorNotes && <p className="text-xs text-ent-muted">Director notes: {r.directorNotes}</p>}
                <p className="text-xs text-ent-muted">Requested {new Date(r.createdAt).toLocaleDateString()}</p>

                {r.requestType === 'cancellation' ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <input value={cancelNotes[r.id] ?? ''} onChange={(e) => setCancelNotes((p) => ({ ...p, [r.id]: e.target.value }))} placeholder="Confirmation notes (optional)…" className={`${inputCls} flex-1 min-w-[160px]`} />
                    <button type="button" onClick={() => { void approveCancellation(r.id); }} disabled={busyId === r.id} className="px-3 py-2 rounded-xl bg-ent-bronze hover:opacity-90 text-white text-sm font-semibold disabled:opacity-60">
                      Approve cancellation
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button type="button" onClick={() => setQuoteOpenId(quoteOpenId === r.id ? null : r.id)} className="px-3 py-2 rounded-xl bg-ent-bronze hover:opacity-90 text-white text-sm font-semibold">
                        {quoteOpenId === r.id ? 'Close quote form' : 'Quote this request'}
                      </button>
                    </div>
                    {quoteOpenId === r.id && (
                      <div className="p-3 bg-ent-panel rounded-xl border border-ent-line space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <input value={form.contactName} onChange={(e) => setForm({ contactName: e.target.value })} placeholder="Contact name" className={`${inputCls} flex-1 min-w-[140px]`} />
                          <input value={form.contactEmail} onChange={(e) => setForm({ contactEmail: e.target.value })} placeholder="Contact email" className={`${inputCls} flex-1 min-w-[160px]`} />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <select value={form.packageType} onChange={(e) => setForm({ packageType: e.target.value as 'integrated_care' | 'therapist' })} className={`${inputCls} w-48`}>
                            <option value="integrated_care">Full Enterprise</option>
                            <option value="therapist">Therapist Enterprise</option>
                          </select>
                          <input type="number" min={1} value={form.seats} onChange={(e) => setForm({ seats: e.target.value })} placeholder="Total seats" className={`${inputCls} w-32`} />
                          <input type="number" min={0} value={form.capacity} onChange={(e) => setForm({ capacity: e.target.value })} placeholder="Patient capacity" className={`${inputCls} w-36`} />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <input type="number" min={0} step="0.01" value={form.fee} onChange={(e) => setForm({ fee: e.target.value })} placeholder="Annual fee ($)" className={`${inputCls} w-36`} />
                          <select value={form.cadence} onChange={(e) => setForm({ cadence: e.target.value })} className={`${inputCls} w-36`}>
                            <option value="annual">Annual</option>
                            <option value="monthly">Monthly</option>
                          </select>
                          <input type="number" min={1} value={form.termMonths} onChange={(e) => setForm({ termMonths: e.target.value })} placeholder="Term (months, optional)" className={`${inputCls} w-48`} />
                        </div>
                        <textarea value={form.notes} onChange={(e) => setForm({ notes: e.target.value })} placeholder="Internal notes (optional)…" rows={2} className={inputCls} />
                        <button type="button" onClick={() => { void submitQuote(r.id); }} disabled={busyId === r.id} className="px-3 py-2 rounded-xl bg-ent-bronze hover:opacity-90 text-white text-xs font-semibold disabled:opacity-60">
                          Send quote
                        </button>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <input value={rejectNotes[r.id] ?? ''} onChange={(e) => setRejectNotes((p) => ({ ...p, [r.id]: e.target.value }))} placeholder="Rejection reason…" className={`${inputCls} flex-1 min-w-[160px]`} />
                      <button type="button" onClick={() => { void reject(r.id); }} disabled={busyId === r.id} className="px-3 py-2 rounded-xl border border-ent-rust text-ent-rust text-sm font-semibold hover:bg-ent-rust/10">Reject</button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// MMA-PROF-ONBOARD-004 P0-1 -- three distinct failure states instead
// of folding every non-success case into "not owner": a genuine
// backend/RPC error (missing function, network failure, misconfigured
// project) must never be presented to the operator as if their
// identity were merely unauthorized -- that hides a real infrastructure
// fault behind a security message and makes it unfixable from the UI.
type OwnerCheckStatus = 'checking' | 'owner' | 'not_owner' | 'backend_error';

export default function PlatformOwnerAdminPage() {
  const { state, dispatch } = useApp();
  const [status, setStatus] = useState<OwnerCheckStatus>('checking');
  const [backendErrorMessage, setBackendErrorMessage] = useState<string | null>(null);
  const [directorApps, setDirectorApps] = useState<ProfessionalApplication[]>([]);

  const refresh = useCallback(async () => {
    setStatus('checking');
    setBackendErrorMessage(null);
    try {
      const { data, error } = await supabase.rpc('is_platform_owner');
      if (error) {
        setStatus('backend_error');
        setBackendErrorMessage(error.message);
        return;
      }
      if (data !== true) {
        setStatus('not_owner');
        return;
      }
      setDirectorApps(await getDirectorApplications());
      setStatus('owner');
    } catch (err) {
      // Network failure, thrown rejection, or any other unexpected
      // exception must still resolve to an explicit error state --
      // never leave `status` stuck at 'checking' forever (an infinite
      // spinner is as unacceptable as a blank viewport).
      setStatus('backend_error');
      setBackendErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const handleLogout = async () => { await supabase.auth.signOut(); dispatch({ type: 'LOGOUT' }); toast('You have been logged out'); };

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ent-bg" data-testid="owner-page-loading">
        <Loader2 className="w-8 h-8 animate-spin text-ent-forest" />
      </div>
    );
  }

  if (status === 'backend_error') {
    return (
      <div className="min-h-screen bg-ent-bg flex items-center justify-center p-4" data-testid="owner-page-backend-error">
        <div className="max-w-md text-center space-y-3">
          <ShieldCheck className="w-10 h-10 text-ent-rust mx-auto" />
          <h1 className="text-lg font-bold text-ent-ink">Platform Owner administration is unavailable</h1>
          <p className="text-sm text-ent-text">We could not verify Platform Owner access because of a backend error. This is an infrastructure problem, not a permissions decision — please try again, and contact support if it persists.</p>
          {backendErrorMessage && <p className="text-xs text-ent-muted font-mono break-all">{backendErrorMessage}</p>}
          <button type="button" onClick={() => { void refresh(); }} className="px-4 py-2 rounded-xl bg-ent-bronze hover:opacity-90 text-white text-sm font-semibold">Retry</button>
        </div>
      </div>
    );
  }

  if (status === 'not_owner') {
    return (
      <div className="min-h-screen bg-ent-bg flex items-center justify-center p-4" data-testid="owner-page-unauthorized">
        <div className="max-w-md text-center space-y-3">
          <ShieldCheck className="w-10 h-10 text-ent-rust mx-auto" />
          <h1 className="text-lg font-bold text-ent-ink">Platform Owner access required</h1>
          <p className="text-sm text-ent-text">This area is restricted to verified Platform Owner administration.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ent-bg">
      <header className="bg-ent-panel border-b border-ent-line px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-ent-green flex items-center justify-center flex-shrink-0"><Sparkles className="w-5 h-5 text-ent-forest" /></div>
          <div>
            <div className="font-bold text-ent-ink text-sm leading-tight">Haneen Care Network</div>
            <div className="text-[10px] font-extrabold tracking-[0.14em] text-ent-bronze mt-0.5">PLATFORM OWNER ADMINISTRATION</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <span className="text-xs text-ent-muted">{state.currentUser?.email}</span>
          <button type="button" onClick={() => { void handleLogout(); }} className="flex items-center gap-1.5 text-sm text-ent-muted hover:text-ent-ink px-3 py-2 rounded-lg hover:bg-ent-pale">
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </header>
      <main className="p-4 sm:p-6">
        <div className="max-w-3xl mx-auto space-y-5">
          <DirectorApplicationsPanel apps={directorApps} onChanged={() => { void refresh(); }} />
          <LicenseTierPricingPanel />
          <CouponManagementPanel />
          <SalesPipelinePanel />
          <AmendmentRequestsPanel />
          <AccountDeletionRequestsPanel />
          <AccountClassificationPanel />
        </div>
      </main>
    </div>
  );
}
