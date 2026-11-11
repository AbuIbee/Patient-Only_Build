import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import CoordinationTasksPanel from '@/components/healthcare/CoordinationTasksPanel';
import { Stethoscope, RefreshCw, Send, Download, Upload, UserPlus, ShieldCheck, Users } from 'lucide-react';
import {
  type HealthcareProvider, type ClinicalRequest, type ClinicalDocument, type RequestEvent,
  type CoordinationPlan, type CoordinationPlanParticipant, type CoordinationPlanUpdate,
  getProviders, upsertProvider, setProviderActive, associateProviderWithPatient, getClinicalRequests, createClinicalRequest,
  sendClinicalRequest, resendClinicalRequestInvitation, cancelClinicalRequest, revokeClinicalRequestAccess,
  getDocumentsForRequest, getRequestEvents, reviewClinicalDocument, clinicalApproveDocument,
  publishProviderDocumentToPatient,
  attachInternalDocumentToRequest,
  uploadInternalDocument, getSignedDownloadUrl, sendClinicalRequestNotification,
  getCoordinationPlans, createCoordinationPlan, addCoordinationPlanParticipant, getCoordinationPlanParticipants,
  postCoordinationPlanUpdate, getCoordinationPlanUpdates, closeCoordinationPlan,
  type ClinicalCoordinationReport, getClinicalCoordinationReport,
  type CoordinationTaskMetrics, getCoordinationTaskMetrics,
  type EligiblePlanStaff, getEligiblePlanStaff,
  type ClinicalProviderPerformance, getClinicalProviderPerformance,
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
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [providerSearch, setProviderSearch] = useState('');
  const [providerForm, setProviderForm] = useState({
    displayName: '', specialty: 'medical_specialist', specialtyOtherLabel: '',
    professionalTitle: '', practiceName: '', officePhone: '', faxNumber: '',
    secureContactEmail: '', officeAddress: '', professionalIdentifier: '', credentials: '',
  });

  const [showNewRequest, setShowNewRequest] = useState(false);
  const [requestForm, setRequestForm] = useState({
    patientId: patients[0]?.id ?? '', providerId: '', requestType: 'general_provider_coordination',
    title: '', description: '', deadlineAt: '', requestedItemsText: '',
  });

  const [uploadCategory, setUploadCategory] = useState('other_clinical_attachment');
  const [uploadClassification, setUploadClassification] = useState('general_care_coordination');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  const [planPatientId, setPlanPatientId] = useState(patients[0]?.id ?? '');
  const [plans, setPlans] = useState<CoordinationPlan[]>([]);
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [planForm, setPlanForm] = useState({ title: '', description: '' });
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [planParticipants, setPlanParticipants] = useState<CoordinationPlanParticipant[]>([]);
  const [eligiblePlanStaff, setEligiblePlanStaff] = useState<EligiblePlanStaff[]>([]);
  const [planUpdates, setPlanUpdates] = useState<CoordinationPlanUpdate[]>([]);
  const [newParticipantUserId, setNewParticipantUserId] = useState('');
  const [newParticipantRole, setNewParticipantRole] = useState('');
  const [newExternalProviderId, setNewExternalProviderId] = useState('');
  const [planUpdateText, setPlanUpdateText] = useState('');
  const [report, setReport] = useState<ClinicalCoordinationReport | null>(null);
  const [taskMetrics, setTaskMetrics] = useState<CoordinationTaskMetrics | null>(null);
  const [providerMetrics, setProviderMetrics] = useState<ClinicalProviderPerformance[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [p, r] = await Promise.all([getProviders(orgId), getClinicalRequests(orgId)]);
      if (p.error) setError(p.error); else setProviders(p.data ?? []);
      if (r.error) setError(r.error); else setRequests(r.data ?? []);
      if (role === 'director') {
        const rep = await getClinicalCoordinationReport(orgId);
        if (!rep.error) setReport(rep.data);
        const metrics = await getCoordinationTaskMetrics(orgId);
        if (!metrics.error) setTaskMetrics(metrics.data);
        const performance = await getClinicalProviderPerformance(orgId);
        if (!performance.error) setProviderMetrics(performance.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [orgId, role]);
  useEffect(() => { void refresh(); }, [refresh]);

  const openRequest = useCallback(async (id: string) => {
    setSelectedRequestId(id);
    const [docs, evts] = await Promise.all([getDocumentsForRequest(id), getRequestEvents(id)]);
    setRequestDocs(docs.data ?? []);
    setEvents(evts.data ?? []);
  }, []);

  const selectedRequest = requests.find((r) => r.id === selectedRequestId) ?? null;

  const refreshPlans = useCallback(async (patientId: string) => {
    if (!patientId) { setPlans([]); return; }
    const r = await getCoordinationPlans(patientId);
    if (r.error) toast.error(r.error); else setPlans(r.data ?? []);
  }, []);
  useEffect(() => { void refreshPlans(planPatientId); }, [planPatientId, refreshPlans]);

  const openPlan = useCallback(async (id: string) => {
    setSelectedPlanId(id);
    const [p, u, staff] = await Promise.all([
      getCoordinationPlanParticipants(id),
      getCoordinationPlanUpdates(id),
      role === 'director' ? getEligiblePlanStaff(id) : Promise.resolve({ data: [], error: null }),
    ]);
    setPlanParticipants(p.data ?? []);
    setPlanUpdates(u.data ?? []);
    setEligiblePlanStaff(staff.data ?? []);
  }, [role]);
  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? null;

  const submitNewPlan = async () => {
    if (!planPatientId || !planForm.title.trim()) { toast.error('A patient and a title are required.'); return; }
    setBusy(true);
    try {
      const r = await createCoordinationPlan(orgId, planPatientId, planForm.title.trim(), planForm.description.trim() || null);
      if (r.error) { toast.error(r.error); return; }
      toast.success('Coordination plan created.');
      setShowNewPlan(false);
      setPlanForm({ title: '', description: '' });
      await refreshPlans(planPatientId);
    } finally { setBusy(false); }
  };

  const doAddParticipant = async (type: 'internal_user' | 'external_provider') => {
    if (!selectedPlanId) return;
    if (type === 'internal_user' && (!newParticipantUserId.trim() || !newParticipantRole.trim())) {
      toast.error('A user ID and a role label are required.'); return;
    }
    if (type === 'external_provider' && (!newExternalProviderId || !newParticipantRole.trim())) {
      toast.error('A provider and a role label are required.'); return;
    }
    setBusy(true);
    try {
      const r = await addCoordinationPlanParticipant({
        planId: selectedPlanId, participantType: type,
        participantUserId: type === 'internal_user' ? newParticipantUserId.trim() : null,
        externalProviderId: type === 'external_provider' ? newExternalProviderId : null,
        roleLabel: newParticipantRole.trim(),
      });
      if (r.error) { toast.error(r.error); return; }
      toast.success('Participant added.');
      setNewParticipantUserId(''); setNewParticipantRole(''); setNewExternalProviderId('');
      await openPlan(selectedPlanId);
    } finally { setBusy(false); }
  };

  const doPostPlanUpdate = async () => {
    if (!selectedPlanId || !planUpdateText.trim()) return;
    setBusy(true);
    try {
      const r = await postCoordinationPlanUpdate(selectedPlanId, planUpdateText.trim());
      if (r.error) { toast.error(r.error); return; }
      setPlanUpdateText('');
      await openPlan(selectedPlanId);
    } finally { setBusy(false); }
  };

  const doClosePlan = async () => {
    if (!selectedPlanId) return;
    const summary = window.prompt('Closing summary for this coordination plan?') ?? '';
    if (!summary.trim()) return;
    setBusy(true);
    try {
      const r = await closeCoordinationPlan(selectedPlanId, summary.trim());
      if (r.error) { toast.error(r.error); return; }
      toast.success('Coordination plan closed.');
      await refreshPlans(planPatientId);
    } finally { setBusy(false); }
  };

  const saveProvider = async () => {
    if (!providerForm.displayName.trim()) { toast.error('Enter a provider name.'); return; }
    setBusy(true);
    try {
      const r = await upsertProvider(orgId, {
        providerId: editingProviderId,
        expectedVersion: editingProviderId ? providers.find((p) => p.id === editingProviderId)?.version : undefined,
        displayName: providerForm.displayName.trim(),
        professionalTitle: providerForm.professionalTitle.trim() || null,
        specialty: providerForm.specialty, specialtyOtherLabel: providerForm.specialty === 'other' ?
          providerForm.specialtyOtherLabel.trim() || null : null,
        practiceName: providerForm.practiceName.trim() || null,
        officePhone: providerForm.officePhone.trim() || null,
        faxNumber: providerForm.faxNumber.trim() || null,
        secureContactEmail: providerForm.secureContactEmail.trim() || null,
        officeAddress: providerForm.officeAddress.trim() || null,
        professionalIdentifier: providerForm.professionalIdentifier.trim() || null,
        credentials: providerForm.credentials.trim() || null,
      });
      if (r.error) { toast.error(r.error); return; }
      toast.success('Provider saved.');
      setShowNewProvider(false);
      setEditingProviderId(null);
      setProviderForm({
        displayName: '', specialty: 'medical_specialist', specialtyOtherLabel: '',
        professionalTitle: '', practiceName: '', officePhone: '', faxNumber: '',
        secureContactEmail: '', officeAddress: '', professionalIdentifier: '', credentials: '',
      });
      await refresh();
    } finally { setBusy(false); }
  };

  const editProvider = (provider: HealthcareProvider) => {
    setEditingProviderId(provider.id);
    setShowNewProvider(true);
    setProviderForm({
      displayName: provider.displayName, specialty: provider.specialty,
      specialtyOtherLabel: provider.specialtyOtherLabel ?? '',
      professionalTitle: provider.professionalTitle ?? '', practiceName: provider.practiceName ?? '',
      officePhone: provider.officePhone ?? '', faxNumber: provider.faxNumber ?? '',
      secureContactEmail: provider.secureContactEmail ?? '', officeAddress: provider.officeAddress ?? '',
      professionalIdentifier: provider.professionalIdentifier ?? '', credentials: provider.credentials ?? '',
    });
  };

  const toggleProvider = async (provider: HealthcareProvider) => {
    if (provider.isActive && !window.confirm('Deactivate this provider for future requests? Existing requests remain unchanged.')) return;
    setBusy(true);
    try {
      const result = await setProviderActive(provider.id, !provider.isActive);
      if (result.error) { toast.error(result.error); return; }
      toast.success(provider.isActive ? 'Provider deactivated.' : 'Provider reactivated.');
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
        requestedItems: requestForm.requestedItemsText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
        deadlineAt: requestForm.deadlineAt || null, followUpOwnerId: userId,
      });
      if (r.error) { toast.error(r.error); return; }
      toast.success('Request created as a draft.');
      setShowNewRequest(false);
      setRequestForm({ patientId: patients[0]?.id ?? '', providerId: '', requestType: 'general_provider_coordination', title: '', description: '', deadlineAt: '', requestedItemsText: '' });
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
      if (!r.data) { toast.error('Document metadata missing after upload.'); return; }
      const attached = await attachInternalDocumentToRequest(selectedRequest.id, r.data.id);
      if (attached.error) {
        toast.error('File uploaded but could not be attached to this request: ' + attached.error);
        return;
      }
      toast.success(`${uploadFile.name} uploaded and attached to this request (not shared externally).`);
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

  const doPublishToPatient = async (doc: ClinicalDocument) => {
    if (!window.confirm('Share this reviewed provider document with the patient portal?')) return;
    setBusy(true);
    try {
      const result = await publishProviderDocumentToPatient(doc.id);
      if (result.error) { toast.error(result.error); return; }
      toast.success('Reviewed provider document shared with the patient portal.');
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

      {role === 'director' && taskMetrics && (
        <div aria-label="Coordination task metrics" className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            ['Open tasks', taskMetrics.activeTasks],
            ['Blocked', taskMetrics.blockedTasks],
            ['Overdue tasks', taskMetrics.overdueTasks],
            ['Awaiting task review', taskMetrics.reviewPending],
            ['Caregiver acknowledgements due', taskMetrics.unacknowledgedInstructions],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-ent-line p-2 text-center">
              <div className="text-lg font-bold text-ent-ink">{value}</div>
              <div className="text-[11px] text-ent-muted">{label}</div>
            </div>
          ))}
        </div>
      )}
      {role === 'director' && report && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-lg border border-ent-line p-2 text-center">
            <div className="text-lg font-bold text-ent-ink">{report.requestsOverdue}</div>
            <div className="text-[11px] text-ent-muted">Overdue requests</div>
          </div>
          <div className="rounded-lg border border-ent-line p-2 text-center">
            <div className="text-lg font-bold text-ent-ink">{report.documentsPendingAdministrativeReview}</div>
            <div className="text-[11px] text-ent-muted">Docs awaiting review</div>
          </div>
          <div className="rounded-lg border border-ent-line p-2 text-center">
            <div className="text-lg font-bold text-ent-ink">{report.documentsPendingClinicalApproval}</div>
            <div className="text-[11px] text-ent-muted">Awaiting clinical approval</div>
          </div>
          <div className="rounded-lg border border-ent-line p-2 text-center">
            <div className="text-lg font-bold text-ent-ink">{report.activeCoordinationPlans}</div>
            <div className="text-[11px] text-ent-muted">Active coordination plans</div>
          </div>
        </div>
      )}

      {role === 'director' && providerMetrics.length > 0 && (
        <section aria-label="Provider response performance" className="rounded-xl border border-ent-line p-3 space-y-2">
          <h3 className="text-sm font-semibold">Provider response performance</h3>
          <p className="text-xs text-ent-muted">Operational metrics only; hours measure first response since sending.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead><tr className="border-b border-ent-line">
                <th className="p-2">Provider</th><th className="p-2">Total</th><th className="p-2">Pending</th>
                <th className="p-2">Overdue</th><th className="p-2">Responded</th><th className="p-2">Avg. response</th>
              </tr></thead>
              <tbody>{providerMetrics.map((p) => (
                <tr key={p.providerId} className="border-b border-ent-line/40">
                  <td className="p-2 font-medium">{p.providerName}</td>
                  <td className="p-2">{p.totalRequests}</td><td className="p-2">{p.awaitingResponse}</td>
                  <td className="p-2">{p.overdueRequests}</td><td className="p-2">{p.responsesReceived}</td>
                  <td className="p-2">{p.averageResponseHours === null ? '—' : p.averageResponseHours + ' hours'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}

      {/* Provider directory */}
      <div className="rounded-xl border border-ent-line p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Healthcare Provider Directory</h3>
          {role === 'director' && (
            <button type="button" className="rounded-lg border border-ent-line px-3 py-1 text-xs font-semibold" onClick={() => setShowNewProvider((v) => !v)}>
              <UserPlus className="h-3 w-3 inline mr-1" /> {showNewProvider ? 'Close form' : 'Add provider'}
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
            <input className="block w-full rounded-lg border border-ent-line p-2 text-sm" placeholder="Professional title"
              value={providerForm.professionalTitle} onChange={(e) => setProviderForm((f) => ({ ...f, professionalTitle: e.target.value }))} />
            {providerForm.specialty === 'other' && (
              <input className="block w-full rounded-lg border border-ent-line p-2 text-sm" placeholder="Specify specialty"
                value={providerForm.specialtyOtherLabel} onChange={(e) => setProviderForm((f) => ({ ...f, specialtyOtherLabel: e.target.value }))} />
            )}
            <input className="block w-full rounded-lg border border-ent-line p-2 text-sm" placeholder="Fax number"
              value={providerForm.faxNumber} onChange={(e) => setProviderForm((f) => ({ ...f, faxNumber: e.target.value }))} />
            <input className="block w-full rounded-lg border border-ent-line p-2 text-sm" placeholder="Office address"
              value={providerForm.officeAddress} onChange={(e) => setProviderForm((f) => ({ ...f, officeAddress: e.target.value }))} />
            <input className="block w-full rounded-lg border border-ent-line p-2 text-sm" placeholder="NPI or other professional identifier"
              value={providerForm.professionalIdentifier} onChange={(e) => setProviderForm((f) => ({ ...f, professionalIdentifier: e.target.value }))} />
            <input className="block w-full rounded-lg border border-ent-line p-2 text-sm" placeholder="Credentials"
              value={providerForm.credentials} onChange={(e) => setProviderForm((f) => ({ ...f, credentials: e.target.value }))} />
            <button type="button" disabled={busy} onClick={() => { void saveProvider(); }} className="rounded-lg bg-ent-bronze px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{editingProviderId ? 'Save changes' : 'Save provider'}</button>
          </div>
        )}
        <input aria-label="Search healthcare directory" className="w-full rounded-lg border border-ent-line p-2 text-sm"
          placeholder="Search by provider, specialty or practice"
          value={providerSearch} onChange={(e) => setProviderSearch(e.target.value)} />
        {loading ? <p role="status" className="text-sm">Loading…</p> : providers.length === 0 ? <p className="text-sm text-ent-muted">No providers in the directory yet.</p> : (
          <ul className="space-y-1">
            {providers.filter((p) => [p.displayName, p.practiceName, p.specialty].some((value) =>
              (value ?? '').toLowerCase().includes(providerSearch.toLowerCase().trim())
            )).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 text-sm border-b border-ent-line/50 pb-1">
                <span>{p.displayName} <span className="text-ent-muted">({PROVIDER_SPECIALTIES.find((s) => s.value === p.specialty)?.label ?? p.specialty})</span></span>
                {role === 'director' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" disabled={busy} className="rounded border border-ent-line px-2 py-1 text-xs"
                      onClick={() => editProvider(p)}>Edit</button>
                    <button type="button" disabled={busy} className="rounded border border-ent-line px-2 py-1 text-xs"
                      onClick={() => { void toggleProvider(p); }}>{p.isActive ? 'Deactivate' : 'Reactivate'}</button>
                    {patients.length > 0 && p.isActive && (
                      <select className="rounded-lg border border-ent-line p-1 text-xs" defaultValue=""
                        onChange={(e) => { if (e.target.value) { void associate(p.id, e.target.value); e.target.value = ''; } }}>
                        <option value="">Associate with patient…</option>
                        {patients.map((pt) => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
                      </select>
                    )}
                  </div>
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
            <label className="block text-xs">Requested items (one per line)
              <textarea rows={3} className="block w-full rounded-lg border border-ent-line p-2 text-sm" placeholder="e.g. Updated discharge instructions"
                value={requestForm.requestedItemsText} onChange={(e) => setRequestForm((f) => ({ ...f, requestedItemsText: e.target.value }))} />
            </label>
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
                  <div>{doc.originalFilename} <span className="text-ent-muted text-xs">({direction === 'shared_with_recipient' ? 'shared with provider' :
                    direction === 'uploaded_by_care_team' ? 'uploaded internally — not shared externally' : 'received from provider'})</span></div>
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
                  {role === 'director' && doc.uploaderExternalLabel &&
                    ['accepted','clinical_approved'].includes(doc.reviewStatus) &&
                    doc.classification === 'general_care_coordination' && (
                      <button type="button" disabled={busy} onClick={() => { void doPublishToPatient(doc); }}
                        className="text-xs rounded border border-ent-line px-2 py-1">
                        Share with patient
                      </button>
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

      {/* Coordination Plans (Feature 5 -- Advanced Multi-Provider Coordination) */}
      <div className="rounded-xl border border-ent-line p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-1"><Users className="h-4 w-4" /> Coordination Plans</h3>
          {role === 'director' && (
            <button type="button" className="rounded-lg border border-ent-line px-3 py-1 text-xs font-semibold" onClick={() => setShowNewPlan((v) => !v)}>New plan</button>
          )}
        </div>
        <select className="rounded-lg border border-ent-line p-2 text-sm" value={planPatientId} onChange={(e) => { setPlanPatientId(e.target.value); setSelectedPlanId(null); }}>
          <option value="">Select patient…</option>
          {patients.map((pt) => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
        </select>

        {showNewPlan && role === 'director' && (
          <div className="rounded-lg bg-ent-pale p-3 space-y-2">
            <input className="block w-full rounded-lg border border-ent-line p-2 text-sm" placeholder="Plan title (e.g. Post-Surgery Recovery Coordination)"
              value={planForm.title} onChange={(e) => setPlanForm((f) => ({ ...f, title: e.target.value }))} />
            <textarea className="block w-full rounded-lg border border-ent-line p-2 text-sm" rows={2} placeholder="Description (optional)"
              value={planForm.description} onChange={(e) => setPlanForm((f) => ({ ...f, description: e.target.value }))} />
            <button type="button" disabled={busy} onClick={() => { void submitNewPlan(); }} className="rounded-lg bg-ent-bronze px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Create plan</button>
          </div>
        )}

        {plans.length === 0 ? <p className="text-sm text-ent-muted">No coordination plans for this patient yet.</p> : (
          <ul className="space-y-2">
            {plans.map((p) => (
              <li key={p.id} className={`rounded-xl border p-2 cursor-pointer ${selectedPlanId === p.id ? 'border-ent-bronze bg-ent-pale' : 'border-ent-line'}`} onClick={() => { void openPlan(p.id); }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{p.title}</span>
                  <span className="text-xs text-ent-muted">{p.status}</span>
                </div>
              </li>
            ))}
          </ul>
        )}

        {selectedPlan && (
          <div className="rounded-xl border border-ent-line p-3 space-y-3">
            <h4 className="text-sm font-semibold">{selectedPlan.title} — care team & timeline</h4>

            <div>
              <h5 className="text-xs font-semibold text-ent-muted mb-1">Named participants</h5>
              <ul className="text-sm space-y-0.5">
                {planParticipants.map((pp) => (
                  <li key={pp.id}>{pp.roleLabel} <span className="text-ent-muted text-xs">({pp.participantType === 'external_provider' ? 'external provider' : 'internal'})</span></li>
                ))}
                {planParticipants.length === 0 && <li className="text-ent-muted">No participants named yet.</li>}
              </ul>
            </div>

            {role === 'director' && selectedPlan.status === 'active' && (
              <div className="rounded-lg bg-ent-pale p-2 space-y-2">
                <div className="flex gap-2">
                  <select aria-label="Care-team staff member" className="flex-1 rounded-lg border border-ent-line p-2 text-xs"
                    value={newParticipantUserId} onChange={(e) => setNewParticipantUserId(e.target.value)}>
                    <option value="">Select assigned staff…</option>
                    {eligiblePlanStaff.filter((person) => !planParticipants.some((pp) => pp.participantUserId === person.userId))
                      .map((person) => (
                        <option key={person.userId} value={person.userId}>
                          {person.displayName} ({person.orgRole.replace(/_/g, ' ')})
                        </option>
                      ))}
                  </select>
                  <input className="flex-1 rounded-lg border border-ent-line p-2 text-xs" placeholder="Role on this plan (e.g. Mobility Rehabilitation)"
                    value={newParticipantRole} onChange={(e) => setNewParticipantRole(e.target.value)} />
                  <button type="button" disabled={busy} onClick={() => { void doAddParticipant('internal_user'); }} className="rounded-lg border border-ent-line px-3 py-1 text-xs font-semibold whitespace-nowrap">Add staff</button>
                </div>
                <div className="flex gap-2">
                  <select className="flex-1 rounded-lg border border-ent-line p-2 text-xs" value={newExternalProviderId} onChange={(e) => setNewExternalProviderId(e.target.value)}>
                    <option value="">Select external provider…</option>
                    {providers.filter((p) => p.isActive).map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
                  </select>
                  <button type="button" disabled={busy} onClick={() => { void doAddParticipant('external_provider'); }} className="rounded-lg border border-ent-line px-3 py-1 text-xs font-semibold whitespace-nowrap">Add provider</button>
                </div>
              </div>
            )}

            <CoordinationTasksPanel planId={selectedPlan.id} patientId={selectedPlan.patientId}
              userId={userId} role={role} active={selectedPlan.status === 'active'}
              planParticipants={planParticipants} />

            <div>
              <h5 className="text-xs font-semibold text-ent-muted mb-1">Shared timeline</h5>
              <ul className="text-sm space-y-1 max-h-48 overflow-y-auto">
                {planUpdates.map((u) => (
                  <li key={u.id} className="border-b border-ent-line/40 pb-1"><span className="text-xs text-ent-muted">{new Date(u.createdAt).toLocaleString()}</span> — {u.updateText}</li>
                ))}
                {planUpdates.length === 0 && <li className="text-ent-muted">No updates posted yet.</li>}
              </ul>
            </div>

            {selectedPlan.status === 'active' && (
              <div className="flex gap-2">
                <input className="flex-1 rounded-lg border border-ent-line p-2 text-sm" placeholder="Post an update to the shared timeline…"
                  value={planUpdateText} onChange={(e) => setPlanUpdateText(e.target.value)} />
                <button type="button" disabled={busy || !planUpdateText.trim()} onClick={() => { void doPostPlanUpdate(); }} className="rounded-lg bg-ent-bronze px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Post</button>
              </div>
            )}
            {role === 'director' && selectedPlan.status === 'active' && (
              <button type="button" disabled={busy} onClick={() => { void doClosePlan(); }} className="text-xs rounded border border-ent-line px-2 py-1">Close plan</button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
