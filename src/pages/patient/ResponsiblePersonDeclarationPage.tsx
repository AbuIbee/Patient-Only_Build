// HCN-RP-DECL-001 — RESPONSIBLE PERSON / HEALTHCARE REPRESENTATION
// Separate page intended for the patient portal's Documents > Legal &
// Authorizations folder and the recipient's invitation activation journey.
// Not routed into production until the protected signing/storage workflow
// and jurisdiction-specific legal review have been accepted.
import { useState, type FormEvent } from 'react';
import {
  DECLARATION_ID, DECLARATION_DRAFT_VERSION,
  RESPONSIBLE_PERSON_AFFIRMATIONS, RESPONSIBLE_PERSON_ECONSENTS,
  validateResponsiblePersonSignature,
  type ResponsiblePersonLegalContext,
  type ResponsiblePersonSignaturePayload,
  type ExecutedResponsiblePersonReceipt,
} from '@/legal/responsiblePersonDeclaration';

export interface ResponsiblePersonDeclarationPageProps {
  context: ResponsiblePersonLegalContext;
  state: 'awaiting_signature' | 'executed';
  receipt?: ExecutedResponsiblePersonReceipt;
  /**
   * Trusted parent must authenticate the actor and supply an endpoint that
   * re-verifies all facts on the server, stamps UTC, and immutably stores
   * a PDF/receipt. Undefined means SIGNING IS DISABLED.
   */
  onExecute?: (payload: ResponsiblePersonSignaturePayload) => Promise<void>;
  onDownloadVerifiedDocument?: () => Promise<void>;
}

const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-700';
const area = 'rounded-xl border border-slate-200 bg-white p-4 sm:p-6 space-y-4';

