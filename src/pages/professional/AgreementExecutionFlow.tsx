// HCN-ONBOARDING-PRODUCTION-001 Section 1/2 / HCN-SAAS-1.0 --
// replaces the dead-end "Agreement signing is not yet available in
// this workspace" notice (ApplicationStatusPage.tsx's
// 'agreements_pending'/'approved' branches) with a real, first-party,
// in-app execution flow for both required agreements.
//
// The Business Associate Agreement signs for real, against the
// actual approved document text (extracted verbatim from the
// committed BusinessAssociateAgreement.docx). The Haneen SaaS License
// Agreement (HCN-SAAS-1.0) now has real, owner-approved text too --
// SaasLicenseReviewCard renders the complete document for review,
// but its signing action stays disabled with a precise, honest
// configuration message (SAAS_LICENSE_SIGNING_ENABLED) until Haneen
// Care Network's lawful contracting entity is confirmed -- never a
// fake "sign" button that would appear to work and then fail, and
// never a silently-skipped requirement. The backend independently
// enforces the exact same gate (self_service_execute_agreement,
// migration 20261104000100) -- this frontend gate is a UX
// convenience, not the authoritative control.
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, ChevronDown, ChevronUp, Clock, ShieldAlert } from 'lucide-react';
import {
  BAA_SECTIONS, BAA_SUBTITLE, BAA_TITLE,
  SAAS_LICENSE_SECTIONS, SAAS_LICENSE_SIGNING_ENABLED, SAAS_LICENSE_SUBTITLE, SAAS_LICENSE_TITLE,
  type AgreementSection,
} from '@/constants/enterpriseAgreements';
import { getContractsForQuote, selfServiceExecuteAgreement, type EnterpriseContract } from '@/services/enterpriseContractService';
import type { ProfessionalApplication } from '@/services/professionalApplicationService';

const inputCls = 'w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ent-bronze border-ent-line bg-ent-panel';

// A deliberately small renderer for the limited markdown HCN-SAAS-1.0's
// source text actually uses (**bold**, a pricing table, "- " bullet
// lists) -- not a general-purpose markdown parser. Never changes the
// underlying text, only how it's displayed.
function renderInlineBold(text: string, keyPrefix: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={`${keyPrefix}-${i}`}>{part}</strong> : <span key={`${keyPrefix}-${i}`}>{part}</span>));
}

