import { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useApp } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Wind,
  Music,
  BookOpen,
  Sun,
  TrendingUp,
  Clock,
  Calendar,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Activity,
  Utensils,
  Droplets,
  Shield,
  Brain,
  Heart,
  ThumbsUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { format, isSameDay } from 'date-fns';
import type { MoodType } from '@/types';

// ── Mood definitions ──────────────────────────────────────────────────────────
const MOODS: { type: MoodType; emoji: string; label: string; bg: string; ring: string; dot: string }[] = [
  { type: 'happy',    emoji: '😊', label: 'Happy',    bg: 'bg-soft-sage/20',    ring: 'ring-soft-sage',    dot: 'bg-soft-sage'    },
  { type: 'calm',     emoji: '😌', label: 'Calm',     bg: 'bg-calm-blue/20',    ring: 'ring-calm-blue',    dot: 'bg-calm-blue'    },
  { type: 'sad',      emoji: '😢', label: 'Sad',      bg: 'bg-gray-100',        ring: 'ring-gray-300',     dot: 'bg-gray-400'     },
  { type: 'anxious',  emoji: '😰', label: 'Anxious',  bg: 'bg-gentle-coral/20', ring: 'ring-gentle-coral', dot: 'bg-gentle-coral' },
  { type: 'angry',    emoji: '😠', label: 'Angry',    bg: 'bg-red-100',         ring: 'ring-red-300',      dot: 'bg-red-400'      },
  { type: 'confused', emoji: '😕', label: 'Confused', bg: 'bg-yellow-100',      ring: 'ring-yellow-300',   dot: 'bg-yellow-400'   },
  { type: 'scared',   emoji: '😨', label: 'Scared',   bg: 'bg-purple-100',      ring: 'ring-purple-300',   dot: 'bg-purple-400'   },
];

const moodOf = (type: MoodType) => MOODS.find(m => m.type === type) ?? MOODS[0];

// ── Score mapping for Care Partner fields (5 levels: 0=worst, 4=best) ───────
const SCORE_MAP: Record<string, number> = {
  // Daily Function
  'Independent': 4, 'Needs cues': 3, 'Needs hands-on help': 2, 'Dependent': 1,
  'Needs help': 2, 'Refused': 1, 'Incontinent episode': 1, 'Supervision': 3,
  'Assist': 2, 'Unable': 1, 'Walker': 2, 'Wheelchair': 1, 'Bedbound': 0,
  'Took as directed': 4, 'Missed': 1, 'Refused (meds)': 1, 'Unknown': 2,

  // Nutrition
  'Normal': 4, 'Decreased': 2, 'Increased': 3, '0%': 0, '25%': 1, '50%': 2,
  '75%': 3, '100%': 4, 'Adequate': 4, 'Low': 2, 'No issues': 4,
  'Coughing/choking': 1, 'Pocketing food': 1, 'Needs soft diet': 2,

  // Continence
  'Continent': 4, 'Occasional accidents': 2, 'Frequent accidents': 1,
  'None (skin)': 4, 'Redness': 2, 'Rash': 1, 'Breakdown': 0,

  // Safety
  'None (falls)': 4, 'Near-fall': 3, 'Fall — no injury': 1, 'Fall — injury': 0,
  'None (wandering)': 4, 'Attempted': 2, 'Left home': 0,

  // Mood
  'Calm': 4, 'Anxious': 2, 'Depressed': 1, 'Irritable': 2, 'Elevated': 3, 'Labile': 1,
  'Normal (sleep)': 4, 'Slept too much': 2, 'Slept too little': 2, 'Day-night reversal': 0,
};

function getScore(value: string | null, defaultValue: number = 2): number {
  if (!value) return defaultValue;
  return SCORE_MAP[value] !== undefined ? SCORE_MAP[value] : defaultValue;
}

// ── Types for Care Partner Check-in data ──────────────────────────────────────
interface CheckInData {
  id: string;
  check_in_date: string;

  // A - Daily Function
  fn_dressing: string | null;
  fn_bathing: string | null;
  fn_toileting: string | null;
  fn_transfers: string | null;
  fn_mobility: string | null;
  fn_medication: string | null;

  // B - Nutrition
  nu_appetite: string | null;
  nu_meal_pct: string | null;
  nu_fluids: string | null;
  nu_swallowing: string | null;

