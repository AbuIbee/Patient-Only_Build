import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Stethoscope, RefreshCw, Send, Download, Upload, UserPlus, ShieldCheck } from 'lucide-react';
import {
  type HealthcareProvider, type ClinicalRequest, type ClinicalDocument, type RequestEvent,
  getProviders, upsertProvider, associateProviderWithPatient, getClinicalRequests, createClinicalRequest,
  sendClinicalRequest, resendClinicalRequestInvitation, cancelClinicalRequest, revokeClinicalRequestAccess,
  getDocumentsForRequest, getRequestEvents, reviewClinicalDocument, clinicalApproveDocument,
  uploadInternalDocument, getSignedDownloadUrl, sendClinicalRequestNotification,
  REQUEST_TYPES, DOCUMENT_CATEGORIES, DOCUMENT_CLASSIFICATIONS, PROVIDER_SPECIALTIES,
} from '@/services/hcnClinicalCoordinationService';

/*
 * HCN-CLINICAL-MASTER-002 / CONTINUATION Phase 2 -- the Director-facing
 * (and, read-scoped, Caregiver/clinical-role-facing) Clinical
 * Coordination screen. Mirrors CareEscalationPanel's existing
 * role-prop/plain-tailwind/ent-* token pattern so it feels native to
 * this Enterprise shell rather than a foreign component library,
 * exactly as R1 requires ("no redesign of unrelated screens" -- this
 * is an ADDITIVE new section, styled to match what already exists).
 *
 * Every write action here calls an RPC that already independently
 * enforces its own authorization server-side (see the SEC-00x
 * migrations) -- this component only hides controls a given role
 * could not use anyway, as a courtesy, never as the actual security
 * boundary.
 */

type Role = 'director' | 'caregiver' | 'clinical';

const REQUEST_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', send_pending: 'Sending…', sent: 'Sent — awaiting response', response_received: 'Response received',
  pending_review: 'Pending administrative review', pending_clinical_approval: 'Pending clinical approval',
  accepted: 'Accepted', revision_required: 'Revision required', rejected: 'Rejected', closed: 'Closed',
  cancelled: 'Cancelled', expired: 'Expired',
};

