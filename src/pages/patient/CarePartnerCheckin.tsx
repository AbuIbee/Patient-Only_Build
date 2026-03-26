import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/store/AppContext';
import { toast } from 'sonner';
import { ClipboardList, Save, CheckCircle2 } from 'lucide-react';

type FormState = {
  mood: string;
  meals: string;
  hydration: string;
  medications: string;
  mobility: string;
  exercise: string;
  sleep_quality: string;
  pain_level: number;
  notes: string;
};

const todayDateString = () => new Date().toISOString().slice(0, 10);

const defaultForm: FormState = {
  mood: '',
  meals: '',
  hydration: '',
  medications: '',
  mobility: '',
  exercise: '',
  sleep_quality: '',
  pain_level: 0,
  notes: '',
};

export default function CarePartnerCheckin() {
  const { state } = useApp();
  const patientId = state.currentUser?.id || state.patient?.id || '';
  const [form, setForm] = useState<FormState>(defaultForm);
  const [loading, setLoading] = useState(false);
  const [loadingToday, setLoadingToday] = useState(true);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const reportDate = useMemo(() => todayDateString(), []);

  useEffect(() => {
    if (!patientId) return;
    loadTodaysEntry();
  }, [patientId]);

  const loadTodaysEntry = async () => {
    setLoadingToday(true);

    try {
      const { data, error } = await supabase
        .from('care_partner_logs')
        .select('*')
        .eq('patient_id', patientId)
        .eq('report_date', reportDate)
        .maybeSingle();

      if (error) {
        console.error('Error loading today check-in:', error);
        return;
      }

      if (data) {
        setForm({
          mood: data.mood || '',
          meals: data.meals || '',
          hydration: data.hydration || '',
          medications: data.medications || '',
          mobility: data.mobility || '',
          exercise: data.exercise || '',
          sleep_quality: data.sleep_quality || '',
          pain_level: data.pain_level || 0,
          notes: data.notes || '',
        });
        setSavedAt(data.submitted_at || data.updated_at || null);
      }
    } finally {
      setLoadingToday(false);
    }
  };

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const cleanupOldLogs = async () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffDate = cutoff.toISOString().slice(0, 10);

    await supabase
      .from('care_partner_logs')
      .delete()
      .eq('patient_id', patientId)
      .lt('report_date', cutoffDate);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!patientId) {
      toast.error('No patient account found.');
      return;
    }

    setLoading(true);

    try {
      await cleanupOldLogs();

      const payload = {
        patient_id: patientId,
        report_date: reportDate,
        submitted_at: new Date().toISOString(),
        mood: form.mood,
        meals: form.meals,
        hydration: form.hydration,
        medications: form.medications,
        mobility: form.mobility,
        exercise: form.exercise,
        sleep_quality: form.sleep_quality,
        pain_level: form.pain_level,
        notes: form.notes,
        answers: form,
      };

      const { data, error } = await supabase
        .from('care_partner_logs')
        .upsert(payload, { onConflict: 'patient_id,report_date' })
        .select()
        .single();

      if (error) {
        console.error(error);
        toast.error('Unable to save today’s check-in.');
        return;
      }

      setSavedAt(data?.submitted_at || new Date().toISOString());
      toast.success('Today’s care partner check-in was saved under Papers.');
    } catch (err) {
      console.error(err);
      toast.error('Something went wrong while saving the check-in.');
    } finally {
      setLoading(false);
    }
  };

  const SelectCard = ({
    label,
    value,
    options,
    field,
  }: {
    label: string;
    value: string;
    options: string[];
    field: keyof FormState;
  }) => (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-charcoal">{label}</label>
      <select
        value={value}
        onChange={(e) => updateField(field, e.target.value as never)}
        className="w-full h-12 rounded-xl border border-soft-taupe bg-white px-3 text-charcoal focus:outline-none focus:ring-2 focus:ring-warm-bronze/30"
      >
        <option value="">Select</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );

  if (loadingToday) {
    return (
      <div className="rounded-3xl bg-white shadow-card p-6 sm:p-8">
        <p className="text-medium-gray">Loading today&apos;s care partner check-in...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="rounded-3xl bg-white shadow-card overflow-hidden">
        <div className="border-b border-soft-taupe px-6 py-5 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-warm-bronze/10 flex items-center justify-center">
              <ClipboardList className="w-6 h-6 text-warm-bronze" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-charcoal">Care Partner Log</h1>
              <p className="text-medium-gray text-sm">
                Submit today&apos;s answers. They will be saved under Papers for 1 month.
              </p>
            </div>
          </div>

          {savedAt && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-soft-sage/10 px-3 py-2 text-sm text-soft-sage">
              <CheckCircle2 className="w-4 h-4" />
              Saved for today: {new Date(savedAt).toLocaleString()}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-6 sm:px-8 sm:py-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <SelectCard
              label="Mood"
              value={form.mood}
              field="mood"
              options={['Excellent', 'Good', 'Calm', 'Anxious', 'Sad', 'Confused', 'Agitated']}
            />

            <SelectCard
              label="Meals"
              value={form.meals}
              field="meals"
              options={['All meals completed', 'Most meals completed', 'Some meals completed', 'Poor intake']}
            />

            <SelectCard
              label="Hydration"
              value={form.hydration}
              field="hydration"
              options={['Excellent', 'Good', 'Fair', 'Low']}
            />

            <SelectCard
              label="Medications"
              value={form.medications}
              field="medications"
              options={['All taken', 'Most taken', 'Some missed', 'Refused']}
            />

            <SelectCard
              label="Mobility"
              value={form.mobility}
              field="mobility"
              options={['Independent', 'Needs supervision', 'Needs assistance', 'Limited today']}
            />

            <SelectCard
              label="Exercise / Activity"
              value={form.exercise}
              field="exercise"
              options={['Completed', 'Partially completed', 'Very little', 'None today']}
            />

            <SelectCard
              label="Sleep Quality"
              value={form.sleep_quality}
              field="sleep_quality"
              options={['Excellent', 'Good', 'Fair', 'Poor']}
            />

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-charcoal">
                Pain Level (0 to 10)
              </label>
              <input
                type="number"
                min={0}
                max={10}
                value={form.pain_level}
                onChange={(e) => updateField('pain_level', Number(e.target.value))}
                className="w-full h-12 rounded-xl border border-soft-taupe bg-white px-3 text-charcoal focus:outline-none focus:ring-2 focus:ring-warm-bronze/30"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-charcoal">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              rows={6}
              placeholder="Add any important details from today..."
              className="w-full rounded-2xl border border-soft-taupe bg-white px-4 py-3 text-charcoal focus:outline-none focus:ring-2 focus:ring-warm-bronze/30 resize-y"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-2xl bg-warm-bronze px-5 py-3 text-white font-semibold hover:bg-deep-bronze transition-colors disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              {loading ? 'Saving...' : 'Submit Today’s Check-In'}
            </button>

            <span className="text-sm text-medium-gray">
              Date: {new Date(reportDate).toLocaleDateString()}
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}