function renderAgreementBody(body: string) {
  const blocks = body.split('\n\n');
  return blocks.map((block, i) => {
    const key = `b-${i}`;
    if (block.startsWith('| ')) {
      const rows = block.split('\n').filter((r) => r.trim() && !/^\|[\s-:|]+\|$/.test(r.trim()));
      return (
        <table key={key} className="w-full text-left border-collapse my-2">
          <tbody>
            {rows.map((row, ri) => {
              const cells = row.split('|').map((c) => c.trim()).filter((c) => c.length > 0);
              return (
                <tr key={`${key}-r${ri}`} className={ri === 0 ? 'font-semibold border-b border-ent-line' : 'border-b border-ent-line/50'}>
                  {cells.map((cell, ci) => (
                    <td key={`${key}-r${ri}-c${ci}`} className="py-1 pr-4">{renderInlineBold(cell, `${key}-r${ri}-c${ci}`)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      );
    }
    if (block.split('\n').every((l) => l.startsWith('- ') || l.trim() === '')) {
      const items = block.split('\n').filter((l) => l.startsWith('- '));
      return (
        <ul key={key} className="list-disc pl-5 space-y-1">
          {items.map((item, ii) => <li key={`${key}-i${ii}`}>{renderInlineBold(item.slice(2), `${key}-i${ii}`)}</li>)}
        </ul>
      );
    }
    return <p key={key}>{renderInlineBold(block, key)}</p>;
  });
}

function AgreementSectionList({ sections }: { sections: AgreementSection[] }) {
  return (
    <>
      {sections.map((s) => (
        <div key={s.heading}>
          <p className="font-semibold text-ent-ink">{s.heading}</p>
          <div className="space-y-2">{renderAgreementBody(s.body)}</div>
        </div>
      ))}
    </>
  );
}

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

function SaasLicenseReviewCard({ applicationId, existing, defaultName, onExecuted }: {
  applicationId: string; existing: EnterpriseContract | null; defaultName: string; onExecuted: () => void;
}) {
  const [expanded, setExpanded] = useState(!existing);
  const [legalName, setLegalName] = useState(defaultName);
  const [title, setTitle] = useState('');
  const [consent, setConsent] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const sign = async () => {
    if (!SAAS_LICENSE_SIGNING_ENABLED) return; // defense in depth -- the button below is already disabled
    if (!legalName.trim()) { toast.error('Enter your full legal name to sign.'); return; }
    if (!consent) { toast.error('You must consent to conduct this transaction electronically.'); return; }
    if (!acknowledged) { toast.error('You must acknowledge that you have read the complete agreement.'); return; }
    setSubmitting(true);
    try {
      const { error } = await selfServiceExecuteAgreement(applicationId, 'saas_license', legalName.trim(), title.trim() || null, true);
      if (error) { toast.error(error); return; }
      toast.success('Haneen SaaS License Agreement executed.');
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
          <h2 className="font-bold text-ent-ink">Haneen SaaS License Agreement — executed</h2>
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
        <h2 className="font-bold text-ent-ink">Haneen SaaS License Agreement — review and sign</h2>
      </div>
      <button type="button" onClick={() => setExpanded((e) => !e)} className="flex items-center gap-1.5 text-sm font-semibold text-ent-bronze hover:underline">
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />} {expanded ? 'Hide full agreement text' : 'Read the complete agreement'}
      </button>
      {expanded && (
        <div className="bg-ent-bg rounded-xl border border-ent-line p-4 max-h-96 overflow-y-auto space-y-4 text-sm text-ent-text">
          <div>
            <p className="font-bold text-ent-ink">{SAAS_LICENSE_TITLE}</p>
            <p className="text-xs text-ent-muted">{SAAS_LICENSE_SUBTITLE}</p>
          </div>
          <AgreementSectionList sections={SAAS_LICENSE_SECTIONS} />
        </div>
      )}
      {!SAAS_LICENSE_SIGNING_ENABLED && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-xl p-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-ent-text">
            Electronic signing of this agreement is temporarily disabled: Haneen Care Network's lawful contracting entity has not yet been legally confirmed.
            You're welcome to review the complete agreement above now. This is a configuration step, not something you need to resolve — your Business
            Associate Agreement signature (if completed) remains on file, and we'll notify you the moment signing is enabled.
          </p>
        </div>
      )}
      <div className="space-y-3 border-t border-ent-line pt-4">
        <div className="space-y-1">
          <label htmlFor="saas-signatory-name" className="text-sm font-medium text-ent-ink">Your full legal name (typed signature) *</label>
          <input id="saas-signatory-name" value={legalName} onChange={(e) => setLegalName(e.target.value)} className={inputCls} placeholder="Full legal name" disabled={!SAAS_LICENSE_SIGNING_ENABLED} />
        </div>
        <div className="space-y-1">
          <label htmlFor="saas-signatory-title" className="text-sm font-medium text-ent-ink">Your title</label>
          <input id="saas-signatory-title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="e.g. Director, Owner" disabled={!SAAS_LICENSE_SIGNING_ENABLED} />
        </div>
        <label className="flex items-start gap-2 text-sm text-ent-text cursor-pointer">
          <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5" disabled={!SAAS_LICENSE_SIGNING_ENABLED} />
          I confirm that I am authorized to bind the Customer organization to this Agreement. I have read and agree to all terms above, including the
          final-sale and nonrefundability provisions, ninety-day cancellation right, twelve-month commitment, and immediate-payment obligations following
          late cancellation.
        </label>
        <label className="flex items-start gap-2 text-sm text-ent-text cursor-pointer">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" disabled={!SAAS_LICENSE_SIGNING_ENABLED} />
          I consent to electronic execution and retention of this Agreement, and understand this typed signature is legally binding.
        </label>
        <button
          type="button"
          onClick={() => { void sign(); }}
          disabled={submitting || !SAAS_LICENSE_SIGNING_ENABLED}
          title={SAAS_LICENSE_SIGNING_ENABLED ? undefined : "Signing is disabled until Haneen Care Network's lawful contracting entity has been confirmed."}
          className="w-full py-3 rounded-xl bg-ent-bronze hover:opacity-90 text-white font-semibold disabled:opacity-60"
        >
          {submitting ? 'Signing…' : SAAS_LICENSE_SIGNING_ENABLED ? 'I Agree and Electronically Sign' : 'Signing temporarily disabled'}
        </button>
      </div>
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
  const saasLicense = contracts.find((c) => c.contractType === 'saas_license' && c.status === 'executed') ?? null;

  return (
    <div className="space-y-4">
      <BaaCard applicationId={application.id} existing={baa} defaultName={application.legalName} onExecuted={() => { void refresh(); onRefresh(); }} />
      <SaasLicenseReviewCard applicationId={application.id} existing={saasLicense} defaultName={application.legalName} onExecuted={() => { void refresh(); onRefresh(); }} />
    </div>
  );
}
