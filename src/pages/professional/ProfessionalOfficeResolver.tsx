// P1 CORRECTIVE ORDER — the single authenticated resolver for every
// office reachable through /Professional. Mirrors
// EnterpriseDashboardRouter.tsx's own established pattern (read real
// organization_memberships, never trust the URL) and extends it with the
// one dimension that router doesn't cover: Enterprise patient coverage
// (is_my_enterprise_coverage_active(), the same RPC
// EnterprisePatientRouter.tsx and SubscriptionContext.tsx already rely
// on). EnterpriseDashboardRouter itself is left completely untouched —
// this is a SEPARATE resolver for the SEPARATE /Professional entry
// point, reusing the same underlying data sources rather than the same
// component, so /business and the old top-level /Admin etc. keep their
// own established residential-fallback behavior exactly as before.
import { useEffect, useState, useCallback } from 'react';
import { useApp } from '@/store/useApp';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Loader2, ShieldAlert, LogOut, Sparkles, KeyRound, ChevronDown, ChevronUp } from 'lucide-react';
import { getMyOrganizations, getMyPendingOrgInvites, type MyOrganization, type PendingOrgInvite } from '@/services/organizationService';
import { getMyApplication, getMyApplicationDraft, type ProfessionalApplication } from '@/services/professionalApplicationService';
import { redeemQuoteInvitation, quoteTermsFromDraft, type RedemptionOutcome, type RedeemedQuoteTerms } from '@/services/salesService';
import DirectorApplicationWizard from './DirectorApplicationWizard';
import OrganizationDirectorDashboard from '@/pages/enterprise/OrganizationDirectorDashboard';
import SelfServiceApplicationFlow from './SelfServiceApplicationFlow';
import { PendingInvitesBanner } from '@/pages/enterprise/EnterpriseDashboardRouter';
import EnterpriseCaregiverDashboard from '@/pages/enterprise/EnterpriseCaregiverDashboard';
import ClinicalOfficeDashboard from '@/pages/enterprise/ClinicalOfficeDashboard';
import OtherSpecialistOffice from '@/pages/enterprise/OtherSpecialistOffice';
import EnterprisePatientDashboard from '@/pages/patient/EnterprisePatientDashboard';
import ApplicationStatusPage from './ApplicationStatusPage';

const inputCls = 'w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ent-bronze border-ent-line bg-ent-panel';

const OUTCOME_MESSAGE: Record<Exclude<RedemptionOutcome, 'redeemed'>, string> = {
  not_found: "That code wasn't recognized. Double-check it and try again, or contact the person who sent it to you.",
  expired: 'That invitation has expired. Contact My Memoria Ally to request a new one.',
  revoked: "That invitation is no longer valid. If you believe this is a mistake, contact the person who sent it.",
  already_used: 'That invitation has already been used.',
  wrong_recipient: 'That invitation was issued to a different email address. Sign in with the matching account, or contact the person who sent it.',
};

