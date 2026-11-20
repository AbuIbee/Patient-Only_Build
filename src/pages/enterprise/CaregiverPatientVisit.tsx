import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { endCaregiverVisit, getMyVisitsResult, getPatientShiftHandoffsResult, startCaregiverVisit, type CaregiverVisit } from '@/services/enterpriseCaregiverWorkToolsService';
import { acknowledgePrevisit, PREVISIT_SECTIONS } from '@/services/hcnCareOperationsService';

const CHECKOUT_ITEMS = [
  { id: 'medication', label: 'Medication taken', complete: 'Taken' },
  { id: 'bloodPressure', label: 'Blood pressure checked', complete: 'Checked' },
  { id: 'meal', label: 'Meal eaten', complete: 'Eaten' },
] as const;

type CheckoutItemId = (typeof CHECKOUT_ITEMS)[number]['id'];
type Outcome = 'completed' | 'not_completed' | 'not_applicable';
type CheckoutOutcomes = Partial<Record<CheckoutItemId, Outcome>>;

const CHECK_IN_EARLY_MINUTES = 30;

const actionClass = 'min-h-11 rounded-xl bg-ent-forest px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
const secondaryClass = 'min-h-11 rounded-xl border border-ent-line px-4 py-2 text-sm font-semibold text-ent-ink disabled:opacity-50';

