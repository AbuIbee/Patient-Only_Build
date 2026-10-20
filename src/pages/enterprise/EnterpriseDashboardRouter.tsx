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
import OrganizationDirectorDashboard, { CreateOrgCard } from './OrganizationDirectorDashboard';
import StaffCaseloadDashboard from './StaffCaseloadDashboard';
import ResidentialTherapistDashboard from './ResidentialTherapistDashboard';
import EnterpriseCaregiverDashboard from './EnterpriseCaregiverDashboard';

function PendingInvitesBanner({ invites, onResolved }: { invites: PendingOrgInvite[]; onResolved: () => void }) {
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

export default function EnterpriseDashboardRouter() {
  const [orgs, setOrgs] = useState<MyOrganization[]>([]);
  const [invites, setInvites] = useState<PendingOrgInvite[]>([]);
  const [therapistInvites, setTherapistInvites] = useState<PendingTherapistInvite[]>([]);
  const [therapistPatients, setTherapistPatients] = useState<ResidentialTherapistPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateOrg, setShowCreateOrg] = useState(false);

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

  // Director takes priority when present — they manage the organization
  // itself, a superset of any other role they might also hold there.
  if (director) {
    return (
      <div>
        <PendingInvitesBanner invites={invites} onResolved={() => { void refresh(); }} />
        {therapistBanner}
        <OrganizationDirectorDashboard organizationId={director.organizationId} />
      </div>
    );
  }

  if (therapist) {
    return (
      <div>
        <PendingInvitesBanner invites={invites} onResolved={() => { void refresh(); }} />
        {therapistBanner}
        <StaffCaseloadDashboard roleLabel="Therapist" filterRole="therapist" />
      </div>
    );
  }

  if (medical) {
    return (
      <div>
        <PendingInvitesBanner invites={invites} onResolved={() => { void refresh(); }} />
        {therapistBanner}
        <StaffCaseloadDashboard roleLabel="Medical Professional" filterRole="medical_professional" />
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
  if (hasCaregiverOrgRole) {
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
  // experience.
  if (invites.length > 0 || !showCreateOrg) {
    return (
      <div>
        <PendingInvitesBanner invites={invites} onResolved={() => { void refresh(); }} />
        {therapistBanner}
        <CaregiverPortal onStartOrganization={() => setShowCreateOrg(true)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-ivory flex flex-col items-center justify-center p-4 gap-4">
      <div className="flex items-center gap-2 text-warm-bronze">
        <Building2 className="w-6 h-6" />
        <h1 className="text-xl font-bold text-charcoal">Start an Organization</h1>
      </div>
      <CreateOrgCard onCreated={() => { setShowCreateOrg(false); void refresh(); }} />
      <button type="button" onClick={() => setShowCreateOrg(false)} className="text-sm text-medium-gray hover:text-charcoal underline">
        Back to my dashboard
      </button>
    </div>
  );
}