  // C - Continence
  co_urinary: string | null;
  co_bowel: string | null;
  co_skin: string | null;

  // D - Safety
  sa_falls: string | null;
  sa_wandering: string | null;
  sa_safety_concerns: boolean;

  // E - Behavior
  be_behaviors: string[];

  // F - Mood & Social
  mo_mood: string | null;
  mo_sleep: string | null;

  // G - Symptoms
  sy_symptoms: string[];
}

type FilterKey = '7d' | '1m' | '2m' | '3m' | '6m' | '1y';

function startOfCurrentWeekSunday(): Date {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - d.getDay()); // Sunday = 0
  return d;
}

function startOfMonthOffset(monthsBack: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
}

function startOfCurrentYear(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), 0, 1);
}

function getRangeStart(filterKey: FilterKey): Date {
  switch (filterKey) {
    case '7d':
      return startOfCurrentWeekSunday();
    case '1m':
      return startOfMonthOffset(0);
    case '2m':
      return startOfMonthOffset(1);
    case '3m':
      return startOfMonthOffset(2);
    case '6m':
      return startOfMonthOffset(5);
    case '1y':
      return startOfCurrentYear();
    default:
      return startOfCurrentWeekSunday();
  }
}

function formatDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildCalendarDates(filterKey: FilterKey): string[] {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = getRangeStart(filterKey);

  const dates: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    dates.push(formatDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

// ── SectionCombinedGraph ──────────────────────────────────────────────────────
function SectionCombinedGraph({
  title,
  icon: Icon,
  color,
  metrics,
  allCheckIns,
  filterKey,
}: {
  title: string;
  icon: React.ElementType;
  color: string;
  metrics: { key: string; label: string; color: string }[];
  allCheckIns: CheckInData[];
  filterKey: FilterKey;
}) {
  const rangeStart = useMemo(() => getRangeStart(filterKey), [filterKey]);

  const sortedCheckIns = useMemo(
    () =>
      allCheckIns
        .filter(d => new Date(d.check_in_date + 'T00:00:00') >= rangeStart)
        .sort((a, b) => a.check_in_date.localeCompare(b.check_in_date)),
    [allCheckIns, rangeStart]
  );

  const getVal = (c: CheckInData, key: string): number | null => {
    switch (key) {
      case 'fn_dressing':   return c.fn_dressing ? getScore(c.fn_dressing) : null;
      case 'fn_bathing':    return c.fn_bathing ? getScore(c.fn_bathing) : null;
      case 'fn_toileting':  return c.fn_toileting ? getScore(c.fn_toileting) : null;
      case 'fn_transfers':  return c.fn_transfers ? getScore(c.fn_transfers) : null;
      case 'fn_mobility':   return c.fn_mobility ? getScore(c.fn_mobility) : null;
      case 'fn_medication': return c.fn_medication ? getScore(c.fn_medication) : null;
      case 'nu_appetite':   return c.nu_appetite ? getScore(c.nu_appetite) : null;
      case 'nu_meal_pct':   return c.nu_meal_pct ? getScore(c.nu_meal_pct) : null;
      case 'nu_fluids':     return c.nu_fluids ? getScore(c.nu_fluids) : null;
      case 'nu_swallowing': return c.nu_swallowing ? getScore(c.nu_swallowing) : null;
      case 'co_urinary':    return c.co_urinary ? getScore(c.co_urinary) : null;
      case 'co_bowel':      return c.co_bowel ? getScore(c.co_bowel) : null;
      case 'co_skin':       return c.co_skin ? getScore(c.co_skin) : null;
      case 'sa_falls':      return c.sa_falls ? getScore(c.sa_falls) : null;
      case 'sa_wandering':  return c.sa_wandering ? getScore(c.sa_wandering) : null;
      case 'sa_safety_concerns':
        return c.sa_safety_concerns !== undefined ? (c.sa_safety_concerns ? 1 : 4) : null;
      case 'be_behaviors': {
        const n = (c.be_behaviors || []).filter(b => b !== 'None observed').length;
        return Math.max(0, 4 - Math.min(4, n));
      }
      case 'mo_mood':  return c.mo_mood ? getScore(c.mo_mood) : null;
      case 'mo_sleep': return c.mo_sleep ? getScore(c.mo_sleep) : null;
      case 'sy_symptoms': {
        const n = (c.sy_symptoms || []).length;
        return Math.max(0, 4 - Math.min(4, n));
      }
      default: return null;
    }
  };

  // Build flat chart data: one row per check-in date that has data
  const chartData = useMemo(() => {
    return sortedCheckIns.map(c => {
      const row: Record<string, string | number | null> = { date: c.check_in_date };
      metrics.forEach(m => {
        row[m.key] = getVal(c, m.key);
      });
      return row;
    });
  }, [sortedCheckIns, metrics]);

  const hasData = chartData.length > 0;

  const fmtDate = (d: string) => {
    const dt = new Date(d + 'T12:00');
    if (filterKey === '7d') return dt.toLocaleDateString('en-US', { weekday: 'short' });
    if (filterKey === '1m') return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Score labels for Y axis
  const scoreLabel = (v: number) => {
    const labels: Record<number, string> = { 0: '0', 1: '1', 2: '2', 3: '3', 4: '4' };
    return labels[v] ?? '';
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-soft-taupe/40 rounded-xl shadow-md p-3 text-xs">
        <p className="font-bold text-charcoal mb-1">{fmtDate(label)}</p>
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex items-center gap-1.5 mb-0.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
            <span className="text-medium-gray">{p.name}:</span>
            <span className="font-semibold" style={{ color: p.color }}>{p.value ?? '—'}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 mb-5 border border-soft-taupe/40">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-soft-taupe/30">
        <div className={`w-8 h-8 rounded-xl ${color} flex items-center justify-center flex-shrink-0`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <h3 className="font-bold text-charcoal text-sm">{title}</h3>
      </div>

      {!hasData ? (
        <div className="h-24 flex items-center justify-center text-xs text-medium-gray italic">
          No check-in data for this period yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="4 4" stroke="#e8e4dc" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={fmtDate}
              tick={{ fontSize: 10, fill: '#7a7670' }}
              tickLine={false}
              axisLine={{ stroke: '#c8c4bc' }}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, 4]}
              ticks={[0, 1, 2, 3, 4]}
              tickFormatter={scoreLabel}
              tick={{ fontSize: 10, fill: '#aaa' }}
              tickLine={false}
              axisLine={false}
              width={28}
            />
            <Tooltip content={<CustomTooltip />} />
            {metrics.map(m => (
              <Line
                key={m.key}
                type="monotone"
                dataKey={m.key}
                name={m.label}
                stroke={m.color}
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: m.color, stroke: 'white', strokeWidth: 1.8 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}

      {hasData && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 pt-2 border-t border-soft-taupe/20">
          {metrics.map(m => (
            <span
              key={m.key}
              className="flex items-center gap-1.5 text-[11px] font-semibold"
              style={{ color: m.color }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" className="flex-shrink-0">
                <circle cx="5" cy="5" r="4" fill={m.color} />
              </svg>
              {m.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Filter Buttons Component ──────────────────────────────────────────────────
function FilterButtons({
  current,
  onChange,
}: {
  current: FilterKey;
  onChange: (key: FilterKey) => void;
}) {
  const filters: { key: FilterKey; label: string }[] = [
    { key: '7d', label: '1 Week' },
    { key: '1m', label: '1 Month' },
    { key: '2m', label: '2 Months' },
    { key: '3m', label: '3 Months' },
    { key: '6m', label: '6 Months' },
    { key: '1y', label: '1 Year' },
  ];

  return (
    <div className="flex gap-2 mb-4 flex-wrap justify-end">
      {filters.map(f => (
        <button
          key={f.key}
          onClick={() => onChange(f.key)}
          className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
            current === f.key
              ? 'bg-warm-bronze text-white shadow-sm'
              : 'bg-soft-taupe/30 text-medium-gray hover:bg-soft-taupe'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

// ── Simple Mood Timeline ──────────────────────────────────────────────────────
type TimelineView = 'day' | 'week' | 'month';

function MoodTimeline({ entries }: { entries: { timestamp: string; mood: MoodType; note?: string }[] }) {
  const [view, setView] = useState<TimelineView>('day');
  const [baseDate, setBaseDate] = useState(new Date());

  const nav = (dir: number) => {
    setBaseDate(d => {
      const n = new Date(d);
      if (view === 'day') n.setDate(n.getDate() + dir);
      if (view === 'week') n.setDate(n.getDate() + dir * 7);
      if (view === 'month') n.setMonth(n.getMonth() + dir);
      return n;
    });
  };

  const label = () => {
    if (view === 'day') return format(baseDate, 'EEEE, MMMM d');
    if (view === 'week') {
      const start = new Date(baseDate);
      start.setDate(start.getDate() - start.getDay());
      return `${format(start, 'MMM d')} – ${format(new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000), 'MMM d, yyyy')}`;
    }
    return format(baseDate, 'MMMM yyyy');
  };

  const DayView = () => {
    const dayStr = format(baseDate, 'yyyy-MM-dd');
    const dayEntries = entries.filter(e => e.timestamp.startsWith(dayStr));

    return (
      <div className="space-y-3">
        {dayEntries.length === 0 ? (
          <p className="text-sm text-medium-gray italic text-center py-4">No mood entries for this day.</p>
        ) : (
          dayEntries
            .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
            .map((e, i) => {
              const m = moodOf(e.mood);
              return (
                <div key={i} className={`flex items-center gap-3 p-3 rounded-xl ${m.bg}`}>
                  <span className="text-xl">{m.emoji}</span>
                  <div className="flex-1">
                    <span className="font-semibold text-charcoal capitalize text-sm">{m.label}</span>
                    {e.note && <p className="text-xs text-medium-gray truncate">{e.note}</p>}
                  </div>
                  <span className="text-xs text-medium-gray">{format(new Date(e.timestamp), 'h:mm a')}</span>
                </div>
              );
            })
        )}
      </div>
    );
  };

  const WeekView = () => {
    const start = new Date(baseDate);
    start.setDate(start.getDate() - start.getDay());
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });

    return (
      <div className="space-y-2">
        {days.map(day => {
          const ds = format(day, 'yyyy-MM-dd');
          const de = entries.filter(e => e.timestamp.startsWith(ds));
          const isToday = isSameDay(day, new Date());
          const mood = de.length > 0 ? moodOf(de[de.length - 1].mood) : null;

          return (
            <div
              key={ds}
              className={`flex items-center gap-3 p-3 rounded-xl ${isToday ? 'bg-warm-bronze/10' : 'bg-soft-taupe/20'}`}
            >
              <div className="w-16 flex-shrink-0">
                <p className={`text-xs font-bold ${isToday ? 'text-warm-bronze' : 'text-medium-gray'}`}>{format(day, 'EEE')}</p>
                <p className="text-sm font-semibold text-charcoal">{format(day, 'd')}</p>
              </div>

              {mood ? (
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{mood.emoji}</span>
                  <span className="text-sm capitalize text-charcoal">{mood.label}</span>
                </div>
              ) : (
                <p className="text-xs text-medium-gray italic">—</p>
              )}

              {de.length > 1 && <span className="text-xs text-medium-gray ml-auto">{de.length} entries</span>}
            </div>
          );
        })}
      </div>
    );
  };

  const MonthView = () => {
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const blanks = Array(startDow).fill(null);
    const days = Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1));
    const allDays = [...blanks, ...days];

    const moodPerDay = new Map<string, MoodType>();
    entries.forEach(e => {
      const ds = e.timestamp.split('T')[0];
      moodPerDay.set(ds, e.mood);
    });

    return (
      <div>
        <div className="grid grid-cols-7 mb-1">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
            <div key={d} className="text-center text-xs font-semibold text-medium-gray py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {allDays.map((day, i) => {
            if (!day) return <div key={i} className="h-12" />;
            const ds = format(day, 'yyyy-MM-dd');
            const mood = moodPerDay.get(ds);
            const m = mood ? moodOf(mood) : null;
            const isToday = isSameDay(day, new Date());

            return (
              <div
                key={i}
                className={`flex flex-col items-center justify-center rounded-xl min-h-[52px] p-1 ${
                  isToday ? 'ring-2 ring-warm-bronze' : ''
                } ${m ? m.bg : 'bg-soft-taupe/20'}`}
              >
                <span className="text-xs font-bold text-charcoal">{format(day, 'd')}</span>
                {m && <span className="text-lg leading-none">{m.emoji}</span>}
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-3 justify-center">
          {MOODS.map(m => (
            <div key={m.type} className="flex items-center gap-1.5">
              <span className="text-sm">{m.emoji}</span>
              <span className="text-xs text-medium-gray capitalize">{m.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1 bg-soft-taupe/20 rounded-xl p-1">
          {([
            { id: 'day' as TimelineView, icon: Clock, label: 'Day' },
            { id: 'week' as TimelineView, icon: Calendar, label: 'Week' },
            { id: 'month' as TimelineView, icon: BarChart3, label: 'Month' },
          ]).map(v => {
            const Icon = v.icon;
            return (
              <button
                key={v.id}
                onClick={() => {
                  setView(v.id);
                  setBaseDate(new Date());
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  view === v.id ? 'bg-white shadow text-charcoal' : 'text-medium-gray hover:text-charcoal'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {v.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1">
          <button onClick={() => nav(-1)} className="w-8 h-8 rounded-lg hover:bg-soft-taupe/50 flex items-center justify-center">
            <ChevronLeft className="w-4 h-4 text-charcoal" />
          </button>
          <span className="text-sm font-semibold text-charcoal min-w-[160px] text-center">{label()}</span>
          <button onClick={() => nav(1)} className="w-8 h-8 rounded-lg hover:bg-soft-taupe/50 flex items-center justify-center">
            <ChevronRight className="w-4 h-4 text-charcoal" />
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={view + format(baseDate, 'yyyy-MM-dd')}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
        >
          {view === 'day' && <DayView />}
          {view === 'week' && <WeekView />}
          {view === 'month' && <MonthView />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function PatientMoodTracker() {
  const { state, dispatch } = useApp();

  const [selectedMood, setSelectedMood] = useState<MoodType | null>(null);
  const [moodNote, setMoodNote] = useState('');
  const [showCalmTools, setShowCalmTools] = useState(false);
  const [checkInData, setCheckInData] = useState<CheckInData[]>([]);
  const [filterKey, setFilterKey] = useState<FilterKey>('1m');
  const [loading, setLoading] = useState(true);

  const moodEntries = state.moodEntries ?? [];
  const patientId = state.currentUser?.id;

useEffect(() => {
  if (!patientId) return;

  let isActive = true;

  const loadCheckIns = async () => {
    if (isActive) setLoading(true);

    try {
      const { data, error } = await supabase
        .from('care_partner_checkins')
        .select('*')
        .eq('patient_id', patientId)
        .order('check_in_date', { ascending: false });

      if (error) throw error;

      if (isActive) {
        setCheckInData((data || []) as CheckInData[]);
      }
    } catch (err) {
      console.error('Error loading check-ins:', err);
    } finally {
      if (isActive) setLoading(false);
    }
  };

  loadCheckIns();

  const channel = supabase
    .channel(`care_partner_checkins_${patientId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'care_partner_checkins',
        filter: `patient_id=eq.${patientId}`,
      },
      async () => {
        await loadCheckIns();
      }
    )
    .subscribe();

  return () => {
    isActive = false;
    supabase.removeChannel(channel);
  };
}, [patientId]);

  const calmTools = [
    {
      icon: Wind,
      title: 'Deep Breathing',
      description: 'Breathe along with the guide',
      action: () => toast.success('Breathing exercise started'),
    },
    {
      icon: Music,
      title: 'Calming Music',
      description: 'Listen to soothing sounds',
      action: () => toast.success('Playing calming music'),
    },
    {
      icon: BookOpen,
      title: 'Memory Book',
      description: 'Look at happy memories',
      action: () => toast.success('Opening memory book'),
    },
    {
      icon: Sun,
      title: 'Gentle Stretch',
      description: 'Easy movements to relax',
      action: () => toast.success('Starting gentle stretches'),
    },
  ];

  const handleMoodSelect = (mood: MoodType) => {
    setSelectedMood(mood);
    if (['anxious', 'sad', 'scared', 'angry'].includes(mood)) setShowCalmTools(true);
    else setShowCalmTools(false);
  };

  const submitMood = async () => {
    if (!selectedMood || !patientId) return;

    const timestamp = new Date().toISOString();
    const timeOfDay = (
      format(new Date(), 'a').toLowerCase().includes('am') ? 'morning' : 'afternoon'
    ) as 'morning' | 'afternoon' | 'evening' | 'night';

    // Persist to Supabase so moods survive logout and reload
    const { data, error } = await supabase.from('mood_entries').insert({
      patient_id: patientId,
      mood: selectedMood,
      intensity: 7,
      note: moodNote || null,
      time_of_day: timeOfDay,
      timestamp,
      recorded_by: state.patient?.preferredName || 'Patient',
    }).select().single();

    if (error) {
      console.error('Error saving mood entry:', error);
      toast.error('Could not save your mood. Please try again.');
      return;
    }

    // Update local context with DB-assigned id
    dispatch({
      type: 'ADD_MOOD_ENTRY',
      payload: {
        id: data?.id || `me${Date.now()}`,
        patientId,
        mood: selectedMood,
        intensity: 7,
        note: moodNote,
        timeOfDay,
        timestamp,
        recordedBy: state.patient?.preferredName || 'Patient',
      },
    });

    toast.success('Thank you for sharing how you feel 💛');
    setSelectedMood(null);
    setMoodNote('');
    setShowCalmTools(false);
  };

  const timelineEntries = useMemo(
    () => moodEntries.map(e => ({ timestamp: e.timestamp, mood: e.mood as MoodType, note: e.note })),
    [moodEntries]
  );

  const sectionAMetrics = [
    { key: 'fn_dressing', label: 'Dressing', color: '#2563eb' },
    { key: 'fn_bathing', label: 'Bathing', color: '#16a34a' },
    { key: 'fn_toileting', label: 'Toileting', color: '#dc2626' },
    { key: 'fn_transfers', label: 'Transfers', color: '#7c3aed' },
    { key: 'fn_mobility', label: 'Mobility', color: '#ea580c' },
    { key: 'fn_medication', label: 'Medication', color: '#0891b2' },
  ];

  const sectionBMetrics = [
    { key: 'nu_appetite', label: 'Appetite', color: '#16a34a' },
    { key: 'nu_meal_pct', label: 'Meal %', color: '#ca8a04' },
    { key: 'nu_fluids', label: 'Fluids', color: '#2563eb' },
    { key: 'nu_swallowing', label: 'Swallowing', color: '#dc2626' },
  ];

  const sectionCMetrics = [
    { key: 'co_urinary', label: 'Urinary', color: '#2563eb' },
    { key: 'co_bowel', label: 'Bowel', color: '#16a34a' },
    { key: 'co_skin', label: 'Skin', color: '#dc2626' },
  ];

  const sectionDMetrics = [
    { key: 'sa_falls', label: 'Falls', color: '#dc2626' },
    { key: 'sa_wandering', label: 'Wandering', color: '#ea580c' },
    { key: 'sa_safety_concerns', label: 'Safety Concerns', color: '#7c3aed' },
  ];

  const sectionEMetrics = [
    { key: 'be_behaviors', label: 'Behaviors Observed', color: '#7c3aed' },
  ];

  const sectionFMetrics = [
    { key: 'mo_mood', label: 'Mood', color: '#db2777' },
    { key: 'mo_sleep', label: 'Sleep', color: '#2563eb' },
  ];

  const sectionGMetrics = [
    { key: 'sy_symptoms', label: 'Symptoms Present', color: '#dc2626' },
  ];

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-10 h-10 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── SECTION 1: How Are You Feeling? ─────────────────────────────── */}
      <div className="bg-white rounded-3xl shadow-card p-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <h1 className="text-2xl font-bold text-charcoal mb-1">How Are You Feeling?</h1>
          <p className="text-medium-gray mb-6">Tap the face that matches your mood right now</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="grid grid-cols-4 sm:grid-cols-7 gap-3"
        >
          {MOODS.map((mood, index) => (
            <motion.button
              key={mood.type}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 + index * 0.05 }}
              whileHover={{ scale: 1.08, y: -4 }}
              whileTap={{ scale: 0.94 }}
              onClick={() => handleMoodSelect(mood.type)}
              className={`flex flex-col items-center gap-3 p-4 rounded-2xl transition-all ${
                selectedMood === mood.type
                  ? `${mood.bg} ring-2 ${mood.ring} shadow-md`
                  : 'hover:bg-soft-taupe/40 bg-warm-ivory'
              }`}
            >
              <span className="text-5xl sm:text-6xl leading-none">{mood.emoji}</span>
              <span className="text-sm font-semibold text-charcoal">{mood.label}</span>
            </motion.button>
          ))}
        </motion.div>

        <AnimatePresence>
          {selectedMood && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="mt-6 space-y-4"
            >
              <div className={`p-4 rounded-2xl ${moodOf(selectedMood).bg} flex items-center gap-3`}>
                <span className="text-4xl">{moodOf(selectedMood).emoji}</span>
                <p className="font-semibold text-charcoal text-lg capitalize">You feel {selectedMood}</p>
              </div>

              <div>
                <p className="text-sm text-medium-gray mb-2">Would you like to add a note? (optional)</p>
                <Textarea
                  value={moodNote}
                  onChange={e => setMoodNote(e.target.value)}
                  placeholder="I'm feeling this way because…"
                  className="rounded-xl border-soft-taupe focus:border-warm-bronze resize-none"
                  rows={3}
                />
              </div>

              <Button
                onClick={submitMood}
                className="w-full bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl py-4 text-base font-semibold"
              >
                Share How I Feel
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showCalmTools && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-6">
              <h3 className="text-lg font-semibold text-charcoal mb-3">Things that might help 💙</h3>
              <div className="grid grid-cols-2 gap-3">
                {calmTools.map((tool, index) => (
                  <motion.button
                    key={tool.title}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.08 }}
                    onClick={tool.action}
                    className="bg-warm-ivory rounded-2xl p-5 shadow-soft hover:shadow-card transition-shadow text-left"
                  >
                    <tool.icon className="w-8 h-8 text-warm-bronze mb-3" />
                    <p className="font-semibold text-charcoal">{tool.title}</p>
                    <p className="text-sm text-medium-gray mt-1">{tool.description}</p>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── SECTION 2: Feeling Timeline ─────────────────────────────────── */}
      <div className="bg-white rounded-3xl shadow-card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-calm-blue/10 rounded-xl flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-calm-blue" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-charcoal">Feeling Timeline</h2>
            <p className="text-xs text-medium-gray">Track your moods by day, week, or month</p>
          </div>
        </div>

        {timelineEntries.length === 0 ? (
          <div className="text-center py-10 text-medium-gray">
            <p className="text-4xl mb-3">📊</p>
            <p className="font-medium text-charcoal">No mood history yet</p>
            <p className="text-sm mt-1">Share how you feel above and it will appear here</p>
          </div>
        ) : (
          <MoodTimeline entries={timelineEntries} />
        )}
      </div>

      {/* ── SECTION 3: Care Partner Progress Graphs ─────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-warm-bronze" />
            <h2 className="text-lg font-bold text-charcoal">Care Partner Progress</h2>
          </div>
          <FilterButtons current={filterKey} onChange={setFilterKey} />
        </div>

        <p className="text-xs text-medium-gray mb-4">
          Track progress over time from daily care partner check-ins
        </p>

        <SectionCombinedGraph
          title="A — Daily Function"
          icon={Activity}
          color="bg-warm-bronze"
          metrics={sectionAMetrics}
          allCheckIns={checkInData}
          filterKey={filterKey}
        />

        <SectionCombinedGraph
          title="B — Nutrition & Hydration"
          icon={Utensils}
          color="bg-soft-sage"
          metrics={sectionBMetrics}
          allCheckIns={checkInData}
          filterKey={filterKey}
        />

        <SectionCombinedGraph
          title="C — Continence"
          icon={Droplets}
          color="bg-calm-blue"
          metrics={sectionCMetrics}
          allCheckIns={checkInData}
          filterKey={filterKey}
        />

        <SectionCombinedGraph
          title="D — Safety Events"
          icon={Shield}
          color="bg-gentle-coral"
          metrics={sectionDMetrics}
          allCheckIns={checkInData}
          filterKey={filterKey}
        />

        <SectionCombinedGraph
          title="E — Behavior & Responsiveness"
          icon={Brain}
          color="bg-deep-bronze"
          metrics={sectionEMetrics}
          allCheckIns={checkInData}
          filterKey={filterKey}
        />

        <SectionCombinedGraph
          title="F — Mood & Social Engagement"
          icon={Heart}
          color="bg-warm-amber"
          metrics={sectionFMetrics}
          allCheckIns={checkInData}
          filterKey={filterKey}
        />

        <SectionCombinedGraph
          title="G — Symptoms & Comfort"
          icon={ThumbsUp}
          color="bg-purple-500"
          metrics={sectionGMetrics}
          allCheckIns={checkInData}
          filterKey={filterKey}
        />
      </div>
    </div>
  );
}