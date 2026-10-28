// ENTERPRISE CONSOLIDATED DELIVERY — decides which dashboard a signed-in
// caregiver-role account sees. profiles.role stays 'caregiver' for every
// one of these people (item: "avoid indiscriminate changes to
// profiles.role") — organization authority is entirely additive, read
// fresh from organization_memberships on every load, never cached in the
// global account role. An account with NO active organization membership
// (the overwhelming majority of existing, residential accounts) renders
// CaregiverPortal completely unchanged — "preserve all already working
// residential and patient features."
import { useEffect, useState, useCallback } from 'react';
import { Loader2, Building2, Check, X } from 'lucide-react';
import { useApp } from '@/store/useApp';
import {
  getMyOrganizations, getMyPendingOrgInvites, respondToOrgInvite,
  type MyOrganization, type PendingOrgInvite,
} from '@/services/organizationService';
import {
  getMyPendingTherapistInvites, respondToTherapistInvite, getMyTherapistPatients,
  type PendingTherapistInvite, type ResidentialTherapistPatient,
} from '@/services/therapistConnectionService';
import { toast } from 'sonner';
import CaregiverPortal from '@/pages/caregiver/CaregiverPortal';
import OrganizationDirectorDashboard from './OrganizationDirectorDashboard';
import ClinicalOfficeDashboard from './ClinicalOfficeDashboard';
import ResidentialTherapistDashboard from './ResidentialTherapistDashboard';
import EnterpriseCaregiverDashboard from './EnterpriseCaregiverDashboard';
import SelfServiceApplicationFlow from '@/pages/professional/SelfServiceApplicationFlow';