export default function ClinicalCoordinationPanel({
  orgId, userId, role, patients = [],
}: {
  orgId: string; userId: string; role: Role; patients?: { id: string; name: string }[];
}) {
  const [providers, setProviders] = useState<HealthcareProvider[]>([]);
  const [requests, setRequests] = useState<ClinicalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [requestDocs, setRequestDocs] = useState<{ direction: string; document: ClinicalDocument }[]>([]);
  const [events, setEvents] = useState<RequestEvent[]>([]);

  const [showNewProvider, setShowNewProvider] = useState(false);
  const [providerForm, setProviderForm] = useState({ displayName: '', specialty: 'medical_specialist', practiceName: '', officePhone: '', secureContactEmail: '' });

  const [showNewRequest, setShowNewRequest] = useState(false);
  const [requestForm, setRequestForm] = useState({
    patientId: patients[0]?.id ?? '', providerId: '', requestType: 'general_provider_coordination',
    title: '', description: '', deadlineAt: '',
  });

  const [uploadCategory, setUploadCategory] = useState('other_clinical_attachment');
  const [uploadClassification, setUploadClassification] = useState('general_care_coordination');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [p, r] = await Promise.all([getProviders(orgId), getClinicalRequests(orgId)]);
      if (p.error) setError(p.error); else setProviders(p.data ?? []);
      if (r.error) setError(r.error); else setRequests(r.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [orgId]);
  useEffect(() => { void refresh(); }, [refresh]);

  const openRequest = useCallback(async (id: string) => {
    setSelectedRequestId(id);
    const [docs, evts] = await Promise.all([getDocumentsForRequest(id), getRequestEvents(id)]);
    setRequestDocs(docs.data ?? []);
    setEvents(evts.data ?? []);
  }, []);

  const selectedRequest = requests.find((r) => r.id === selectedRequestId) ?? null;

  const saveProvider = async () => {
    if (!providerForm.displayName.trim()) { toast.error('Enter a provider name.'); return; }
    setBusy(true);
    try {
      const r = await upsertProvider(orgId, {
        displayName: providerForm.displayName.trim(), professionalTitle: null, specialty: providerForm.specialty,
        specialtyOtherLabel: null, practiceName: providerForm.practiceName.trim() || null,
        officePhone: providerForm.officePhone.trim() || null, faxNumber: null,
        secureContactEmail: providerForm.secureContactEmail.trim() || null, officeAddress: null,
        professionalIdentifier: null, credentials: null,
      });
      if (r.error) { toast.error(r.error); return; }
      toast.success('Provider saved.');
      setShowNewProvider(false);
      setProviderForm({ displayName: '', specialty: 'medical_specialist', practiceName: '', officePhone: '', secureContactEmail: '' });
      await refresh();
    } finally { setBusy(false); }
  };

  const associate = async (providerId: string, patientId: string) => {
    setBusy(true);
    try {
      const r = await associateProviderWithPatient(patientId, providerId);
      if (r.error) { toast.error(r.error); return; }
      toast.success('Provider associated with patient.');
    } finally { setBusy(false); }
  };

  const submitNewRequest = async () => {
    if (!requestForm.patientId || !requestForm.providerId || !requestForm.title.trim()) {
      toast.error('Patient, provider, and title are required.'); return;
    }
    setBusy(true);
    try {
      const r = await createClinicalRequest({
        organizationId: orgId, patientId: requestForm.patientId, providerId: requestForm.providerId,
        requestType: requestForm.requestType, title: requestForm.title.trim(), description: requestForm.description.trim() || null,
        requestedItems: [], deadlineAt: requestForm.deadlineAt || null, followUpOwnerId: null,
      });
      if (r.error) { toast.error(r.error); return; }
      toast.success('Request created as a draft.');
      setShowNewRequest(false);
      setRequestForm({ patientId: patients[0]?.id ?? '', providerId: '', requestType: 'general_provider_coordination', title: '', description: '', deadlineAt: '' });
      await refresh();
    } finally { setBusy(false); }
  };

  const doSend = async (requestId: string, resend: boolean) => {
    setBusy(true);
    try {
      const r = resend ? await resendClinicalRequestInvitation(requestId) : await sendClinicalRequest(requestId);
      if (r.error || !r.data) { toast.error(r.error ?? 'Could not send this request.'); return; }
      const note = await sendClinicalRequestNotification(requestId, r.data.rawToken);
      if (note.error) toast.error(`Request ${resend ? 'resent' : 'sent'}, but the notification email failed: ${note.error}`);
      else toast.success(`Request ${resend ? 'resent' : 'sent'} and the provider has been notified.`);
      await refresh();
      if (selectedRequestId === requestId) await openRequest(requestId);
    } finally { setBusy(false); }
  };

  const doCancel = async (requestId: string) => {
    const reason = window.prompt('Reason for cancelling this request?') ?? '';
    if (!reason.trim()) return;
    setBusy(true);
    try {
      const r = await cancelClinicalRequest(requestId, reason.trim());
      if (r.error) { toast.error(r.error); return; }
      toast.success('Request cancelled.');
      await refresh();
    } finally { setBusy(false); }
  };

  const doRevoke = async (requestId: string) => {
    setBusy(true);
    try {
      const r = await revokeClinicalRequestAccess(requestId);
      if (r.error) { toast.error(r.error); return; }
      toast.success('External access revoked.');
      await refresh();
      if (selectedRequestId === requestId) await openRequest(requestId);
    } finally { setBusy(false); }
  };

  const doUpload = async () => {
    if (!uploadFile || !selectedRequest) return;
    setBusy(true);
    try {
      const r = await uploadInternalDocument({
        organizationId: orgId, patientId: selectedRequest.patientId, category: uploadCategory,
        classification: uploadClassification, file: uploadFile, uploadedBy: userId,
      });
      if (r.error) { toast.error(r.error); return; }
      toast.success(`${uploadFile.name} uploaded.`);
      setUploadFile(null);
      await openRequest(selectedRequest.id);
    } finally { setBusy(false); }
  };

  const doDownload = async (doc: ClinicalDocument) => {
    const r = await getSignedDownloadUrl(doc.storagePath, doc.originalFilename);
    if (r.error || !r.url) { toast.error(r.error ?? 'Could not generate a download link.'); return; }
    window.open(r.url, '_blank', 'noopener,noreferrer');
  };

  const doAdministrativeReview = async (documentId: string, decision: string) => {
    const notes = reviewNotes.trim() || `Marked ${decision.replace(/_/g, ' ')}.`;
    setBusy(true);
    try {
      const r = await reviewClinicalDocument(documentId, decision, notes);
      if (r.error) { toast.error(r.error); return; }
      toast.success('Review recorded.');
      setReviewNotes('');
      if (selectedRequestId) await openRequest(selectedRequestId);
    } finally { setBusy(false); }
  };

  const doClinicalApprove = async (documentId: string) => {
    const notes = reviewNotes.trim() || 'Reviewed and approved.';
    setBusy(true);
    try {
      const r = await clinicalApproveDocument(documentId, notes);
      if (r.error) { toast.error(r.error); return; }
      toast.success('Clinically approved.');
      setReviewNotes('');
      if (selectedRequestId) await openRequest(selectedRequestId);
    } finally { setBusy(false); }
  };

  return (
    <section aria-label="Clinical Coordination" className="rounded-2xl border border-ent-line bg-white p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold text-ent-ink"><Stethoscope className="h-5 w-5" /> Clinical Coordination</h2>
        <button type="button" aria-label="Refresh" onClick={() => { void refresh(); }} className="rounded-xl border border-ent-line p-2"><RefreshCw className="h-4 w-4" /></button>
      </div>
      <p className="text-xs text-ent-muted">
        Manage healthcare provider contacts and structured requests for medical documentation, clinical clarification,
        and coordinated care — with secure, verified, time-limited external access for providers who do not use Haneen directly.
      </p>
      {error && <p role="alert" className="text-sm text-ent-rust">Could not load clinical coordination data: {error}</p>}

      {/* Provider directory */}
      <div className="rounded-xl border border-ent-line p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Healthcare Provider Directory</h3>
          {role === 'director' && (
            <button type="button" className="rounded-lg border border-ent-line px-3 py-1 text-xs font-semibold" onClick={() => setShowNewProvider((v) => !v)}>
              <UserPlus className="h-3 w-3 inline mr-1" /> Add provider
            </button>
          )}
        </div>
        {showNewProvider && role === 'director' && (
          <div className="rounded-lg bg-ent-pale p-3 space-y-2">
            <input className="block w-full rounded-lg border border-ent-line p-2 text-sm" placeholder="Provider or practice name"
              value={providerForm.displayName} onChange={(e) => setProviderForm((f) => ({ ...f, displayName: e.target.value }))} />
            <select className="block w-full rounded-lg border border-ent-line p-2 text-sm" value={providerForm.specialty}
              onChange={(e) => setProviderForm((f) => ({ ...f, specialty: e.target.value }))}>
              {PROVIDER_SPECIALTIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <input className="block w-full rounded-lg border border-ent-line p-2 text-sm" placeholder="Practice name (optional)"
              value={providerForm.practiceName} onChange={(e) => setProviderForm((f) => ({ ...f, practiceName: e.target.value }))} />
            <input className="block w-full rounded-lg border border-ent-line p-2 text-sm" placeholder="Office phone (optional)"
              value={providerForm.officePhone} onChange={(e) => setProviderForm((f) => ({ ...f, officePhone: e.target.value }))} />
            <input className="block w-full rounded-lg border border-ent-line p-2 text-sm" placeholder="Secure contact email (used for external access, optional)"
              value={providerForm.secureContactEmail} onChange={(e) => setProviderForm((f) => ({ ...f, secureContactEmail: e.target.value }))} />
            <button type="button" disabled={busy} onClick={() => { void saveProvider(); }} className="rounded-lg bg-ent-bronze px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Save provider</button>
          </div>
        )}
        {loading ? <p role="status" className="text-sm">Loading…</p> : providers.length === 0 ? <p className="text-sm text-ent-muted">No providers in the directory yet.</p> : (
          <ul className="space-y-1">
            {providers.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 text-sm border-b border-ent-line/50 pb-1">
                <span>{p.displayName} <span className="text-ent-muted">({PROVIDER_SPECIALTIES.find((s) => s.value === p.specialty)?.label ?? p.specialty})</span></span>
                {role === 'director' && patients.length > 0 && (
                  <select className="rounded-lg border border-ent-line p-1 text-xs" defaultValue="" onChange={(e) => { if (e.target.value) { void associate(p.id, e.target.value); e.target.value = ''; } }}>
                    <option value="">Associate with patient…</option>
                    {patients.map((pt) => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
                  </select>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Request list */}
      <div className="rounded-xl border border-ent-line p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Clinical Requests</h3>
          {role === 'director' && (
            <button type="button" className="rounded-lg border border-ent-line px-3 py-1 text-xs font-semibold" onClick={() => setShowNewRequest((v) => !v)}>New request</button>
          )}
        </div>
        {showNewRequest && role === 'director' && (
          <div className="rounded-lg bg-ent-pale p-3 space-y-2">
            <select className="block w-full rounded-lg border border-ent-line p-2 text-sm" value={requestForm.patientId} onChange={(e) => setRequestForm((f) => ({ ...f, patientId: e.target.value }))}>
              <option value="">Select patient…</option>
              {patients.map((pt) => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
            </select>
            <select className="block w-full rounded-lg border border-ent-line p-2 text-sm" value={requestForm.providerId} onChange={(e) => setRequestForm((f) => ({ ...f, providerId: e.target.value }))}>
              <option value="">Select provider…</option>
              {providers.filter((p) => p.isActive).map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
            </select>
            <select className="block w-full rounded-lg border border-ent-line p-2 text-sm" value={requestForm.requestType} onChange={(e) => setRequestForm((f) => ({ ...f, requestType: e.target.value }))}>
              {REQUEST_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input className="block w-full rounded-lg border border-ent-line p-2 text-sm" placeholder="Title" value={requestForm.title} onChange={(e) => setRequestForm((f) => ({ ...f, title: e.target.value }))} />
            <textarea className="block w-full rounded-lg border border-ent-line p-2 text-sm" rows={2} placeholder="Description (optional)" value={requestForm.description} onChange={(e) => setRequestForm((f) => ({ ...f, description: e.target.value }))} />
            <input type="date" className="block w-full rounded-lg border border-ent-line p-2 text-sm" value={requestForm.deadlineAt} onChange={(e) => setRequestForm((f) => ({ ...f, deadlineAt: e.target.value }))} />
            <button type="button" disabled={busy} onClick={() => { void submitNewRequest(); }} className="rounded-lg bg-ent-bronze px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Create as draft</button>
          </div>
        )}
        {loading ? <p role="status" className="text-sm">Loading…</p> : requests.length === 0 ? <p className="text-sm text-ent-muted">No clinical requests yet.</p> : (
          <ul className="space-y-2">
            {requests.map((r) => (
              <li key={r.id} className={`rounded-xl border p-2 cursor-pointer ${selectedRequestId === r.id ? 'border-ent-bronze bg-ent-pale' : 'border-ent-line'}`} onClick={() => { void openRequest(r.id); }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{r.title}</span>
                  <span className="text-xs text-ent-muted">{REQUEST_STATUS_LABEL[r.status] ?? r.status}</span>
                </div>
                {role === 'director' && (
                  <div className="flex gap-2 mt-1" onClick={(e) => e.stopPropagation()}>
                    {r.status === 'draft' && <button type="button" disabled={busy} onClick={() => { void doSend(r.id, false); }} className="text-xs rounded border border-ent-line px-2 py-1"><Send className="h-3 w-3 inline mr-1" />Send</button>}
                    {r.status === 'sent' && <button type="button" disabled={busy} onClick={() => { void doSend(r.id, true); }} className="text-xs rounded border border-ent-line px-2 py-1">Resend</button>}
                    {['sent', 'response_received'].includes(r.status) && <button type="button" disabled={busy} onClick={() => { void doRevoke(r.id); }} className="text-xs rounded border border-ent-line px-2 py-1">Revoke access</button>}
                    {!['closed', 'cancelled', 'rejected', 'accepted'].includes(r.status) && <button type="button" disabled={busy} onClick={() => { void doCancel(r.id); }} className="text-xs rounded border border-ent-line px-2 py-1 text-ent-rust">Cancel</button>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Request detail */}
      {selectedRequest && (
        <div className="rounded-xl border border-ent-line p-3 space-y-3">
          <h3 className="font-semibold text-sm">{selectedRequest.title} — documents & history</h3>

          <div className="space-y-2">
            {requestDocs.length === 0 ? <p className="text-sm text-ent-muted">No documents yet.</p> : requestDocs.map(({ direction, document: doc }) => (
              <div key={doc.id} className="flex items-center justify-between gap-2 border border-ent-line rounded-lg p-2">
                <div className="text-sm">
                  <div>{doc.originalFilename} <span className="text-ent-muted text-xs">({direction === 'shared_with_recipient' ? 'shared with provider' : 'received from provider'})</span></div>
                  <div className="text-xs text-ent-muted">{doc.reviewStatus.replace(/_/g, ' ')} · {DOCUMENT_CATEGORIES.find((c) => c.value === doc.category)?.label ?? doc.category}</div>
                </div>
                <div className="flex gap-1 items-center">
                  <button type="button" onClick={() => { void doDownload(doc); }} className="text-xs rounded border border-ent-line px-2 py-1"><Download className="h-3 w-3 inline mr-1" />Download</button>
                  {role === 'director' && doc.reviewStatus === 'received_unreviewed' && (
                    <>
                      <button type="button" disabled={busy} onClick={() => { void doAdministrativeReview(doc.id, 'accepted'); }} className="text-xs rounded border border-ent-green px-2 py-1 text-ent-green">Accept</button>
                      <button type="button" disabled={busy} onClick={() => { void doAdministrativeReview(doc.id, 'revision_required'); }} className="text-xs rounded border border-ent-amber px-2 py-1">Needs revision</button>
                      <button type="button" disabled={busy} onClick={() => { void doAdministrativeReview(doc.id, 'forwarded_for_clinical_review'); }} className="text-xs rounded border border-ent-line px-2 py-1">Forward for clinical review</button>
                    </>
                  )}
                  {role === 'clinical' && doc.reviewStatus === 'forwarded_for_clinical_review' && (
                    <button type="button" disabled={busy} onClick={() => { void doClinicalApprove(doc.id); }} className="text-xs rounded border border-ent-green px-2 py-1 text-ent-green"><ShieldCheck className="h-3 w-3 inline mr-1" />Clinically approve</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {(role === 'director' || role === 'caregiver' || role === 'clinical') && (
            <div className="space-y-1">
              <input type="text" placeholder="Review notes (used for the next action above)" value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} className="block w-full rounded-lg border border-ent-line p-2 text-sm" />
            </div>
          )}

          <div className="flex items-end gap-2">
            <select className="rounded-lg border border-ent-line p-2 text-sm" value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)}>
              {DOCUMENT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <select className="rounded-lg border border-ent-line p-2 text-sm" value={uploadClassification} onChange={(e) => setUploadClassification(e.target.value)}>
              {DOCUMENT_CLASSIFICATIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} className="text-sm" />
            <button type="button" disabled={busy || !uploadFile} onClick={() => { void doUpload(); }} className="rounded-lg bg-ent-bronze px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Upload className="h-3 w-3 inline mr-1" />Upload</button>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-ent-muted mb-1">Event history</h4>
            <ul className="text-xs text-ent-muted space-y-0.5">
              {events.map((ev) => <li key={ev.id}>{new Date(ev.createdAt).toLocaleString()} — {ev.eventType.replace(/_/g, ' ')}</li>)}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
