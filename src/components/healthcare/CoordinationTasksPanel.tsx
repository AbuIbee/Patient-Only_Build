import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, ClipboardCheck, Download, ListChecks, RefreshCw } from 'lucide-react';
import {
  type CoordinationTask, type CoordinationTaskKind, type EligiblePlanStaff, type ClinicalDocument,
  type CoordinationPlanParticipant,
  getCoordinationTasks, getCoordinationTaskDependencies, getInstructionAcknowledgements,
  getEligiblePlanStaff, getDocumentsForPatient,
  getAuthorizedClinicalDocument, getSignedDownloadUrl, createCoordinationTask,
  setCoordinationTaskStatus, reviewCoordinationTask, acknowledgeCoordinationInstruction,
} from '@/services/hcnClinicalCoordinationService';

/**
 * Shared task workflow in the EXISTING Haneen Clinical Coordination Center.
 * The Director/Owner coordinates; Medical/Therapy staff submit their assigned
 * work; the Director accepts completion (not medical validity); only a
 * clinically approved document can be released as Caregiver instructions.
 * Server RPCs and task RLS enforce every authorization and transition.
 */
type Props = {
  planId: string; patientId: string; userId: string;
  role: 'director' | 'caregiver' | 'clinical'; active: boolean;
  // Owned by the parent (ClinicalCoordinationPanel), which already
  // refetches this on every participant add/remove -- passed down
  // rather than independently refetched here so a newly added
  // participant is immediately assignable, instead of only appearing
  // after this panel's own unrelated refresh() happens to re-run.
  planParticipants: CoordinationPlanParticipant[];
};
const TYPES: { value: CoordinationTaskKind; label: string }[] = [
  { value: 'medical_review', label: 'Medical review' },
  { value: 'therapy_review', label: 'Therapy review' },
  { value: 'care_instruction', label: 'Caregiver instructions' },
  { value: 'general', label: 'General coordination' },
];
const EMPTY_FORM = {
  title: '', details: '', kind: 'general' as CoordinationTaskKind,
  assigneeId: '', dueAt: '', sourceDocumentId: '', dependencyIds: [] as string[],
};

