import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/store/AppContext';
import { FileText, CalendarDays, CalendarRange, Calendar } from 'lucide-react';

type LogRow = {
  id: string;
  patient_id: string;
  report_date: string;
  submitted_at: string;
  mood: string | null;
  meals: string | null;
  hydration: string | null;
  medications: string | null;
  mobility: string | null;
  exercise: string | null;
  sleep_quality: string | null;
  pain_level: number | null;
  notes: string | null;
  answers: Record<string, unknown> | null;
};

type FilterMode = 'day' | 'week' | 'month';

function getWeekStart(dateString: string) {
  const date = new Date(dateString + 'T12:00:00');
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

function getMonthKey(dateString: string) {
  return dateString.slice(0, 7);
}

export default function PatientDocuments() {
  const { state } = useApp();
  const patientId = state.currentUser?.id || state.patient?.id || '';

  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<FilterMode>('day');

  useEffect(() => {
    if (!patientId) return;
    loadLogs();
  }, [patientId]);

  const loadLogs = async () => {
    setLoading(true);

    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const cutoffDate = cutoff.toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from('care_partner_logs')
        .select('*')
        .eq('patient_id', patientId)
        .gte('report_date', cutoffDate)
        .order('report_date', { ascending: false });

      if (error) {
        console.error(error);
        setLogs([]);
        return;
      }

      setLogs((data || []) as LogRow[]);
    } finally {
      setLoading(false);
    }
  };

  const groupedLogs = useMemo(() => {
    if (filterMode === 'day') {
      const groups: Record<string, LogRow[]> = {};
      logs.forEach((log) => {
        if (!groups[log.report_date]) groups[log.report_date] = [];
        groups[log.report_date].push(log);
      });
      return Object.entries(groups);
    }

    if (filterMode === 'week') {
      const groups: Record<string, LogRow[]> = {};
      logs.forEach((log) => {
        const key = getWeekStart(log.report_date);
        if (!groups[key]) groups[key] = [];
        groups[key].push(log);
      });
      return Object.entries(groups);
    }

    const groups: Record<string, LogRow[]> = {};
    logs.forEach((log) => {
      const key = getMonthKey(log.report_date);
      if (!groups[key]) groups[key] = [];
      groups[key].push(log);
    });
    return Object.entries(groups);
  }, [logs, filterMode]);

  const filterButtons = [
    { id: 'day' as FilterMode, label: 'Day', icon: CalendarDays },
    { id: 'week' as FilterMode, label: 'Week', icon: CalendarRange },
    { id: 'month' as FilterMode, label: 'Month', icon: Calendar },
  ];

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      <div className="rounded-3xl bg-white shadow-card overflow-hidden">
        <div className="border-b border-soft-taupe px-6 py-5 sm:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-warm-bronze/10 flex items-center justify-center">
                <FileText className="w-6 h-6 text-warm-bronze" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-charcoal">Papers</h1>
                <p className="text-medium-gray text-sm">
                  Care partner logs saved from the last 30 days
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {filterButtons.map((button) => {
                const Icon = button.icon;
                const active = filterMode === button.id;
                return (
                  <button
                    key={button.id}
                    onClick={() => setFilterMode(button.id)}
                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                      active
                        ? 'bg-warm-bronze text-white'
                        : 'bg-soft-taupe/40 text-charcoal hover:bg-soft-taupe'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {button.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-6 py-6 sm:px-8">
          {loading ? (
            <p className="text-medium-gray">Loading saved care partner logs...</p>
          ) : logs.length === 0 ? (
            <div className="rounded-2xl bg-warm-ivory p-6 text-medium-gray">
              No saved care partner logs yet. Submit one from the Care Partner page.
            </div>
          ) : (
            <div className="space-y-6">
              {groupedLogs.map(([groupKey, items]) => (
                <section key={groupKey} className="rounded-2xl border border-soft-taupe overflow-hidden">
                  <div className="bg-soft-taupe/25 px-5 py-4 border-b border-soft-taupe">
                    <h2 className="text-lg font-bold text-charcoal">
                      {filterMode === 'day' && `Day: ${new Date(groupKey).toLocaleDateString()}`}
                      {filterMode === 'week' && `Week Starting: ${new Date(groupKey).toLocaleDateString()}`}
                      {filterMode === 'month' &&
                        `Month: ${new Date(groupKey + '-01').toLocaleDateString(undefined, {
                          month: 'long',
                          year: 'numeric',
                        })}`}
                    </h2>
                    <p className="text-sm text-medium-gray">
                      {items.length} saved log{items.length !== 1 ? 's' : ''}
                    </p>
                  </div>

                  <div className="divide-y divide-soft-taupe">
                    {items.map((log) => (
                      <div key={log.id} className="p-5 space-y-4 bg-white">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-semibold text-charcoal">
                              Report Date: {new Date(log.report_date).toLocaleDateString()}
                            </p>
                            <p className="text-sm text-medium-gray">
                              Submitted: {new Date(log.submitted_at).toLocaleString()}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                          <InfoCard label="Mood" value={log.mood} />
                          <InfoCard label="Meals" value={log.meals} />
                          <InfoCard label="Hydration" value={log.hydration} />
                          <InfoCard label="Medications" value={log.medications} />
                          <InfoCard label="Mobility" value={log.mobility} />
                          <InfoCard label="Exercise" value={log.exercise} />
                          <InfoCard label="Sleep Quality" value={log.sleep_quality} />
                          <InfoCard
                            label="Pain Level"
                            value={log.pain_level === null ? '' : String(log.pain_level)}
                          />
                        </div>

                        <div className="rounded-2xl bg-warm-ivory p-4">
                          <p className="text-sm font-semibold text-charcoal mb-2">Notes</p>
                          <p className="text-sm text-medium-gray whitespace-pre-wrap">
                            {log.notes?.trim() || 'No notes entered.'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-2xl border border-soft-taupe bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-medium-gray mb-1">{label}</p>
      <p className="text-sm font-semibold text-charcoal">{value || '—'}</p>
    </div>
  );
}