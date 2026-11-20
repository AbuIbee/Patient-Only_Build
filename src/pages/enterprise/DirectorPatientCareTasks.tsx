import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { OfficeCard } from './EnterpriseOfficeShell';

type Task = { id: string; title: string; description: string | null; status: string | null };
const statusLabels: Record<string, string> = {
  pending: 'Not completed', completed: 'Completed', skipped: 'Declined', not_applicable: 'Not applicable',
};
const inputClass = 'mt-1 block w-full rounded-xl border border-ent-line bg-white px-3 py-2 font-normal';

export default function DirectorPatientCareTasks({ orgId, patientId }: { orgId: string; patientId: string }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [pending, setPending] = useState(false);
  const [taskId, setTaskId] = useState(() => crypto.randomUUID());

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const { data, error } = await supabase.from('tasks').select('id,title,description,status')
        .eq('organization_id', orgId).eq('patient_id', patientId).eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) { setLoadError('Care tasks could not be loaded.'); return; }
      setTasks(data ?? []);
    } catch {
      setLoadError('Care tasks could not be loaded.');
    }
  }, [orgId, patientId]);
  useEffect(() => { void load(); }, [load]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || pending) return;
    setPending(true);
    setSaveError(null);
    setConfirmation('');
    try {
      const { error } = await supabase.rpc('hcn_director_add_patient_care_task', {
        p_organization_id: orgId, p_patient_id: patientId, p_task_id: taskId,
        p_title: title, p_description: instructions,
      });
      if (error) { setSaveError(error.message); return; }
      setTitle('');
      setInstructions('');
      setTaskId(crypto.randomUUID());
      setConfirmation('Care task added for assigned caregivers.');
      await load();
    } catch {
      setSaveError('The save could not be confirmed. Retry to finish adding this task.');
    } finally {
      setPending(false);
    }
  };

  return (
    <OfficeCard>
      <section aria-label="Patient care tasks" className="space-y-3">
        <h2 className="font-bold text-ent-ink">Patient care tasks</h2>
        <p className="text-sm text-ent-muted">Tasks added here are visible to caregivers assigned to this patient. Caregivers record the outcome after providing care.</p>
        <form onSubmit={event => { void save(event); }} className="space-y-3">
          <label className="block text-sm font-semibold text-ent-ink">
            Task title
            <input required maxLength={120} className={inputClass} value={title} disabled={pending}
              onChange={event => { setTitle(event.target.value); setTaskId(crypto.randomUUID()); }} />
          </label>
          <label className="block text-sm font-semibold text-ent-ink">
            Instructions (optional)
            <textarea maxLength={1000} rows={2} className={inputClass} value={instructions} disabled={pending}
              onChange={event => { setInstructions(event.target.value); setTaskId(crypto.randomUUID()); }} />
          </label>
          <button type="submit" disabled={pending || !title.trim()}
            className="min-h-11 rounded-xl bg-ent-forest px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {pending ? 'Adding…' : 'Add care task'}
          </button>
          {saveError && <p role="alert" className="text-sm text-ent-rust">{saveError}</p>}
          {confirmation && <p role="status" className="text-sm text-ent-forest">{confirmation}</p>}
        </form>
        {loadError && <p role="alert" className="text-sm text-ent-rust">{loadError} <button type="button" onClick={() => { void load(); }} className="font-semibold underline">Retry</button></p>}
        {!loadError && !tasks && <p role="status" className="text-sm text-ent-muted">Loading care tasks…</p>}
        {!loadError && tasks?.length === 0 && <p className="text-sm text-ent-muted">No active tasks have been added for this patient.</p>}
        {tasks && tasks.length > 0 && <ul className="space-y-2">
          {tasks.map(task => (
            <li key={task.id} className="rounded-xl border border-ent-line bg-ent-pale p-3 text-sm">
              <p className="font-semibold text-ent-ink">{task.title}</p>
              {task.description && <p className="whitespace-pre-wrap break-words text-ent-text">{task.description}</p>}
              <p className="text-ent-muted">{statusLabels[task.status ?? 'pending']}</p>
            </li>
          ))}
        </ul>}
      </section>
    </OfficeCard>
  );
}