// OWNER DIRECTIVE MMA-ENT-SALES-003 §1 — the Phase C invitation-
// redemption bridge. The raw token lives only in this component's own
// transient state: never written to localStorage/sessionStorage, never
// logged, and cleared the instant redeemQuoteInvitation() returns
// (success or not) — it has done its one job either way. A 'redeemed'
// outcome locks the organization name and package type from the quote
// (shown read-only below, never an editable field) and submits the
// SAME director-application RPC CreateOrgCard already uses; the quote's
// id is folded into application_details so Platform Owner review can
// cross-reference the originating commercial terms, with no new column
// on the already-heavily-audited professional_applications table.
// Double-submission across tabs/retries is already structurally
// prevented: submit_professional_application() itself rejects a second
// submission while one is under review, and a successful submit flips
// the resolver (via onApplicationStarted's refresh) to
// ApplicationStatusPage, which no longer renders this form at all.
function RedeemInvitationSection({ onApplicationStarted }: { onApplicationStarted: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [token, setToken] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [outcomeMessage, setOutcomeMessage] = useState<string | null>(null);
  const [terms, setTerms] = useState<RedeemedQuoteTerms | null>(null);
  const [existingDraft, setExistingDraft] = useState<ProfessionalApplication | null>(null);
  // Starts true: a reload, a different device, or logging back in must
  // resume straight into the wizard from an already-saved draft, never
  // require re-pasting the (single-use, already-consumed) token.
  const [loadingDraft, setLoadingDraft] = useState(true);

  useEffect(() => {
    void (async () => {
      const draft = await getMyApplicationDraft();
      const snapshot = draft ? quoteTermsFromDraft(draft) : null;
      if (draft && snapshot) {
        setExistingDraft(draft);
        setTerms(snapshot);
      }
      setLoadingDraft(false);
    })();
  }, []);

  const redeem = async () => {
    const raw = token.trim();
    if (!raw) return;
    setRedeeming(true);
    setOutcomeMessage(null);
    try {
      const { outcome, terms: redeemedTerms, error } = await redeemQuoteInvitation(raw);
      if (error || !outcome) { toast.error(error || 'Could not process that invitation.'); return; }
      if (outcome !== 'redeemed') { setOutcomeMessage(OUTCOME_MESSAGE[outcome]); return; }
      setLoadingDraft(true);
      // A redemption always re-derives org name/package server-side on
      // the next draft save (migration 109), so resuming any existing
      // draft here is safe even if it belonged to a different quote.
      const draft = await getMyApplicationDraft();
      setExistingDraft(draft);
      setLoadingDraft(false);
      setTerms(redeemedTerms);
    } finally {
      setRedeeming(false);
      setToken(''); // the raw token has done its one job; never retained
    }
  };

  if (loadingDraft) {
    return <Loader2 className="w-5 h-5 animate-spin text-ent-forest mx-auto" />;
  }

  if (terms) {
    return <DirectorApplicationWizard terms={terms} existingDraft={existingDraft} onSubmitted={onApplicationStarted} />;
  }

  return (
    <div className="w-full max-w-md">
      <button type="button" onClick={() => setExpanded((e) => !e)} className="flex items-center gap-1.5 text-xs font-semibold text-ent-bronze hover:underline mx-auto">
        <KeyRound className="w-3.5 h-3.5" /> Have an invitation code? {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {expanded && (
        <div className="mt-2 p-3 bg-ent-bg rounded-xl border border-ent-line space-y-2">
          <div className="flex gap-2">
            <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste your invitation code" className={`${inputCls} flex-1`} />
            <button type="button" onClick={() => { void redeem(); }} disabled={redeeming || !token.trim()} className="px-3 py-2 rounded-xl bg-ent-bronze hover:opacity-90 text-white text-xs font-semibold disabled:opacity-60 flex-shrink-0">
              {redeeming ? 'Checking…' : 'Accept'}
            </button>
          </div>
          {outcomeMessage && <p className="text-xs text-ent-rust">{outcomeMessage}</p>}
        </div>
      )}
    </div>
  );
}

export type ProfessionalOfficeKey = 'admin' | 'caregiver' | 'medical' | 'therapy' | 'other' | 'patient';

const OFFICE_SEGMENT: Record<ProfessionalOfficeKey, string> = {
  admin: 'Admin', caregiver: 'Caregiver', medical: 'Medical', therapy: 'Therapy', other: 'Other', patient: 'Patient',
};
const OFFICE_LABEL: Record<ProfessionalOfficeKey, string> = {
  admin: 'Admin / Director', caregiver: 'Enterprise Caregiver', medical: 'Medical Professional', therapy: 'Therapist Professional', other: 'Other Specialist', patient: 'Enterprise Patient',
};
// Priority order when no office is explicitly requested in the URL and
// the signed-in user holds more than one — identical ordering to
// EnterpriseDashboardRouter's own established priority (director >
// therapist > medical > caregiver), with Enterprise patient appended
// last since it is the newly-added fifth dimension and no existing
// behavior ever ranked it.
const PRIORITY_ORDER: ProfessionalOfficeKey[] = ['admin', 'therapy', 'medical', 'caregiver', 'other', 'patient'];

function parseRequestedOffice(): ProfessionalOfficeKey | null {
  const segments = window.location.pathname.split('/').filter(Boolean); // ['Professional', 'Admin', ...]
  const seg = (segments[1] || '').toLowerCase();
  return (Object.keys(OFFICE_SEGMENT) as ProfessionalOfficeKey[]).find((k) => OFFICE_SEGMENT[k].toLowerCase() === seg) ?? null;
}

// P1 CORRECTIVE ORDER, PHASE B — the prior version of this screen was a
// true dead end: no link anywhere back to an application, and no
// awareness of a pending staff invitation (get_my_organizations() only
// ever returns ACTIVE memberships; an 'invited' one is a separate RPC,
// get_my_pending_org_invites(), that this resolver never called before).
// Two distinct, owner-approved paths are offered now, neither of which
// grants access by itself: (1) a pending invite can be accepted/declined
// inline (reusing the exact same respond_to_org_invite() RPC and banner
// component the legacy /business tree already uses — no new mechanism);
// (2) absent any invite, a prospective founding Director can apply
// (reusing CreateOrgCard exactly as-is — it already calls
// create_organization(), which itself only ever submits a
// professional_applications row for Platform Owner review; Director
// access is still never self-awarded).
function AccessRequiredState({
  onLogout,
  pendingInvites,
  onInviteResolved,
  onApplicationStarted,
  legalName,
  contactEmail,
}: {
  onLogout: () => void;
  pendingInvites: PendingOrgInvite[];
  onInviteResolved: () => void;
  onApplicationStarted: () => void;
  legalName: string;
  contactEmail: string;
}) {
  const hasInvites = pendingInvites.length > 0;
  return (
    <div className="min-h-screen bg-ent-bg flex flex-col">
      <header className="bg-ent-panel border-b border-ent-line px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-ent-green flex items-center justify-center flex-shrink-0"><Sparkles className="w-5 h-5 text-ent-forest" /></div>
          <div className="font-bold text-ent-ink text-sm">My Memoria Ally — Professional Workspace</div>
        </div>
        <button type="button" onClick={onLogout} className="flex items-center gap-1.5 text-sm text-ent-muted hover:text-ent-ink px-3 py-2 rounded-lg hover:bg-ent-pale">
          <LogOut className="w-4 h-4" /> Logout
        </button>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center p-4 gap-6">
        <div className="max-w-md text-center space-y-3">
          <ShieldAlert className="w-10 h-10 text-ent-bronze mx-auto" />
          <h1 className="text-lg font-bold text-ent-ink">{hasInvites ? 'You have a pending invitation' : 'Organization access required'}</h1>
          <p className="text-sm text-ent-text">
            {hasInvites
              ? 'Accept below to join, or decline if you don’t recognize this organization.'
              : 'Your account is not currently authorized for any Enterprise office. An organization’s director adds staff ' +
                'members directly, and Enterprise patient access is granted by your care organization — ask them to add you, and ' +
                'you’ll be able to sign back in here once access is active.'}
          </p>
        </div>
        {hasInvites ? (
          <PendingInvitesBanner invites={pendingInvites} onResolved={onInviteResolved} />
        ) : (
          <div className="w-full max-w-md space-y-3">
            <RedeemInvitationSection onApplicationStarted={onApplicationStarted} />
            <div className="flex items-center gap-2 justify-center text-xs font-semibold text-ent-muted uppercase tracking-wide">
              <span className="h-px flex-1 bg-ent-line" /> New to Enterprise? <span className="h-px flex-1 bg-ent-line" />
            </div>
            {/* MMA-PROF-ONBOARD-004 -- the second of the three originally-
                fragmented Director entry paths this directive names
                explicitly. Converges into the SAME canonical self-service
                flow /Professional/Register and the residential /business
                fallback both now use, instead of the old two-field
                CreateOrgCard quick-create with no pricing/tier/billing
                step. */}
            <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-6">
              <SelfServiceApplicationFlow legalName={legalName} contactEmail={contactEmail} onSubmitted={onApplicationStarted} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function OfficeSelector({ offices, onSelect }: { offices: { key: ProfessionalOfficeKey; orgName: string }[]; onSelect: (key: ProfessionalOfficeKey) => void }) {
  return (
    <div className="min-h-screen bg-ent-bg flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-4">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-ent-green flex items-center justify-center mx-auto mb-3"><Sparkles className="w-6 h-6 text-ent-forest" /></div>
          <h1 className="text-xl font-bold text-ent-ink">Choose your workspace</h1>
          <p className="text-sm text-ent-muted mt-1">You have access to more than one office.</p>
        </div>
        <div className="space-y-2">
          {offices.map((o) => (
            <button
              key={o.key} type="button" onClick={() => onSelect(o.key)}
              className="w-full flex items-center justify-between gap-3 p-4 bg-ent-panel rounded-2xl border border-ent-line hover:shadow-sm transition-all text-left"
            >
              <div>
                <p className="font-bold text-ent-ink">{OFFICE_LABEL[o.key]}</p>
                <p className="text-xs text-ent-muted">{o.orgName}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function OfficeSwitcherBar({ offices, selected, onSelect }: { offices: { key: ProfessionalOfficeKey; orgName: string }[]; selected: ProfessionalOfficeKey; onSelect: (key: ProfessionalOfficeKey) => void }) {
  if (offices.length < 2) return null;
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2 flex-wrap">
      <span className="text-xs font-semibold text-amber-900">You hold more than one office here — viewing:</span>
      {offices.map((o) => (
        <button
          key={o.key} type="button" onClick={() => onSelect(o.key)}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
            selected === o.key ? 'bg-ent-bronze text-white' : 'bg-white text-ent-ink border border-amber-300 hover:bg-amber-100'
          }`}
        >
          {OFFICE_LABEL[o.key]} — {o.orgName}
        </button>
      ))}
    </div>
  );
}

export default function ProfessionalOfficeResolver() {
  const { state, dispatch } = useApp();
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState<MyOrganization[]>([]);
  // P1 CODEX-002 CORRECTIVE ORDER (P1-01) — this used to be a plain
  // `is_my_enterprise_coverage_active()` boolean, which only ever asks
  // "am I personally a covered patient." An Authorized Patient
  // Representative's own auth.uid() is the REPRESENTATIVE's identity,
  // never a patients(id) row — that check was always false for them,
  // which is exactly why an approved, active representative saw
  // "Organization access required" instead of the Patient Office.
  // get_my_patient_office_subject() (migration 154) resolves the correct
  // PATIENT id regardless of whether the caller is the patient
  // themselves or their active representative; every downstream fetch
  // must use THIS id, never the caller's own, for the Patient Office.
  const [patientOfficeSubjectId, setPatientOfficeSubjectId] = useState<string | null>(null);
  const [requestedOffice, setRequestedOffice] = useState<ProfessionalOfficeKey | null>(() => parseRequestedOffice());
  const [manualSelection, setManualSelection] = useState<ProfessionalOfficeKey | null>(null);
  const [myApplication, setMyApplication] = useState<ProfessionalApplication | null>(null);
  const [pendingInvites, setPendingInvites] = useState<PendingOrgInvite[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [o, subjectResult, app, invites] = await Promise.all([
      getMyOrganizations(), supabase.rpc('get_my_patient_office_subject'), getMyApplication(), getMyPendingOrgInvites(),
    ]);
    setOrgs(o);
    setPatientOfficeSubjectId(typeof subjectResult.data === 'string' ? subjectResult.data : null);
    setMyApplication(app);
    setPendingInvites(invites);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const onPopState = () => setRequestedOffice(parseRequestedOffice());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    dispatch({ type: 'LOGOUT' });
    toast('You have been logged out');
  };

  const navigateToOffice = useCallback((key: ProfessionalOfficeKey) => {
    setManualSelection(key);
    setRequestedOffice(key);
    const path = `/Professional/${OFFICE_SEGMENT[key]}`;
    if (window.location.pathname.toLowerCase() !== path.toLowerCase()) window.history.pushState({}, '', path);
  }, []);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-ent-bg"><Loader2 className="w-8 h-8 animate-spin text-ent-forest" /></div>;
  }

  const director = orgs.find((o) => o.orgRole === 'director');
  const therapist = orgs.find((o) => o.orgRole === 'therapist');
  const medical = orgs.find((o) => o.orgRole === 'medical_professional');
  const caregiver = orgs.find((o) => o.orgRole === 'caregiver');
  const otherSpecialist = orgs.find((o) => o.orgRole === 'other_specialist');

  const availableOffices: { key: ProfessionalOfficeKey; orgName: string }[] = [
    ...(director ? [{ key: 'admin' as const, orgName: director.organizationName }] : []),
    ...(therapist ? [{ key: 'therapy' as const, orgName: therapist.organizationName }] : []),
    ...(medical ? [{ key: 'medical' as const, orgName: medical.organizationName }] : []),
    ...(caregiver ? [{ key: 'caregiver' as const, orgName: caregiver.organizationName }] : []),
    ...(otherSpecialist ? [{ key: 'other' as const, orgName: otherSpecialist.organizationName }] : []),
    ...(patientOfficeSubjectId ? [{ key: 'patient' as const, orgName: 'Your Care Organization' }] : []),
  ];

  if (availableOffices.length === 0) {
    // §12 — "If the account remains Pending Review, show an
    // application-status page... If Additional Information Required...
    // If Rejected..." Takes priority over the generic "Access required"
    // state whenever a real application exists in one of these states.
    // A withdrawn/approved/suspended/revoked application falls through
    // to the generic state instead (approved-but-zero-offices can only
    // mean the resulting membership was since revoked).
    if (myApplication && myApplication.status === 'info_required' && myApplication.requestedOffice === 'director') {
      const correctionTerms = quoteTermsFromDraft(myApplication);
      const allowedSteps = (myApplication.correctionRequestedFields as { allowedSteps?: string[] } | null)?.allowedSteps;
      if (correctionTerms && allowedSteps && allowedSteps.length > 0) {
        return (
          <DirectorApplicationWizard
            terms={correctionTerms}
            existingDraft={null}
            onSubmitted={() => { void refresh(); }}
            correction={{ application: myApplication, allowedSteps: new Set(allowedSteps), correctionRequest: myApplication.correctionRequest ?? '' }}
          />
        );
      }
      // A non-director correction, or a director application that
      // somehow predates the wizard (no quote snapshot) -- the original,
      // simpler 3-field correction form remains the fallback, unchanged.
    }
    // MMA-PROF-ONBOARD-004 -- extended with the self-service lifecycle's
    // own non-terminal/informative states (migration 162), additive to
    // the original list. 'active'/'approved' are deliberately excluded:
    // by the time a license is active, provisioning has already
    // created a real organization + Director membership, so
    // getMyOrganizations() picks the user up before this fallback is
    // ever reached at all. 'draft'/'withdrawn' stay excluded too --
    // falling through to AccessRequiredState lets the applicant start
    // over, unchanged from the original behavior.
    if (myApplication && [
      'pending_review', 'info_required', 'resubmitted', 'rejected',
      'auto_verification_pending', 'manual_review', 'agreements_pending', 'agreements_executed',
      'payment_authorization_pending', 'payment_verified', 'provisioning_pending', 'canceled',
    ].includes(myApplication.status)) {
      return <ApplicationStatusPage application={myApplication} onRefresh={() => { void refresh(); }} />;
    }
    return (
      <AccessRequiredState
        onLogout={() => { void handleLogout(); }}
        pendingInvites={pendingInvites}
        onInviteResolved={() => { void refresh(); }}
        onApplicationStarted={() => { void refresh(); }}
        legalName={[state.currentUser?.firstName, state.currentUser?.lastName].filter(Boolean).join(' ').trim()}
        contactEmail={state.currentUser?.email ?? ''}
      />
    );
  }

  // A requested office the user does NOT actually hold is never
  // honored — "never grant access merely because a user selected or
  // entered a route." Falls through to the normal resolution below.
  const requestedIsAuthorized = requestedOffice !== null && availableOffices.some((o) => o.key === requestedOffice);
  const manualIsAuthorized = manualSelection !== null && availableOffices.some((o) => o.key === manualSelection);

  // No office explicitly requested AND the user holds more than one:
  // let them choose, rather than silently defaulting to one.
  if (!requestedIsAuthorized && !manualIsAuthorized && requestedOffice === null && availableOffices.length > 1) {
    return <OfficeSelector offices={availableOffices} onSelect={navigateToOffice} />;
  }

  const effective: ProfessionalOfficeKey = requestedIsAuthorized ? requestedOffice! : manualIsAuthorized ? manualSelection! : availableOffices.find((o) => PRIORITY_ORDER.indexOf(o.key) === Math.min(...availableOffices.map((x) => PRIORITY_ORDER.indexOf(x.key))))!.key;

  // Canonicalize the URL to the effective, authorized office so a
  // revoked or mistyped office segment never silently keeps rendering
  // a stale URL.
  if (!requestedIsAuthorized && requestedOffice !== effective) {
    const path = `/Professional/${OFFICE_SEGMENT[effective]}`;
    if (window.location.pathname.toLowerCase() !== path.toLowerCase()) window.history.replaceState({}, '', path);
  }

  const switcher = <OfficeSwitcherBar offices={availableOffices} selected={effective} onSelect={navigateToOffice} />;
  const officeBasePath = `/Professional/${OFFICE_SEGMENT[effective]}`;

  return (
    <div>
      {switcher}
      {effective === 'admin' && director && <OrganizationDirectorDashboard organizationId={director.organizationId} basePath={officeBasePath} />}
      {effective === 'caregiver' && <EnterpriseCaregiverDashboard basePath={officeBasePath} />}
      {effective === 'medical' && <ClinicalOfficeDashboard filterRole="medical_professional" basePath={officeBasePath} />}
      {effective === 'therapy' && <ClinicalOfficeDashboard filterRole="therapist" basePath={officeBasePath} />}
      {effective === 'other' && otherSpecialist && <OtherSpecialistOffice organizationName={otherSpecialist.organizationName} />}
      {effective === 'patient' && patientOfficeSubjectId && <EnterprisePatientDashboard basePath={officeBasePath} subjectPatientId={patientOfficeSubjectId} />}
    </div>
  );
}
