// HCN-ONBOARDING-PRODUCTION-001 Section 1/2 -- replaces the dead-end
// "Agreement signing is not yet available in this workspace" notice
// (ApplicationStatusPage.tsx's 'agreements_pending'/'approved'
// branches) with a real, first-party, in-app execution flow.
//
// Renders both required agreements. The Business Associate Agreement
// signs for real, against the actual approved document text
// (src/constants/enterpriseAgreements.ts, extracted verbatim from the
// committed BusinessAssociateAgreement.docx). The Haneen SaaS License
// Agreement is shown as an honest, actionable BLOCKED state, never a
// fake signing form -- no approved template exists for it anywhere in
// this repository (confirmed by a full-repo search, not assumed), and
// inventing replacement legal language is explicitly prohibited by
// this directive and by this engagement's own prior conclusion on the
// identical question.
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, ChevronDown, ChevronUp, Clock, ShieldAlert } from 'lucide-react';
import { BAA_SECTIONS, BAA_SUBTITLE, BAA_TITLE } from '@/constants/enterpriseAgreements';
import { getContractsForQuote, selfServiceExecuteAgreement, type EnterpriseContract } from '@/services/enterpriseContractService';
import type { ProfessionalApplication } from '@/services/professionalApplicationService';

const inputCls = 'w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ent-bronze border-ent-line bg-ent-panel';

function BaaCard({ applicationId, existing, defaultName, onExecuted }: {
  applicationId: string; existing: EnterpriseContract | null; defaultName: string; onExecuted: () => void;
}) {
  const [expanded, setExpanded] = useState(!existing);
  const [legalName, setLegalName] = useState(defaultName);
  const [title, setTitle] = useState('');
  const [consent, setConsent] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const sign = async () => {
    if (!legalName.trim()) { toast.error('Enter your full legal name to sign.'); return; }
    if (!consent) { toast.error('You must consent to conduct this transaction electronically.'); return; }
    if (!acknowledged) { toast.error('You must acknowledge that you have read the complete agreement.'); return; }
    setSubmitting(true);
    try {
      const { error } = await selfServiceExecuteAgreement(applicationId, 'baa', legalName.trim(), title.trim() || null, true);
      if (error) { toast.error(error); return; }
      toast.success('Business Associate Agreement executed.');
      onExecuted();
    } finally {
      setSubmitting(false);
    }
  };

  if (existing) {
    return (
      <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-green/40 p-5 space-y-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-ent-green" />
          <h2 className="font-bold text-ent-ink">Business Associate Agreement — executed</h2>
        </div>
        <p className="text-sm text-ent-text">
          Signed by <span className="font-semibold">{existing.signatoryName}</span>{existing.signatoryTitle ? `, ${existing.signatoryTitle}` : ''} on {existing.executedAt ? new Date(existing.executedAt).toLocaleString() : ''}.
        </p>
        <p className="text-xs text-ent-muted">Document version {existing.templateVersion}.</p>
      </div>
    );
  }

  return (
    <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-ent-ink">Business Associate Agreement — requires your signature</h2>
      </div>
      <button type="button" onClick={() => setExpanded((e) => !e)} className="flex items-center gap-1.5 text-sm font-semibold text-ent-bronze hover:underline">
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />} {expanded ? 'Hide full agreement text' : 'Read the complete agreement'}
      </button>
      {expanded && (
        <div className="bg-ent-bg rounded-xl border border-ent-line p-4 max-h-96 overflow-y-auto space-y-4 text-sm text-ent-text">
          <div>
            <p className="font-bold text-ent-ink">{BAA_TITLE}</p>
            <p className="text-xs text-ent-muted">{BAA_SUBTITLE}</p>
          </div>
          {BAA_SECTIONS.map((s) => (
            <div key={s.heading}>
              <p className="font-semibold text-ent-ink">{s.heading}</p>
              <p className="whitespace-pre-line">{s.body}</p>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-3 border-t border-ent-line pt-4">
        <div className="space-y-1">
          <label htmlFor="baa-signatory-name" className="text-sm font-medium text-ent-ink">Your full legal name (typed signature) *</label>
          <input id="baa-signatory-name" value={legalName} onChange={(e) => setLegalName(e.target.value)} className={inputCls} placeholder="Full legal name" />
        </div>
        <div className="space-y-1">
          <label htmlFor="baa-signatory-title" className="text-sm font-medium text-ent-ink">Your title</label>
          <input id="baa-signatory-title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="e.g. Director, Owner" />
        </div>
        <label className="flex items-start gap-2 text-sm text-ent-text cursor-pointer">
          <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5" />
          I have read and agree to the complete Business Associate Agreement above on behalf of my organization.
        </label>
        <label className="flex items-start gap-2 text-sm text-ent-text cursor-pointer">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
          I consent to conduct this transaction and sign this agreement electronically, and understand this typed signature is legally binding.
        </label>
        <button type="button" onClick={() => { void sign(); }} disabled={submitting} className="w-full py-3 rounded-xl bg-ent-bronze hover:opacity-90 text-white font-semibold disabled:opacity-60">
          {submitting ? 'Signing…' : 'Sign Business Associate Agreement'}
        </button>
      </div>
    </div>
  );
}

function SaasLicenseBlockedCard() {
  return (
    <div className="bg-ent-panel rounded-2xl shadow-sm border border-amber-300 p-5 space-y-2">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-5 h-5 text-amber-600" />
        <h2 className="font-bold text-ent-ink">Haneen SaaS License Agreement — not yet available</h2>
      </div>
      <p className="text-sm text-ent-text">
        Haneen Care Network has not yet published the approved text of this agreement for electronic signature. This is not something you need to resolve —
        we will notify you the moment it is available, and your Business Associate Agreement signature (if completed) will remain on file.
      </p>
      <p className="text-xs text-ent-muted">Your license cannot activate until this agreement is available and executed.</p>
    </div>
  );
}

export default function AgreementExecutionFlow({ application, onRefresh }: { application: ProfessionalApplication; onRefresh: () => void }) {
  const [contracts, setContracts] = useState<EnterpriseContract[] | null>(null);
  const quoteId = (application.applicationDetails?.originatingQuoteId as string | undefined) ?? null;

  const refresh = useCallback(async () => {
    if (!quoteId) { setContracts([]); return; }
    setContracts(await getContractsForQuote(quoteId));
  }, [quoteId]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (!quoteId) {
    return (
      <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-5 text-sm text-ent-text">
        This application has no associated commercial quote to attach an agreement to. Contact Haneen Care Network for assistance.
      </div>
    );
  }

  if (contracts === null) {
    return <div className="flex items-center gap-2 text-sm text-ent-muted"><Clock className="w-4 h-4 animate-pulse" /> Loading your agreements…</div>;
  }

  const baa = contracts.find((c) => c.contractType === 'baa' && c.status === 'executed') ?? null;

  return (
    <div className="space-y-4">
      <BaaCard applicationId={application.id} existing={baa} defaultName={application.legalName} onExecuted={() => { void refresh(); onRefresh(); }} />
      <SaasLicenseBlockedCard />
    </div>
  );
}
