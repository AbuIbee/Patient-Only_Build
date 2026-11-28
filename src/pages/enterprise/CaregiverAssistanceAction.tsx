import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, LifeBuoy } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  getCaregiverAssistanceAlerts, openCaregiverAssistanceAlert, type CaregiverAssistanceAlert,
} from '@/services/hcnDirectorSafetyService';

interface PatientChoice { patientId: string; name: string }

export default function CaregiverAssistanceAction({
  orgId, patients, suggestedPatientId,
}: { orgId: string; patients: PatientChoice[]; suggestedPatientId?: string }) {
  const [patientId, setPatientId] = useState(suggestedPatientId ?? patients[0]?.patientId ?? '');
  const currentPatientRef = useRef(patientId);
  currentPatientRef.current = patientId;
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [alerts, setAlerts] = useState<CaregiverAssistanceAlert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastConfirmed, setLastConfirmed] = useState<number | null>(null);
  useEffect(() => {
    if (suggestedPatientId && patients.some(p => p.patientId === suggestedPatientId))
      setPatientId(suggestedPatientId);
  }, [suggestedPatientId, patients]);
  useEffect(() => { setAlerts([]); setLastConfirmed(null); setError(null); }, [patientId,orgId]);
  const refresh = useCallback(async () => {
    if (!patientId) return;
    const result = await getCaregiverAssistanceAlerts(orgId, patientId);
    if (currentPatientRef.current !== patientId) return;
    if (result.error) setError(result.error);
    else { setAlerts(result.data ?? []); setError(null); setLastConfirmed(Date.now()); }
  }, [orgId, patientId]);
  useEffect(() => {
    let active = true;
    const update = () => { if (active && document.visibilityState === 'visible') void refresh(); };
    void refresh();
    const timer = window.setInterval(update, 30_000);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
    };
  }, [refresh]);
  const submit = async () => {
    if (!patientId || reason.trim().length < 10 || sending) return;
    setSending(true); setError(null);
    try {
      const result = await openCaregiverAssistanceAlert(orgId, patientId, reason);
      if (result.error) { setError(result.error); return; }
      setReason(''); setOpen(false);
      await refresh();
    } finally { setSending(false); }
  };
  if (!patients.length) return null;
  const unresolved = alerts.filter(a => a.patient_id === patientId && a.status !== 'resolved');
  return <div className="mt-3 space-y-2 rounded-xl border border-ent-line bg-ent-pale p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <LifeBuoy size={19} className="text-ent-rust" aria-hidden="true" />
        <strong className="text-sm text-ent-ink">Need help from your Director?</strong>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger className="min-h-10 rounded-lg bg-ent-rust px-3 py-2 text-sm font-semibold text-white">
          Request assistance
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>Request Director assistance</DialogTitle>
          <DialogDescription>
            This records a request for your office Director. It is not an emergency dispatch service.
            For immediate danger, follow your organization's emergency protocol and call emergency services.
          </DialogDescription>
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-ent-ink">Affected patient
              <select value={patientId} onChange={e => setPatientId(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-ent-line bg-white p-2">
                {patients.map(p => <option key={p.patientId} value={p.patientId}>{p.name}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold text-ent-ink">
              What help is needed?
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4}
                className="mt-1 block w-full rounded-lg border border-ent-line bg-white p-2"
                maxLength={2000} placeholder="Describe the situation and the assistance needed (minimum 10 characters)." />
            </label>
            {error && <p role="alert" className="text-sm text-ent-rust">{error}</p>}
            <button type="button" onClick={() => { void submit(); }} disabled={sending || reason.trim().length < 10}
              className="w-full rounded-lg bg-ent-rust px-3 py-2 font-semibold text-white disabled:opacity-50">
              {sending ? 'Recording request…' : 'Send assistance request to Director'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    {error && !open && <p role="alert" className="text-xs text-ent-rust">Assistance status could not be verified: {error}</p>}
    {unresolved.length > 0 ? <ul className="space-y-1">
      {unresolved.slice(0, 3).map(a => <li key={a.id} className="text-xs text-ent-ink">
        <AlertTriangle size={13} className="mr-1 inline text-ent-rust" aria-hidden="true" />
        Request from {new Date(a.created_at).toLocaleString()} · <strong>{a.status.replaceAll('_',' ')}</strong>
        {a.status === 'open' && ' · Director acknowledgment pending'}
        {a.status === 'in_contact' && ' · Director contact recorded'}
      </li>)}
    </ul> : lastConfirmed ? <p className="text-xs text-ent-muted">No open assistance requests for the selected patient.</p>
      : <p className="text-xs text-ent-muted">Checking assistance status…</p>}
  </div>;
}
