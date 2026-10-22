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
import { Loader2, ShieldAlert, LogOut, Sparkles } from 'lucide-react';
import { getMyOrganizations, type MyOrganization } from '@/services/organizationService';
import OrganizationDirectorDashboard from '@/pages/enterprise/OrganizationDirectorDashboard';
import EnterpriseCaregiverDashboard from '@/pages/enterprise/EnterpriseCaregiverDashboard';
import ClinicalOfficeDashboard from '@/pages/enterprise/ClinicalOfficeDashboard';
import EnterprisePatientDashboard from '@/pages/patient/EnterprisePatientDashboard';

export type ProfessionalOfficeKey = 'admin' | 'caregiver' | 'medical' | 'therapy' | 'patient';

const OFFICE_SEGMENT: Record<ProfessionalOfficeKey, string> = {
  admin: 'Admin', caregiver: 'Caregiver', medical: 'Medical', therapy: 'Therapy', patient: 'Patient',
};
const OFFICE_LABEL: Record<ProfessionalOfficeKey, string> = {
  admin: 'Admin / Director', caregiver: 'Enterprise Caregiver', medical: 'Medical Professional', therapy: 'Therapist Professional', patient: 'Enterprise Patient',
};
// Priority order when no office is explicitly requested in the URL and
// the signed-in user holds more than one — identical ordering to
// EnterpriseDashboardRouter's own established priority (director >
// therapist > medical > caregiver), with Enterprise patient appended
// last since it is the newly-added fifth dimension and no existing
// behavior ever ranked it.
const PRIORITY_ORDER: ProfessionalOfficeKey[] = ['admin', 'therapy', 'medical', 'caregiver', 'patient'];

function parseRequestedOffice(): ProfessionalOfficeKey | null {
  const segments = window.location.pathname.split('/').filter(Boolean); // ['Professional', 'Admin', ...]
  const seg = (segments[1] || '').toLowerCase();
  return (Object.keys(OFFICE_SEGMENT) as ProfessionalOfficeKey[]).find((k) => OFFICE_SEGMENT[k].toLowerCase() === seg) ?? null;
}

function AccessRequiredState({ onLogout }: { onLogout: () => void }) {
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
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md text-center space-y-3">
          <ShieldAlert className="w-10 h-10 text-ent-bronze mx-auto" />
          <h1 className="text-lg font-bold text-ent-ink">Organization access required</h1>
          <p className="text-sm text-ent-text">
            Your account is not currently authorized for any Enterprise office. An organization&apos;s director adds staff
            members directly, and Enterprise patient access is granted by your care organization — ask them to add you, and
            you&apos;ll be able to sign back in here once access is active.
          </p>
        </div>
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
  const { dispatch } = useApp();
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState<MyOrganization[]>([]);
  const [patientCovered, setPatientCovered] = useState(false);
  const [requestedOffice, setRequestedOffice] = useState<ProfessionalOfficeKey | null>(() => parseRequestedOffice());
  const [manualSelection, setManualSelection] = useState<ProfessionalOfficeKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getMyOrganizations(), supabase.rpc('is_my_enterprise_coverage_active')]).then(([o, coverageResult]) => {
      if (cancelled) return;
      setOrgs(o);
      setPatientCovered(coverageResult.data === true);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

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

  const availableOffices: { key: ProfessionalOfficeKey; orgName: string }[] = [
    ...(director ? [{ key: 'admin' as const, orgName: director.organizationName }] : []),
    ...(therapist ? [{ key: 'therapy' as const, orgName: therapist.organizationName }] : []),
    ...(medical ? [{ key: 'medical' as const, orgName: medical.organizationName }] : []),
    ...(caregiver ? [{ key: 'caregiver' as const, orgName: caregiver.organizationName }] : []),
    ...(patientCovered ? [{ key: 'patient' as const, orgName: 'Your Care Organization' }] : []),
  ];

  if (availableOffices.length === 0) {
    return <AccessRequiredState onLogout={() => { void handleLogout(); }} />;
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
      {effective === 'patient' && <EnterprisePatientDashboard basePath={officeBasePath} />}
    </div>
  );
}