export default function CoordinationTasksPanel({ planId, patientId, userId, role, active, planParticipants }: Props) {
  const [tasks, setTasks] = useState<CoordinationTask[]>([]);
  const [dependencies, setDependencies] = useState<Record<string, string[]>>({});
  const [staff, setStaff] = useState<EligiblePlanStaff[]>([]);
  const currentPlanMemberIds = planParticipants
    .filter((member) => member.participantType === 'internal_user' && !member.removedAt)
    .map((member) => member.participantUserId)
    .filter((id): id is string => Boolean(id));
  const [openedInstructions, setOpenedInstructions] = useState<string[]>([]);
  const [documents, setDocuments] = useState<ClinicalDocument[]>([]);
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [resultNotes, setResultNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [loadError, setLoadError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [taskResponse, dependencyResponse, ackResponse, staffResponse, docsResponse] = await Promise.all([
        getCoordinationTasks(planId),
        getCoordinationTaskDependencies(planId),
        getInstructionAcknowledgements(planId),
        role === 'director' ? getEligiblePlanStaff(planId) : Promise.resolve({ data: [] as EligiblePlanStaff[], error: null }),
        role === 'director' ? getDocumentsForPatient(patientId) : Promise.resolve({ data: [] as ClinicalDocument[], error: null }),
      ]);
      const failure = taskResponse.error || dependencyResponse.error || ackResponse.error || staffResponse.error ||
        docsResponse.error;
      if (failure) throw new Error(failure);
      setTasks(taskResponse.data ?? []);
      setDependencies(dependencyResponse.data ?? {});
      setAcknowledged(ackResponse.data ?? []);
      setStaff(staffResponse.data ?? []);
      setDocuments(docsResponse.data ?? []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load coordination tasks.');
    } finally {
      setLoading(false);
    }
  }, [planId, patientId, role]);

  useEffect(() => {
    setTasks([]); setDependencies({}); setAcknowledged([]);
    setOpenedInstructions([]);
    setForm(EMPTY_FORM); setResultNotes({});
    void refresh();
  }, [refresh]);

  const execute = async (action: () => Promise<{ error: string | null }>, success: string) => {
    if (working) return;
    setWorking(true);
    try {
      const result = await action();
      if (result.error) { toast.error(result.error); return; }
      toast.success(success);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Operation failed.');
    } finally {
      setWorking(false);
    }
  };

  const create = async () => {
    if (!form.title.trim() || !form.assigneeId) {
      toast.error('Task title and assigned staff member are required.'); return;
    }
    if (form.kind === 'care_instruction' && !form.sourceDocumentId) {
      toast.error('Caregiver instructions require a clinically approved source document.'); return;
    }
    const dueAt = form.dueAt ? new Date(form.dueAt).toISOString() : null;
    await execute(() => createCoordinationTask({
      planId, title: form.title.trim(), details: form.details.trim(), kind: form.kind,
      assigneeId: form.assigneeId, dueAt,
      sourceDocumentId: form.sourceDocumentId || null,
      dependencyIds: form.dependencyIds,
    }), 'Coordination task created.');
    setForm(EMPTY_FORM);
    setShowForm(false);
  };

  const downloadApprovedInstructions = async (task: CoordinationTask) => {
    if (working || task.kind !== 'care_instruction' || task.status !== 'approved' ||
        !task.sourceDocumentId || task.assignedUserId !== userId) return;
    setWorking(true);
    try {
      const metadata = await getAuthorizedClinicalDocument(task.sourceDocumentId, patientId, task.organizationId);
      if (metadata.error || !metadata.data) {
        toast.error(metadata.error ?? 'The instruction document is unavailable.'); return;
      }
      if (metadata.data.classification !== 'caregiver_approved_instructions' ||
          metadata.data.reviewStatus !== 'clinical_approved') {
        toast.error('Only clinically approved instructions can be downloaded.'); return;
      }
      const signed = await getSignedDownloadUrl(metadata.data.storagePath, metadata.data.originalFilename);
      if (signed.error || !signed.url) {
        toast.error(signed.error ?? 'Download was not authorized.'); return;
      }
      // Trigger download without navigating away from the care workflow.
      // The signed URL is short-lived; the Storage bucket remains private.
      const link = document.createElement('a');
      link.href = signed.url;
      link.download = metadata.data.originalFilename;
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setOpenedInstructions((ids) => ids.includes(task.id) ? ids : [...ids, task.id]);
      toast.success('Instruction download requested. Review the file before acknowledging.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not download instructions.');
    } finally {
      setWorking(false);
    }
  };

  const nameOf = (id: string) => staff.find((s) => s.userId === id)?.displayName ?? (id === userId ? 'You' : 'Assigned staff');
  const isBlocked = (task: CoordinationTask) => (dependencies[task.id] ?? []).some((dep) =>
    tasks.find((item) => item.id === dep)?.status !== 'approved'
  );

  return (
    <section aria-label="Coordination tasks" className="rounded-xl border border-ent-line p-3 space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h5 className="flex items-center gap-2 text-sm font-semibold">
          <ListChecks className="h-4 w-4" /> Coordination tasks and approvals
        </h5>
        <div className="flex items-center gap-2">
          <button type="button" disabled={loading || working} onClick={() => { void refresh(); }}
            aria-label="Refresh coordination tasks" className="rounded-lg border border-ent-line p-2 disabled:opacity-50">
            <RefreshCw className="h-3.5 w-3.5"/>
          </button>
          {role === 'director' && active && (
            <button type="button" onClick={() => setShowForm((v) => !v)}
              className="rounded-lg border border-ent-line px-3 py-2 text-xs font-semibold">
              {showForm ? 'Cancel' : 'New task'}
            </button>
          )}
        </div>
      </header>

      <p className="text-xs text-ent-muted">
        Work follows explicit prerequisites. Clinical professionals submit findings; the Director confirms
        coordination completion. Caregiver instructions require a separately clinically approved document.
      </p>
      {loadError && <p role="alert" className="text-sm text-ent-rust">{loadError}</p>}

      {showForm && role === 'director' && active && (
        <div className="space-y-2 rounded-lg bg-ent-pale p-3">
          <input type="text" aria-label="Coordination task title" placeholder="Task title" maxLength={200}
            value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="w-full rounded-lg border border-ent-line p-2 text-sm"/>
          <textarea aria-label="Task details" placeholder="Required work and context (visible only to authorized participants)"
            value={form.details} maxLength={10000} onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
            className="w-full rounded-lg border border-ent-line p-2 text-sm" rows={2}/>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-xs">Task type
              <select aria-label="Task type" value={form.kind} onChange={(e) =>
                setForm((f) => ({ ...f, kind: e.target.value as CoordinationTaskKind, assigneeId: '' }))}
                className="block w-full rounded-lg border border-ent-line p-2 text-sm">
                {TYPES.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs">Assigned staff
              <select aria-label="Assigned staff" value={form.assigneeId} onChange={(e) =>
                setForm((f) => ({ ...f, assigneeId: e.target.value }))}
                className="block w-full rounded-lg border border-ent-line p-2 text-sm">
                <option value="">Select assigned care-team member…</option>
                {staff.filter((s) => currentPlanMemberIds.includes(s.userId)).filter((s) =>
                  form.kind === 'medical_review' ? ['medical_professional', 'clinical_supervisor'].includes(s.orgRole)
                  : form.kind === 'therapy_review' ? ['therapist', 'clinical_supervisor'].includes(s.orgRole)
                  : form.kind === 'care_instruction' ? s.orgRole === 'caregiver' : true
                ).map((s) => <option key={s.userId} value={s.userId}>{s.displayName} ({s.orgRole.replace(/_/g, ' ')})</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs">Due date and time
              <input type="datetime-local" value={form.dueAt} onChange={(e) =>
                setForm((f) => ({ ...f, dueAt: e.target.value }))}
                className="block w-full rounded-lg border border-ent-line p-2 text-sm"/>
            </label>
            <label className="space-y-1 text-xs">Supporting clinical document
              <select aria-label="Supporting clinical document" value={form.sourceDocumentId} onChange={(e) =>
                setForm((f) => ({ ...f, sourceDocumentId: e.target.value }))}
                className="block w-full rounded-lg border border-ent-line p-2 text-sm">
                <option value="">No document</option>
                {documents.filter((d) => form.kind !== 'care_instruction' ||
                  (d.classification === 'caregiver_approved_instructions' && d.reviewStatus === 'clinical_approved'))
                .map((d) => <option key={d.id} value={d.id}>{d.originalFilename} ({d.reviewStatus.replace(/_/g, ' ')})</option>)}
              </select>
            </label>
          </div>
          {tasks.length > 0 && (
            <fieldset className="rounded-lg border border-ent-line p-2 space-y-1">
              <legend className="text-xs font-semibold">Prerequisites (optional)</legend>
              {tasks.filter((t) => t.status !== 'cancelled').map((task) => (
                <label key={task.id} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={form.dependencyIds.includes(task.id)}
                    onChange={(e) => setForm((f) => ({
                      ...f, dependencyIds: e.target.checked ?
                        [...f.dependencyIds, task.id] : f.dependencyIds.filter((id) => id !== task.id),
                    }))}/>
                  {task.title} — {task.status}
                </label>
              ))}
            </fieldset>
          )}
          <button type="button" disabled={working} onClick={() => { void create(); }}
            className="rounded-lg bg-ent-bronze px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
            Create coordination task
          </button>
        </div>
      )}

      {loading ? <p role="status" className="text-sm text-ent-muted">Loading tasks…</p> : tasks.length === 0 ? (
        <p className="text-sm text-ent-muted">
          {role === 'director' ? 'No tasks yet. Assign a Medical, Therapy, or Caregiver task to the named care team.' : 'No assigned tasks in this plan.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {tasks.map((task) => {
            const mine = task.assignedUserId === userId;
            const blocked = isBlocked(task);
            const ack = acknowledged.includes(task.id);
            return (
              <li key={task.id} className="rounded-lg border border-ent-line p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm">{task.title}</strong>
                  <span className="text-xs text-ent-muted">{task.kind.replace(/_/g, ' ')} · {task.status.replace(/_/g, ' ')}</span>
                </div>
                {role === 'director' && <p className="text-xs text-ent-muted">Assigned to {nameOf(task.assignedUserId)}</p>}
                {task.details && <p className="text-xs whitespace-pre-wrap">{task.details}</p>}
                {task.dueAt && <p className="text-xs text-ent-muted">Due: {new Date(task.dueAt).toLocaleString()}</p>}
                {blocked && <p className="text-xs text-ent-amber">Waiting for prerequisite task approval.</p>}
                {task.resultNote && <p className="rounded-lg bg-ent-pale p-2 text-xs whitespace-pre-wrap">Submitted: {task.resultNote}</p>}
                {task.kind === 'care_instruction' && task.status === 'approved' && (
                  <p className="flex items-center gap-1 text-xs text-ent-green">
                    <ClipboardCheck className="h-3.5 w-3.5" />
                    Clinically approved instructions released {ack ? 'and acknowledged' : '— acknowledgement required'}
                  </p>
                )}
                {role === 'caregiver' && mine && task.kind === 'care_instruction' &&
                  task.status === 'approved' && (
                    <button type="button" disabled={working || !task.sourceDocumentId}
                      aria-label={'Download approved instructions for ' + task.title}
                      onClick={() => { void downloadApprovedInstructions(task); }}
                      className="inline-flex items-center gap-1 rounded-lg border border-ent-line px-3 py-1 text-xs disabled:opacity-50">
                      <Download className="h-3.5 w-3.5" /> Download approved instructions
                    </button>
                  )}
                {!blocked && mine && active && task.kind !== 'care_instruction' && task.status === 'pending' && (
                  <button type="button" disabled={working} onClick={() =>
                    { void execute(() => setCoordinationTaskStatus(task.id, 'start', null), 'Work started.'); }}
                    className="rounded-lg border border-ent-line px-3 py-1 text-xs disabled:opacity-50">Start work</button>
                )}
                {mine && active && task.kind !== 'care_instruction' && task.status === 'in_progress' && (
                  <div className="space-y-1">
                    <textarea rows={2} aria-label={'Result summary for ' + task.title}
                      placeholder="Summary of completed work for Director review" className="w-full rounded-lg border border-ent-line p-2 text-xs"
                      value={resultNotes[task.id] ?? ''} onChange={(e) =>
                        setResultNotes((r) => ({ ...r, [task.id]: e.target.value }))}/>
                    <button type="button" disabled={working || !(resultNotes[task.id] ?? '').trim()}
                      onClick={() => { void execute(() =>
                        setCoordinationTaskStatus(task.id, 'submit', resultNotes[task.id]), 'Sent to Director for review.'); }}
                      className="rounded-lg bg-ent-bronze px-3 py-1 text-xs text-white disabled:opacity-50">Submit work</button>
                  </div>
                )}
                {role === 'director' && active && task.status === 'submitted' && (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={working} onClick={() => {
                      void execute(() => reviewCoordinationTask(task.id, 'accept', null),
                        'Coordination completion accepted (not a clinical approval).');
                    }} className="rounded-lg border border-ent-green px-3 py-1 text-xs disabled:opacity-50">
                      Accept completion
                    </button>
                    <button type="button" disabled={working} onClick={() => {
                      const reason = window.prompt('Reason for revision?');
                      if (!reason?.trim()) return;
                      void execute(() => reviewCoordinationTask(task.id, 'revision', reason.trim()), 'Revision requested.');
                    }} className="rounded-lg border border-ent-line px-3 py-1 text-xs disabled:opacity-50">
                      Request revision
                    </button>
                  </div>
                )}
                {role === 'director' && active && task.kind === 'care_instruction' &&
                  task.status === 'pending' && !blocked && (
                    <button type="button" disabled={working} onClick={() => {
                      void execute(() => reviewCoordinationTask(task.id, 'release', null),
                        'Clinically approved instructions released to the Caregiver.');
                    }} className="rounded-lg border border-ent-green px-3 py-1 text-xs disabled:opacity-50">
                      Release approved instructions
                    </button>
                  )}
                {role === 'caregiver' && mine && active && task.kind === 'care_instruction' &&
                  task.status === 'approved' && !ack && (
                    <button type="button" disabled={working || !openedInstructions.includes(task.id)}
                      title={openedInstructions.includes(task.id) ? 'Confirm that you reviewed the downloaded file' : 'Download and review the clinically approved document first'}
                      onClick={() => {
                      void execute(() => acknowledgeCoordinationInstruction(task.id),
                        'Instruction acknowledgement recorded.');
                    }} className="inline-flex items-center gap-1 rounded-lg border border-ent-green px-3 py-1 text-xs disabled:opacity-50">
                      <CheckCircle2 className="h-3.5 w-3.5"/> I reviewed these instructions
                    </button>
                  )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
