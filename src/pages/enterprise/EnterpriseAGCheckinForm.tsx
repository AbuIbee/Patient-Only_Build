import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { AG_DROPDOWN_GROUPS, normalizeAGValues } from './enterpriseAGOptions';

// A–G CHECK-IN EDITOR — authentic caregiver-authored, per-patient observation.
// Every domain opens its existing structured selectable choices. This is
// NOT a clinician diagnosis, medication order, or historical backfill.
export default function EnterpriseAGCheckinForm({
  patientId, onSaved,
}: { patientId: string; onSaved: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (key: string, value: string) => setValues(v=>({ ...v, [key]: value }));
  const fieldClass = 'w-full min-w-0 rounded-xl border border-soft-taupe bg-white px-3 py-2 text-sm text-charcoal focus-visible:ring-2 focus-visible:ring-warm-bronze';
  const submit = async () => {
    if (saving) return;
    const selected = normalizeAGValues(values);
    if (Object.keys(selected).length === 0) {
      toast.error('Choose at least one A–G observation before saving.');
      return;
    }
    setSaving(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) { toast.error('Sign in again before entering an observation.'); return; }
      // Staff write permission is enforced by PostgreSQL RLS, not by this
      // component. This API never accepts arbitrary submitted_by identity.
      const { error } = await supabase.from('care_partner_checkins').insert({
        patient_id: patientId,
        submitted_by: user.id,
        submitted_by_name: 'Haneen Caregiver',
        check_in_date: new Date().toISOString().slice(0, 10),
        ...selected,
      });
      if (error) { toast.error('A–G check-in was not saved: ' + error.message); return; }
      setValues({});
      toast.success('A–G check-in saved to this patient’s record.');
      onSaved();
    } catch {
      toast.error('A–G check-in could not be saved. No entry has been confirmed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label="Record A through G patient observations"
      className="rounded-2xl border border-ent-line bg-ent-panel p-4 sm:p-5 space-y-3">
      <div>
        <h3 className="font-bold text-ent-ink">Record Today’s A–G Observations</h3>
        <p className="text-sm text-ent-muted">
          Expand each category to choose the applicable options. Save your
          observations to the patient’s history; leave unknown items unanswered.
          These are caregiver observations, not clinical diagnoses.
        </p>
      </div>
      {AG_DROPDOWN_GROUPS.map(group => (
        <details key={group.code} className="rounded-xl border border-ent-line bg-white group">
          <summary className="cursor-pointer p-3 sm:p-4 font-semibold text-ent-ink
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-ent-bronze">
            {group.code} — {group.title}
            <span aria-hidden="true" className="float-right text-ent-bronze group-open:rotate-180">▾</span>
          </summary>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-ent-line p-3 sm:p-4">
            {group.fields.map(field => (
              <label key={field.key} className="block text-sm font-medium text-ent-ink space-y-1">
                <span>{field.label}</span>
                <select className={fieldClass} value={values[field.key]??''}
                  onChange={e => set(field.key,e.target.value)}>
                  <option value="">Choose an option…</option>
                  {field.options.map(option=><option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            ))}
            {group.code==='D' && ['Fall — no injury','Fall — injury'].includes(values.sa_falls??'') && (
              <label className="block sm:col-span-2 text-sm font-medium text-ent-ink space-y-1">
                <span>Fall / Injury details</span>
                <textarea className={fieldClass} rows={2} maxLength={1000}
                  value={values.sa_injury_details??''}
                  onChange={e=>set('sa_injury_details',e.target.value)} />
              </label>
            )}
            {group.code==='G' && (
              <label className="block sm:col-span-2 text-sm font-medium text-ent-ink space-y-1">
                <span>Other symptoms (observation only)</span>
                <textarea className={fieldClass} rows={2} maxLength={1000}
                  value={values.sy_other??''} onChange={e=>set('sy_other',e.target.value)} />
              </label>
            )}
            <label className="block sm:col-span-2 text-sm font-medium text-ent-ink space-y-1">
              <span>{group.title} — Additional observations</span>
              <textarea className={fieldClass} rows={2} maxLength={1000}
                value={values[group.commentKey]??''}
                onChange={e=>set(group.commentKey,e.target.value)}
                placeholder="Optional factual observations…" />
            </label>
          </div>
        </details>
      ))}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <button type="button" disabled={saving}
          onClick={()=>{ void submit(); }}
          className="rounded-xl bg-warm-bronze px-5 py-3 text-white font-semibold text-sm disabled:opacity-50">
          {saving?'Saving check-in…':'Save A–G Check-In'}
        </button>
        <p className="text-xs text-ent-muted" role="status">
          Only an authorized assigned caregiver can save observations. Each entry is attributed to the signed-in account.
        </p>
      </div>
    </section>
  );
}