export function PendingInvitesBanner({ invites, onResolved }: { invites: PendingOrgInvite[]; onResolved: () => void }) {
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const respond = async (invite: PendingOrgInvite, accept: boolean) => {
    setRespondingId(invite.membershipId);
    try {
      const { error } = await respondToOrgInvite(invite.membershipId, accept);
      if (error) { toast.error(error); return; }
      toast.success(accept ? `You've joined ${invite.organizationName}.` : 'Invitation declined.');
      onResolved();
    } finally {
      setRespondingId(null);
    }
  };

  if (invites.length === 0) return null;

  return (
    <div className="max-w-md mx-auto mt-6 space-y-3">
      {invites.map((inv) => (
        <div key={inv.membershipId} className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
          <p className="text-sm text-amber-900">
            <strong>{inv.organizationName}</strong> invited you to join as <strong>{inv.orgRole.replace('_', ' ')}</strong>.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { void respond(inv, true); }}
              disabled={respondingId === inv.membershipId}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-soft-sage hover:bg-soft-sage/90 text-white text-xs font-semibold disabled:opacity-60"
            >
              <Check className="w-3.5 h-3.5" /> Accept
            </button>
            <button
              type="button"
              onClick={() => { void respond(inv, false); }}
              disabled={respondingId === inv.membershipId}
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-soft-taupe text-charcoal text-xs font-semibold disabled:opacity-60"
            >
              <X className="w-3.5 h-3.5" /> Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// CODEX-VERIFIED CRITICAL REMEDIATION Critical 9 — "Provide
// understandable onboarding and invitation-pending states." Shown
// regardless of which dashboard branch below is ultimately chosen, so a
// caregiver-signed-in-as-therapist case is never missed.
function PendingTherapistInvitesBanner({ invites, onResolved }: { invites: PendingTherapistInvite[]; onResolved: () => void }) {
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const respond = async (invite: PendingTherapistInvite, accept: boolean) => {
    setRespondingId(invite.connectionId);
    try {
      const { error } = await respondToTherapistInvite(invite.connectionId, accept);
      if (error) { toast.error(error); return; }
      toast.success(accept ? `You can now communicate about ${invite.patientFirstName}.` : 'Invitation declined.');
      onResolved();
    } finally {
      setRespondingId(null);
    }
  };

  if (invites.length === 0) return null;

  return (
    <div className="max-w-md mx-auto mt-6 space-y-3">
      {invites.map((inv) => (
        <div key={inv.connectionId} className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
          <p className="text-sm text-amber-900">
            <strong>{inv.caregiverFirstName} {inv.caregiverLastName}</strong> invited you as a <strong>{inv.relationshipType}</strong> therapist
            for <strong>{inv.patientPreferredName || inv.patientFirstName}</strong>.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { void respond(inv, true); }}
              disabled={respondingId === inv.connectionId}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-soft-sage hover:bg-soft-sage/90 text-white text-xs font-semibold disabled:opacity-60"
            >
              <Check className="w-3.5 h-3.5" /> Accept
            </button>
            <button
              type="button"
              onClick={() => { void respond(inv, false); }}
              disabled={respondingId === inv.connectionId}
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-soft-taupe text-charcoal text-xs font-semibold disabled:opacity-60"
            >
              <X className="w-3.5 h-3.5" /> Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// FIVE-OFFICE ENTERPRISE PLATFORM §5.4/§12 — "If a user has multiple
// legitimate offices, provide an office switcher... An unauthorized
// office must not become accessible through a direct URL... Office
// visibility and backend permissions must be enforced independently."
// `orgs` (from getMyOrganizations) is the single source of truth for
// which offices a user actually, currently holds — the switcher below
// only ever lists roles present in that real, server-returned list; it
// never grants a new one. Selecting a pill changes ONLY which already-
// authorized dashboard renders in this browser tab (local component
// state, not persisted) — every one of those dashboards performs its
// own independent, unchanged authorization check regardless of how the
// user arrived at it, so switching confers no new backend privilege.
type OfficeKey = 'director' | 'therapist' | 'medical' | 'caregiver';
const OFFICE_LABELS: Record<OfficeKey, string> = {
  director: 'Admin / Director', therapist: 'Therapist', medical: 'Medical Professional', caregiver: 'Caregiver',
};

function OfficeSwitcher({ offices, selected, onSelect }: { offices: { key: OfficeKey; orgName: string }[]; selected: OfficeKey; onSelect: (key: OfficeKey) => void }) {
  if (offices.length < 2) return null;
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2 flex-wrap">
      <span className="text-xs font-semibold text-amber-900">You hold more than one office here — viewing:</span>
      {offices.map((o) => (
        <button
          key={o.key} type="button" onClick={() => onSelect(o.key)}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
            selected === o.key ? 'bg-warm-bronze text-white' : 'bg-white text-charcoal border border-amber-300 hover:bg-amber-100'
          }`}
        >
          {OFFICE_LABELS[o.key]} — {o.orgName}
        </button>
      ))}
    </div>
  );
}

// P1 OWNER-VISIBLE DASHBOARD DELIVERY — the approved Enterprise visual
// shell must not depend on possessing an Enterprise organization
// membership merely to render its non-sensitive navigation and layout.
// `businessWorkspace` is true only when this router was reached via
// the dedicated /business entry point (never the generic authenticated
// fallback every other role/route also uses) — it distinguishes
// "the user explicitly entered the Business workspace" from "the user
// is simply a caregiver-role account, wherever they happen to be."
// When true, a plain caregiver with no Enterprise organization still
// sees the approved shell (EnterpriseCaregiverDashboard renders its own
// honest "no organization connected" state) instead of being silently
// dropped into the residential CaregiverPortal. The ordinary,
// non-/business authenticated path is completely unchanged — residential
// caregivers keep their existing experience exactly as before.
export default function EnterpriseDashboardRouter({ businessWorkspace = false }: { businessWorkspace?: boolean } = {}) {
  const { state } = useApp();
  const [orgs, setOrgs] = useState<MyOrganization[]>([]);
  const [invites, setInvites] = useState<PendingOrgInvite[]>([]);
  const [therapistInvites, setTherapistInvites] = useState<PendingTherapistInvite[]>([]);
  const [therapistPatients, setTherapistPatients] = useState<ResidentialTherapistPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [selectedOffice, setSelectedOffice] = useState<OfficeKey | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [o, i, ti, tp] = await Promise.all([
        getMyOrganizations(), getMyPendingOrgInvites(), getMyPendingTherapistInvites(), getMyTherapistPatients(),
      ]);
      setOrgs(o);
      setInvites(i);
      setTherapistInvites(ti);
      setTherapistPatients(tp);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-warm-ivory"><Loader2 className="w-8 h-8 animate-spin text-warm-bronze" /></div>;
  }

  const director = orgs.find((o) => o.orgRole === 'director');
  const therapist = orgs.find((o) => o.orgRole === 'therapist');
  const medical = orgs.find((o) => o.orgRole === 'medical_professional');
  const hasCaregiverOrgRole = orgs.some((o) => o.orgRole === 'caregiver');

  const therapistBanner = <PendingTherapistInvitesBanner invites={therapistInvites} onResolved={() => { void refresh(); }} />;

  // Every org role this real, authenticated user currently, actively
  // holds — in this exact priority order (director > therapist >
  // medical > caregiver), matching the fallback order below so the
  // DEFAULT office is unchanged for everyone who holds only one.
  const availableOffices: { key: OfficeKey; orgName: string }[] = [
    ...(director ? [{ key: 'director' as const, orgName: director.organizationName }] : []),
    ...(therapist ? [{ key: 'therapist' as const, orgName: therapist.organizationName }] : []),
    ...(medical ? [{ key: 'medical' as const, orgName: medical.organizationName }] : []),
    ...(hasCaregiverOrgRole ? [{ key: 'caregiver' as const, orgName: orgs.find((o) => o.orgRole === 'caregiver')!.organizationName }] : []),
  ];
  // A stale selection (e.g. the office was revoked since it was picked)
  // never falls back to an unauthorized office — it simply stops being
  // selectable and the normal priority order below takes over.
  const effectiveOffice: OfficeKey | null = selectedOffice && availableOffices.some((o) => o.key === selectedOffice) ? selectedOffice : null;
  const switcher = <OfficeSwitcher offices={availableOffices} selected={effectiveOffice ?? availableOffices[0]?.key} onSelect={setSelectedOffice} />;

  // Director takes priority when present — they manage the organization
  // itself, a superset of any other role they might also hold there.
  if (director && (effectiveOffice === null || effectiveOffice === 'director')) {
    return (
      <div>
        {switcher}
        <PendingInvitesBanner invites={invites} onResolved={() => { void refresh(); }} />
        {therapistBanner}
        <OrganizationDirectorDashboard organizationId={director.organizationId} />
      </div>
    );
  }

  if (therapist && (effectiveOffice === null || effectiveOffice === 'therapist')) {
    return (
      <div>
        {switcher}
        <PendingInvitesBanner invites={invites} onResolved={() => { void refresh(); }} />
        {therapistBanner}
        <ClinicalOfficeDashboard filterRole="therapist" />
      </div>
    );
  }

  if (medical && (effectiveOffice === null || effectiveOffice === 'medical')) {
    return (
      <div>
        {switcher}
        <PendingInvitesBanner invites={invites} onResolved={() => { void refresh(); }} />
        {therapistBanner}
        <ClinicalOfficeDashboard filterRole="medical_professional" />
      </div>
    );
  }

  // CODEX-VERIFIED CRITICAL REMEDIATION Critical 9: a plain RESIDENTIAL
  // therapist (connected via the invite/accept workflow, migration 051,
  // with no Enterprise organization at all) has no org role to route on
  // — this is their only reachable dashboard. Deliberately only taken
  // when they are not ALSO an ordinary org-caregiver, so an existing
  // caregiver's own experience is never displaced by this new branch.
  if (!hasCaregiverOrgRole && therapistPatients.length > 0) {
    return (
      <div>
        <PendingInvitesBanner invites={invites} onResolved={() => { void refresh(); }} />
        {therapistBanner}
        <ResidentialTherapistDashboard />
      </div>
    );
  }

  // ROUND 5 — locked Enterprise Caregiver Portal requirement:
  // "Enterprise caregivers land in their own shell," with its own
  // stable 14-item navigation, distinct from the residential
  // CaregiverPortal. Previously an org-caregiver fell through into
  // CaregiverPortal with org patients merely merged into "My
  // Patients" — never a dedicated shell. Takes priority over the
  // generic caregiver branch below the moment the caregiver org role
  // is ACTIVE (not merely invited — an outstanding invite still needs
  // CaregiverPortal's accept banner first).
  if (hasCaregiverOrgRole && (effectiveOffice === null || effectiveOffice === 'caregiver')) {
    return (
      <div>
        {switcher}
        <PendingInvitesBanner invites={invites} onResolved={() => { void refresh(); }} />
        {therapistBanner}
        <EnterpriseCaregiverDashboard />
      </div>
    );
  }

  // Reached via /business with no Enterprise organization membership at
  // all: show the approved Enterprise shell itself, not the residential
  // CaregiverPortal — EnterpriseCaregiverDashboard renders its own
  // honest "no organization connected" state (with the same legitimate
  // Start-an-Organization action) rather than falsely implying
  // Enterprise access or silently redirecting to a different product.
  if (businessWorkspace) {
    return (
      <div>
        <PendingInvitesBanner invites={invites} onResolved={() => { void refresh(); }} />
        {therapistBanner}
        <EnterpriseCaregiverDashboard />
      </div>
    );
  }

  // Ordinary residential caregiver, or one with an outstanding org
  // invite not yet accepted — unchanged, byte-for-byte residential
  // experience. Only reached outside /business.
  if (invites.length > 0 || !showCreateOrg) {
    return (
      <div>
        <PendingInvitesBanner invites={invites} onResolved={() => { void refresh(); }} />
        {therapistBanner}
        <CaregiverPortal onStartOrganization={() => setShowCreateOrg(true)} />
      </div>
    );
  }

  // MMA-PROF-ONBOARD-004 -- this residential "/business Start an
  // Organization" fallback used to render CreateOrgCard, a two-field
  // quick-create form with no pricing, tier, or billing step at all
  // (migration 083's own create_organization() RPC, which still submits
  // a real pending Director application -- never self-approval -- but
  // never collected a license tier or commercial terms). "Logged-in
  // accounts with no organization enter or resume that same
  // application" now routes this entry point into the SAME canonical
  // self-service flow /Professional/Register uses, rather than leaving
  // a second, lower-fidelity path alive.
  const legalName = [state.currentUser?.firstName, state.currentUser?.lastName].filter(Boolean).join(' ').trim();
  return (
    <div className="min-h-screen bg-warm-ivory flex flex-col items-center p-4 gap-4">
      <div className="flex items-center gap-2 text-warm-bronze mt-6">
        <Building2 className="w-6 h-6" />
        <h1 className="text-xl font-bold text-charcoal">Start an Organization</h1>
      </div>
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-card border border-soft-taupe p-6 sm:p-7">
        <SelfServiceApplicationFlow legalName={legalName} contactEmail={state.currentUser?.email ?? ''} onSubmitted={() => { void refresh(); }} />
      </div>
      <button type="button" onClick={() => setShowCreateOrg(false)} className="text-sm text-medium-gray hover:text-charcoal underline">
        Back to my dashboard
      </button>
    </div>
  );
}