export default function ResponsiblePersonDeclarationPage({
  context, state, receipt, onExecute, onDownloadVerifiedDocument,
}: ResponsiblePersonDeclarationPageProps) {
  const [affirmations, setAffirmations] = useState<Record<string, boolean>>({});
  const [eConsents, setEConsents] = useState<Record<string, boolean>>({});
  const [signature, setSignature] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const errors = validateResponsiblePersonSignature(context, signature, affirmations, eConsents);
  const signable = state === 'awaiting_signature'
    && context.counselApproved && !!onExecute && errors.length === 0 && !submitting;
  const displayStatus = state === 'executed' && receipt ? 'Signed declaration' : 'Awaiting responsible-person signature';

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!signable || !onExecute || !context.reviewedLegalClauseId) {
      setMessage('Signature is unavailable. Complete every declaration and wait for legal review.');
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      await onExecute({
        declarationId: DECLARATION_ID,
        patientId: context.patientId,
        legalClauseId: context.reviewedLegalClauseId,
        signerTypedLegalName: signature.trim(),
        signerJurisdiction: context.signerJurisdiction.trim(),
        acceptedAffirmationIds: RESPONSIBLE_PERSON_AFFIRMATIONS.map(x => x.id),
        acceptedElectronicConsentIds: RESPONSIBLE_PERSON_ECONSENTS.map(x => x.id),
      });
      // The actual success state is supplied by the server-backed parent
      // after immutable PDF/receipt confirmation. No optimistic activation.
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Signature could not be recorded.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-3 py-8 sm:px-6 text-slate-900"
      aria-label="Responsible person healthcare representation declaration">
      <header className="space-y-2">
        <p className="text-sm font-bold tracking-wide text-amber-800">HANEEN CARE NETWORK</p>
        <h1 className="text-2xl sm:text-3xl font-bold">
          Responsible Person — Declaration of Healthcare Representation and Portal Access
        </h1>
        <p className="text-sm text-slate-600">{DECLARATION_ID} · {displayStatus}</p>
        <p className="text-sm text-slate-600">
          Patient Documents → Legal &amp; Authorizations → Healthcare Representation Declaration
        </p>
      </header>

      <section className={area}>
        <h2 className="text-lg font-semibold">Important legal notice</h2>
        <p className="leading-relaxed">
          This document records your statements about existing authority.
          It does not create a healthcare power of attorney, guardianship or other legal authority.
          You must already be authorized under applicable law or by a valid patient authorization.
          Your identity and authority must be verified separately before access to private patient records.
        </p>
        <p className="leading-relaxed">
          False or misleading statements may have legal consequences under applicable law.
          The act of signing this private form does not automatically constitute statutory perjury,
          a notarized affidavit, or an appointment as a healthcare agent.
        </p>
      </section>

      <section className={area} aria-label="Patient and signer details">
        <h2 className="text-lg font-semibold">Patient and responsible person</h2>
        <dl className="grid gap-3 sm:grid-cols-2 text-sm">
          <div><dt className="font-semibold">Patient</dt><dd>{context.patientDisplayName}</dd></div>
          <div><dt className="font-semibold">Care organization</dt><dd>{context.organizationDisplayName}</dd></div>
          <div><dt className="font-semibold">Responsible person's legal name</dt><dd>{context.representativeDisplayName}</dd></div>
          <div><dt className="font-semibold">Relationship</dt><dd>{context.relationshipToPatient}</dd></div>
          <div><dt className="font-semibold">Contact email</dt><dd>{context.representativeEmail}</dd></div>
          <div><dt className="font-semibold">Signing jurisdiction</dt><dd>{context.signerJurisdiction}</dd></div>
          <div><dt className="font-semibold">Authority claimed</dt><dd>{context.authorityBasis}</dd></div>
          <div><dt className="font-semibold">Supporting instrument</dt><dd>{context.authorityEvidenceLabel}</dd></div>
          <div className="sm:col-span-2"><dt className="font-semibold">Approved or claimed scope</dt><dd>{context.authorityScope}</dd></div>
        </dl>
      </section>

      {state === 'executed' && receipt ? (
        <section className={area} aria-label="Executed declaration record">
          <h2 className="text-lg font-semibold">Executed document record</h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="font-semibold">Document ID</dt><dd className="break-all">{receipt.documentId}</dd></div>
            <div><dt className="font-semibold">Signed by</dt><dd>{receipt.signerName}</dd></div>
            <div><dt className="font-semibold">Signed at (UTC)</dt><dd>{receipt.signedAtUtc}</dd></div>
            <div><dt className="font-semibold">Document version</dt><dd>{receipt.declarationVersion}</dd></div>
            <div className="sm:col-span-2">
              <dt className="font-semibold">Signed PDF SHA-256</dt>
              <dd className="break-all font-mono text-xs">{receipt.documentSha256}</dd>
            </div>
            <div><dt className="font-semibold">Authority review</dt><dd>{receipt.authorizationStatus.replaceAll('_', ' ')}</dd></div>
          </dl>
          <p className="text-sm">
            Signing does not grant patient access. That access depends on a separate verified and active authorization.
          </p>
          {onDownloadVerifiedDocument && (
            <button type="button" onClick={() => { void onDownloadVerifiedDocument(); }}
              className="rounded-lg bg-amber-700 px-4 py-3 font-semibold text-white">
              Download executed declaration
            </button>
          )}
        </section>
      ) : (
        <form onSubmit={(event) => { void submit(event); }} className="space-y-5">
          <section className={area}>
            <h2 className="text-lg font-semibold">Affirmation of authority and truth</h2>
            <p className="text-sm">
              Review each separate representation. This form is not a substitute for the actual legal instrument.
            </p>
            {RESPONSIBLE_PERSON_AFFIRMATIONS.map(item => (
              <label key={item.id} className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 p-3">
                <input type="checkbox" checked={affirmations[item.id]===true}
                  onChange={e => setAffirmations(p=>({...p,[item.id]:e.target.checked}))}
                  className="mt-1 h-4 w-4 accent-amber-700" />
                <span className="space-y-1">
                  <strong className="block">{item.title}</strong>
                  <span className="block text-sm leading-relaxed">{item.text}</span>
                </span>
              </label>
            ))}
          </section>
          <section className={area}>
            <h2 className="text-lg font-semibold">Electronic records and signatures</h2>
            {RESPONSIBLE_PERSON_ECONSENTS.map(item => (
              <label key={item.id} className="flex gap-3 rounded-lg border border-slate-200 p-3">
                <input type="checkbox" checked={eConsents[item.id]===true}
                  onChange={e=>setEConsents(p=>({...p,[item.id]:e.target.checked}))}
                  className="mt-1 h-4 w-4 accent-amber-700" />
                <span className="text-sm leading-relaxed">{item.text}</span>
              </label>
            ))}
          </section>
          <section className={area}>
            <h2 className="text-lg font-semibold">Declaration and electronic signature</h2>
            {context.counselApproved && context.reviewedLegalClause?.trim() ? (
              <blockquote className="border-l-4 border-amber-700 bg-amber-50 p-4 text-sm leading-relaxed">
                {context.reviewedLegalClause}
              </blockquote>
            ) : (
              <p className="rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900" role="status">
                Jurisdiction-specific legal review is required before signing can be enabled.
              </p>
            )}
            <label className="block space-y-2">
              <span className="text-sm font-semibold">Type your full legal name as your signature</span>
              <input className={field} value={signature} onChange={e=>setSignature(e.target.value)}
                autoComplete="name" aria-label="Electronic signature — full legal name"
                placeholder={context.representativeDisplayName} />
            </label>
            <p className="text-xs text-slate-600">
              The protected backend must re-verify your account, signature, jurisdiction, current document version,
              authority evidence and consent before generating an immutable, signed PDF in the patient's documents folder.
            </p>
            {message && <p className="text-sm text-red-800" role="alert">{message}</p>}
            <button type="submit" disabled={!signable}
              className="w-full rounded-lg bg-amber-700 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
              {submitting ? 'Recording signature…' : 'Sign responsible-person declaration'}
            </button>
            {!onExecute && (
              <p className="text-xs text-slate-600">
                Signing is not yet available. An authenticated signing and document-storage service must be connected.
              </p>
            )}
          </section>
        </form>
      )}
    </main>
  );
}
