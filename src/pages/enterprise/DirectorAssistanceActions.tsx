import { useState } from 'react';
import { AlertTriangle, ChevronRight, Mail, Phone } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  directorActionAssistance, type CaregiverAssistanceAlert,
} from '@/services/hcnDirectorSafetyService';

type ContactMethod = 'phone' | 'secure_message' | 'in_person';

export default function DirectorAssistanceActions({ alert, caregiverName, caregiverEmail, patientName,
  onUpdated, onOpenCommunications }: {
  alert: CaregiverAssistanceAlert;
  caregiverName: string;
  caregiverEmail: string | null;
  patientName: string;
  onUpdated: () => void;
  onOpenCommunications: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [method, setMethod] = useState<ContactMethod>('secure_message');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const action = async (next: 'acknowledge' | 'contact' | 'resolve') => {
    if (saving) return;
    setSaving(true); setError(null);
    try {
      const result = await directorActionAssistance(alert.id, next, note, next === 'contact' ? method : undefined);
      if (result.error) { setError(result.error); return; }
      setNote('');
      setOpen(false);
      onUpdated();
    } finally { setSaving(false); }
  };
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger className="flex w-full items-start gap-3 rounded-lg border-l-4 border-red-700 bg-red-50 p-3 text-left hover:bg-red-100">
      <AlertTriangle size={19} className="mt-0.5 shrink-0 text-red-800" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-red-900">Caregiver needs assistance · {alert.status.replaceAll('_',' ')}</span>
        <span className="block text-xs text-ent-ink">{caregiverName} · {patientName}</span>
        <span className="block text-xs text-ent-muted">
          Requested {new Date(alert.created_at).toLocaleString()} · Immediate Director review
        </span>
      </span>
      <ChevronRight size={17} className="mt-1 shrink-0 text-red-800" aria-hidden="true" />
    </DialogTrigger>
    <DialogContent className="max-h-[90dvh] overflow-y-auto">
      <DialogTitle>Caregiver assistance — action required</DialogTitle>
      <DialogDescription>
        {caregiverName} · {patientName} · {new Date(alert.created_at).toLocaleString()}.
        This system is not emergency dispatch. Follow the office emergency protocol if anyone is in danger.
      </DialogDescription>
      <p className="whitespace-pre-wrap rounded-lg border border-ent-line bg-ent-bg p-3 text-sm">{alert.reason}</p>
      <p className="text-sm font-semibold">Current state: {alert.status.replaceAll('_',' ')}</p>
      {alert.acknowledged_at && <p className="text-xs text-ent-muted">Acknowledged {new Date(alert.acknowledged_at).toLocaleString()}</p>}
      {alert.contacted_at && <p className="text-xs text-ent-muted">Contact recorded {new Date(alert.contacted_at).toLocaleString()}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => { setOpen(false); onOpenCommunications(); }}
          className="rounded-lg border border-ent-line px-3 py-2 text-sm font-semibold">
          Open Secure Messages
        </button>
        {caregiverEmail && <a href={'mailto:' + encodeURIComponent(caregiverEmail)}
          className="inline-flex items-center gap-1 rounded-lg border border-ent-line px-3 py-2 text-sm font-semibold">
          <Mail size={15} aria-hidden="true" /> Email caregiver
        </a>}
        <span className="inline-flex items-center gap-1 text-xs text-ent-muted"><Phone size={14} aria-hidden="true" />
          Use verified staff contact information before recording a phone contact</span>
      </div>
      {alert.status === 'acknowledged' && <label className="block text-sm font-semibold">
        Contact method
        <select value={method} onChange={e => setMethod(e.target.value as ContactMethod)}
          className="mt-1 block w-full rounded-lg border border-ent-line bg-white p-2">
          <option value="secure_message">Secure message</option>
          <option value="phone">Phone</option>
          <option value="in_person">In person</option>
        </select>
      </label>}
      {alert.status !== 'open' && <label className="block text-sm font-semibold">
        {alert.status === 'acknowledged' ? 'Record the contact you actually made (at least 5 characters)' : 'Resolution notes (at least 10 characters)'}
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={2000}
          className="mt-1 block w-full rounded-lg border border-ent-line bg-white p-2"
          placeholder="Describe the action taken. Do not claim a message was delivered unless verified." />
      </label>}
      {error && <p role="alert" className="text-sm text-ent-rust">{error}</p>}
      {alert.status === 'open' && <button type="button" disabled={saving}
        className="w-full rounded-lg bg-ent-bronze px-3 py-2 font-semibold text-white disabled:opacity-50"
        onClick={() => { void action('acknowledge'); }}>
        {saving ? 'Recording…' : 'Acknowledge request'}
      </button>}
      {alert.status === 'acknowledged' && <button type="button" disabled={saving || note.trim().length < 5}
        className="w-full rounded-lg bg-ent-bronze px-3 py-2 font-semibold text-white disabled:opacity-50"
        onClick={() => { void action('contact'); }}>
        {saving ? 'Recording…' : 'Record contact with caregiver'}
      </button>}
      {alert.status === 'in_contact' && <button type="button" disabled={saving || note.trim().length < 10}
        className="w-full rounded-lg bg-ent-bronze px-3 py-2 font-semibold text-white disabled:opacity-50"
        onClick={() => { void action('resolve'); }}>
        {saving ? 'Recording…' : 'Resolve request with audit note'}
      </button>}
    </DialogContent>
  </Dialog>;
}
