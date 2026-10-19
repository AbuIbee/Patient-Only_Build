// ENTERPRISE CONSOLIDATED DELIVERY — Checkpoint C: Billing & Add-Ons.
//
// Deliberately conservative: every figure here is either read directly
// from organization_licenses (which only ever holds "proposed" terms —
// migration 035's org_configure_license() never sets status to 'active')
// or an honest, computed count (seats used, patients covered). Nothing on
// this page is fabricated placeholder data, and nothing here enables a
// real charge — "Do not enable live Stripe, invent Stripe price IDs, or
// create actual charges."
//
// This page explicitly separates SUBSCRIPTION billing (the org's annual
// license + seat/capacity terms, configured on the Overview tab) from an
// OPTIONAL PROFESSIONAL-SERVICES billing module (insurance claims, EVV,
// payer billing) — the latter does not exist in this build, and this
// page says so in plain language rather than leaving it ambiguous.
import { useEffect, useState } from 'react';
import { CreditCard, Receipt, Puzzle, ShieldAlert, Users, ClipboardList } from 'lucide-react';
import { getOrgLicense, getOrgMembers, getOrgCoveredPatients, type OrgLicense } from '@/services/organizationService';

function SectionCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="font-bold text-charcoal">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export default function OrganizationBillingPage({ organizationId, orgName, packageType }: {
  organizationId: string; orgName: string; packageType: 'therapist' | 'integrated_care';
}) {
  const [license, setLicense] = useState<OrgLicense | null>(null);
  const [seatsUsed, setSeatsUsed] = useState(0);
  const [patientsCovered, setPatientsCovered] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [lic, members, patients] = await Promise.all([
        getOrgLicense(organizationId),
        getOrgMembers(organizationId),
        getOrgCoveredPatients(organizationId),
      ]);
      if (cancelled) return;
      setLicense(lic);
      setSeatsUsed(members.filter((m) => m.orgRole !== 'director' && m.status === 'active').length);
      setPatientsCovered(patients.length);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [organizationId]);

  if (loading) {
    return <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin" /></div>;
  }

  const planLabel = packageType === 'therapist' ? 'Enterprise Therapist' : 'Enterprise Integrated Care';
  const status = license?.status ?? 'proposed';
  const isActive = status === 'active';
  const statusBadgeCls = isActive ? 'text-soft-sage bg-soft-sage/10' : 'text-amber-700 bg-amber-100';

  return (
    <div className="space-y-5">
      <SectionCard icon={<CreditCard className="w-5 h-5 text-warm-bronze" />} title="Plan Overview">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm text-charcoal"><strong>{orgName}</strong> — {planLabel}</p>
          <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${statusBadgeCls}`}>{status}</span>
        </div>
        {isActive ? (
          <p className="text-xs text-medium-gray">
            This license is active. Every patient currently covered receives the same Full Support experience — all patient features and all eight Arcade games — regardless of which business package was purchased. Covered patients are never billed individually or directed to a residential plan.
          </p>
        ) : (
          <p className="text-xs text-amber-800">
            This license is <strong>{status}</strong>, not active. Covering a patient while the license is {status} records the coverage relationship, but does NOT grant Full Support — a patient only receives Full Support while their organization's license is active. Activation is an admin-only action, separate from configuring seats/capacity/fee below.
          </p>
        )}
        {license?.activatedAt && (
          <p className="text-[11px] text-medium-gray">Last activated {new Date(license.activatedAt).toLocaleString()}.</p>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <SectionCard icon={<Users className="w-5 h-5 text-warm-bronze" />} title="Licensed Professional Seats">
          <p className="text-2xl font-bold text-charcoal">
            {seatsUsed} <span className="text-sm font-normal text-medium-gray">/ {license?.licensedSeats ?? 'not configured'}</span>
          </p>
          <p className="text-xs text-medium-gray">Active staff members (caregiver, therapist, medical professional, billing administrator), excluding the director.</p>
        </SectionCard>

        <SectionCard icon={<ClipboardList className="w-5 h-5 text-warm-bronze" />} title="Patient Coverage">
          <p className="text-2xl font-bold text-charcoal">
            {patientsCovered} <span className="text-sm font-normal text-medium-gray">/ {license?.coveredPatientCapacity ?? 'not configured'}</span>
          </p>
          <p className="text-xs text-medium-gray">Patients currently covered under this organization's license.</p>
        </SectionCard>
      </div>

      <SectionCard icon={<Receipt className="w-5 h-5 text-warm-bronze" />} title="Annual Organization Licensing">
        <p className="text-sm text-charcoal">
          Proposed annual fee: <strong>{license?.annualLicenseFee != null ? `$${license.annualLicenseFee.toFixed(2)}` : 'Not configured'}</strong>
        </p>
        <p className="text-xs text-medium-gray">
          This figure is a configurable proposed commercial term, set from the Overview tab. It has not been charged — no live billing has been activated for this organization, and no payment method is on file.
        </p>
      </SectionCard>

      <SectionCard icon={<Puzzle className="w-5 h-5 text-warm-bronze" />} title="Add-Ons">
        <p className="text-sm text-medium-gray">No approved optional add-ons are currently available for this plan.</p>
      </SectionCard>

      <SectionCard icon={<Receipt className="w-5 h-5 text-warm-bronze" />} title="Billing History &amp; Invoices">
        <p className="text-sm text-medium-gray">No billing history yet. Live billing has not been activated for this organization, so there are no invoices or payments to show.</p>
      </SectionCard>

      <SectionCard icon={<CreditCard className="w-5 h-5 text-warm-bronze" />} title="Payment Method">
        <p className="text-sm text-medium-gray">
          Payment method setup will appear here once a live billing provider is connected for this organization. No payment information is collected or stored at this time.
        </p>
      </SectionCard>

      <SectionCard icon={<ShieldAlert className="w-5 h-5 text-gentle-coral" />} title="Professional-Services Billing (Insurance, EVV, Payer Claims)">
        <p className="text-sm text-charcoal font-medium">This module is not implemented.</p>
        <p className="text-xs text-medium-gray">
          My Memoria Ally Enterprise does not currently submit insurance claims, Electronic Visit Verification (EVV) records, or process payer billing on behalf of your organization. This is a separate, optional module from the subscription billing shown above and is not operational in this build.
        </p>
      </SectionCard>
    </div>
  );
}