export default function CaregiverPatientVisit({ organizationId, patientId, visitId }: {
  organizationId: string; patientId: string; visitId: string;
}) {
  const [visit, setVisit] = useState<CaregiverVisit | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [departure, setDeparture] = useState('');
  const [outcomes, setOutcomes] = useState<CheckoutOutcomes>({});

  useEffect(() => {
    let active = true;
    void getMyVisitsResult(patientId).then(result => {
      if (!active) return;
      const match = result.data?.find(row => row.id === visitId && row.patientId === patientId && row.organizationId === organizationId);
      setVisit(match ?? null);
      setError(result.error ?? (match ? null : 'This visit is unavailable for this patient in the selected office.'));
    }).catch(() => {
      if (active) setError('Could not load this visit.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [organizationId, patientId, visitId, loadAttempt]);

  const checkIn = async () => {
    if (!visit || visit.status !== 'scheduled' || pending) return;
    setPending(true);
    setError(null);
    try {
      const receipt = await acknowledgePrevisit(visit.id, PREVISIT_SECTIONS.map(section => section.id));
      if (receipt.error) { setError(receipt.error); return; }
      const result = await startCaregiverVisit(visit.id);
      if (!result.visit) { setError(result.error ?? 'Could not check in.'); return; }
      setVisit(result.visit);
    } catch {
      setError('Could not confirm check-in. Reopen the visit to check its status.');
    } finally {
      setPending(false);
    }
  };

  const checkInOpens = visit?.scheduledStart
    ? new Date(Date.parse(visit.scheduledStart) - CHECK_IN_EARLY_MINUTES * 60_000)
    : null;
  const departureDate = new Date(departure);
  const canSubmit = Number.isFinite(departureDate.getTime()) && notes.trim().length > 0
    && CHECKOUT_ITEMS.every(item => outcomes[item.id]);
  const checkOut = async () => {
    if (!visit || visit.status !== 'in_progress' || !canSubmit || pending) return;
    setPending(true);
    setError(null);
    try {
      const checklist = {
        medication: outcomes.medication!,
        bloodPressure: outcomes.bloodPressure!,
        meal: outcomes.meal!,
      };
      const result = await endCaregiverVisit(visit.id, notes.trim(), departureDate.toISOString(), checklist);
      if (!result.visit) { setError(result.error ?? 'Could not check out.'); return; }
      setVisit(result.visit);
      setCheckoutOpen(false);
      setNotes('');
      setDeparture('');
      setOutcomes({});
    } catch {
      setError('Could not confirm checkout. Your entries are still here. Recheck the visit status if the save already went through.');
    } finally {
      setPending(false);
    }
  };

  return (
    <section aria-label="Patient visit" className="space-y-3 rounded-2xl border border-ent-line bg-ent-panel p-4 sm:p-5">
      <h2 className="flex items-center gap-2 font-bold text-ent-ink"><Clock aria-hidden="true" className="size-5 text-ent-bronze" /> Patient visit</h2>
      {loading && <p role="status" className="flex items-center gap-2 text-sm text-ent-muted"><Loader2 className="size-4 animate-spin" /> Loading visit…</p>}
      {error && <p role="alert" className="text-sm text-ent-rust">{error}</p>}
      {!loading && !visit && (
        <button type="button" className={secondaryClass} onClick={() => {
          setLoading(true);
          setError(null);
          setLoadAttempt(attempt => attempt + 1);
        }}>Reload visit</button>
      )}
      {visit && (
        <>
          <p className="text-sm text-ent-muted">
            Scheduled: {visit.scheduledStart ? new Date(visit.scheduledStart).toLocaleString() : 'Time pending'}
            {visit.scheduledEnd && ` – ${new Date(visit.scheduledEnd).toLocaleString()}`}
          </p>
          {visit.status === 'scheduled' && (
            <div className="space-y-2">
              <p className="text-sm text-ent-text">Before checking in, review the patient’s recent updates, care plan, medications, contacts and handoff in this chart.</p>
              {checkInOpens && <p className="text-sm text-ent-muted">Check-in opens {checkInOpens.toLocaleString()}.</p>}
              <button type="button" className={actionClass} disabled={pending} onClick={() => { void checkIn(); }}>
                {pending ? 'Checking in…' : 'Confirm Review & Check In'}
              </button>
            </div>
          )}
          {visit.actualStart && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p role="status" className="text-sm font-semibold text-ent-forest">Checked in: {new Date(visit.actualStart).toLocaleString()}</p>
              {visit.status === 'in_progress' && !checkoutOpen && (
                <button type="button" className={actionClass} onClick={() => setCheckoutOpen(true)}>Check Out</button>
              )}
            </div>
          )}
          {visit.status === 'in_progress' && checkoutOpen && (
            <form className="space-y-4" onSubmit={event => { event.preventDefault(); void checkOut(); }}>
              <label className="block space-y-1 text-sm font-semibold text-ent-ink">
                <span>Actual departure date and time (required)</span>
                <input type="datetime-local" step="60" required disabled={pending} value={departure}
                  onChange={event => setDeparture(event.target.value)}
                  className="block min-h-11 w-full min-w-0 rounded-xl border border-ent-line bg-white px-3 py-2 font-normal" />
                <span className="block font-normal text-ent-muted">
                  Local time ({Intl.DateTimeFormat().resolvedOptions().timeZone})
                </span>
              </label>
              <fieldset disabled={pending} className="space-y-2">
                <legend className="mb-1 font-semibold text-ent-ink">Visit checklist</legend>
                {CHECKOUT_ITEMS.map(item => (
                  <label key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-ent-ink">
                    <span>{item.label}</span>
                    <select required value={outcomes[item.id] ?? ''}
                      className="min-h-11 rounded-lg border border-ent-line bg-white px-3 py-2"
                      onChange={event => setOutcomes(previous => ({ ...previous, [item.id]: event.target.value }))}>
                      <option value="" disabled>Select outcome</option>
                      <option value="completed">{item.complete}</option>
                      <option value="not_completed">Not done</option>
                      <option value="not_applicable">Not applicable</option>
                    </select>
                  </label>
                ))}
              </fieldset>
              <label className="block space-y-1 text-sm font-semibold text-ent-ink">
                <span>Visit notes (required)</span>
                <textarea required disabled={pending} value={notes} onChange={event => setNotes(event.target.value)} rows={3}
                  placeholder="Care provided, why any applicable task was missed, and follow-up needed."
                  className="block w-full rounded-xl border border-ent-line bg-white px-3 py-2 font-normal" />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className={actionClass} disabled={!canSubmit || pending}>{pending ? 'Saving visit…' : 'Submit & Check Out'}</button>
                <button type="button" className={secondaryClass} disabled={pending} onClick={() => setCheckoutOpen(false)}>Cancel</button>
              </div>
            </form>
          )}
          {visit.actualEnd && (
            <div role="status" className="space-y-1 text-sm text-ent-text">
              <p className="flex items-center gap-2 font-semibold text-ent-forest"><CheckCircle2 aria-hidden="true" className="size-4" /> Checked out: {new Date(visit.actualEnd).toLocaleString()}</p>
              {visit.visitNotes && <p className="whitespace-pre-wrap break-words">{visit.visitNotes}</p>}
            </div>
          )}
          {(visit.status === 'missed' || visit.status === 'canceled') && <p className="text-sm text-ent-muted capitalize">{visit.status}</p>}
        </>
      )}
      {visit && visit.status !== 'completed' && <RecentVisitUpdates organizationId={organizationId} patientId={patientId} visitId={visitId} />}
    </section>
  );
}

function RecentVisitUpdates({ organizationId, patientId, visitId }: {
  organizationId: string; patientId: string; visitId: string;
}) {
  const [notes, setNotes] = useState<{ id: string; note: string; created_at: string }[]>([]);
  const [lastVisit, setLastVisit] = useState<{ actual_end: string | null; visit_notes: string | null } | null>(null);
  const [handoff, setHandoff] = useState<{ summary: string; createdAt: string } | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let current = true;
    void Promise.all([
      supabase.from('patient_notes').select('id, note, created_at').eq('patient_id', patientId)
        .neq('note_type', 'care_partner_personal').order('created_at', { ascending: false }).limit(3),
      getPatientShiftHandoffsResult(organizationId, patientId),
      supabase.from('caregiver_visits').select('actual_end, visit_notes').eq('organization_id', organizationId)
        .eq('patient_id', patientId).eq('status', 'completed').neq('id', visitId)
        .not('actual_end', 'is', null).not('visit_notes', 'is', null)
        .order('actual_end', { ascending: false }).limit(1),
    ]).then(([noteResult, handoffResult, visitResult]) => {
      if (!current) return;
      setNotes(noteResult.data ?? []);
      setHandoff(handoffResult.data?.[0] ?? null);
      setLastVisit(visitResult.data?.[0] ?? null);
      setLoadState(noteResult.error || handoffResult.error || visitResult.error ? 'error' : 'ready');
    }).catch(() => { if (current) setLoadState('error'); });
    return () => { current = false; };
  }, [organizationId, patientId, visitId]);

  return (
    <section aria-label="Recent notes and handoff" className="space-y-2 border-t border-ent-line pt-3">
      <h3 className="font-semibold text-ent-ink">Recent notes and handoff</h3>
      {loadState === 'loading' && <p role="status" className="text-sm text-ent-muted">Loading recent notes and handoff…</p>}
      {loadState === 'error' && <p role="alert" className="text-sm text-ent-rust">Some recent notes or handoffs could not be loaded. Refresh to try again.</p>}
      {loadState === 'ready' && !notes.length && !handoff && !lastVisit && <p className="text-sm text-ent-muted">No recent notes or handoff have been recorded.</p>}
      {handoff && <div className="rounded-xl bg-ent-pale p-3 text-sm text-ent-text">
        <p className="font-semibold text-ent-ink">Latest shift handoff</p>
        <p className="whitespace-pre-wrap break-words">{handoff.summary}</p>
        <time dateTime={handoff.createdAt} className="text-xs text-ent-muted">{new Date(handoff.createdAt).toLocaleString()}</time>
      </div>}
      {notes.length > 0 && <ul className="space-y-2">
        {notes.map(note => <li key={note.id} className="rounded-xl bg-ent-pale p-3 text-sm text-ent-text">
          <p className="whitespace-pre-wrap break-words">{note.note}</p>
          <time dateTime={note.created_at} className="text-xs text-ent-muted">{new Date(note.created_at).toLocaleString()}</time>
        </li>)}
      </ul>}
      {lastVisit?.actual_end && <details className="rounded-xl bg-ent-pale p-3 text-sm text-ent-text">
        <summary className="cursor-pointer font-semibold text-ent-ink">Latest completed visit notes · {new Date(lastVisit.actual_end).toLocaleDateString()}</summary>
        <p className="mt-2 whitespace-pre-wrap break-words">{lastVisit.visit_notes}</p>
      </details>}
    </section>
  );
}
