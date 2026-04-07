import { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Wind, Music, BookOpen, Sun, TrendingUp, Clock, Calendar, BarChart3, ChevronLeft, ChevronRight, Activity, Utensils, Droplets, Shield, Brain, Heart, ThumbsUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { format, subDays, subWeeks, subMonths, isSameDay, parseISO } from 'date-fns';
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

// ── Score mapping for Care Partner fields (5 levels: 0=worst, 4=best) ─────────
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
  // E - Behavior (count of behaviors)
  be_behaviors: string[];
  // F - Mood & Social
  mo_mood: string | null;
  mo_sleep: string | null;
  // G - Symptoms (count)
  sy_symptoms: string[];
}

type FilterDays = 7 | 30 | 60 | 90;

// ── Line Graph Component ──────────────────────────────────────────────────────
// ── Combined Section Graph: one graph, metrics on X-axis ─────────────────────
// Each metric becomes one data point (its latest value) plotted along X.
// The graph shows the MOST RECENT check-in value for each metric as a connected line,
// so the reader sees relative function across all metrics at a glance.
// When multiple check-ins exist, dots represent the latest value per metric.
function SectionCombinedGraph({
  title,
  icon: Icon,
  color,
  accentColor,
  metrics,
  allCheckIns,
  filterDays,
}: {
  title: string;
  icon: React.ElementType;
  color: string;
  accentColor: string;
  metrics: { key: string; label: string }[];
  allCheckIns: CheckInData[];
  filterDays: FilterDays;
}) {
  const yMax = 4;
  const chartH = 110;
  const PAD_LEFT = 28;
  const PAD_BOTTOM = 32;
  const PAD_TOP = 10;
  const PAD_RIGHT = 10;

  // Filter check-ins to the selected date window
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - filterDays);
  const filtered = allCheckIns
    .filter(d => new Date(d.check_in_date) >= cutoff)
    .sort((a, b) => new Date(a.check_in_date).getTime() - new Date(b.check_in_date).getTime());

  // Build a value getter map (same as before)
  const getters: Record<string, (e: CheckInData) => number | null> = {
    fn_dressing:       (e) => e.fn_dressing   ? getScore(e.fn_dressing)   : null,
    fn_bathing:        (e) => e.fn_bathing    ? getScore(e.fn_bathing)    : null,
    fn_toileting:      (e) => e.fn_toileting  ? getScore(e.fn_toileting)  : null,
    fn_transfers:      (e) => e.fn_transfers  ? getScore(e.fn_transfers)  : null,
    fn_mobility:       (e) => e.fn_mobility   ? getScore(e.fn_mobility)   : null,
    fn_medication:     (e) => e.fn_medication ? getScore(e.fn_medication) : null,
    nu_appetite:       (e) => e.nu_appetite   ? getScore(e.nu_appetite)   : null,
    nu_meal_pct:       (e) => e.nu_meal_pct   ? getScore(e.nu_meal_pct)   : null,
    nu_fluids:         (e) => e.nu_fluids     ? getScore(e.nu_fluids)     : null,
    nu_swallowing:     (e) => e.nu_swallowing ? getScore(e.nu_swallowing) : null,
    co_urinary:        (e) => e.co_urinary    ? getScore(e.co_urinary)    : null,
    co_bowel:          (e) => e.co_bowel      ? getScore(e.co_bowel)      : null,
    co_skin:           (e) => e.co_skin       ? getScore(e.co_skin)       : null,
    sa_falls:          (e) => e.sa_falls      ? getScore(e.sa_falls, 4)   : null,
    sa_wandering:      (e) => e.sa_wandering  ? getScore(e.sa_wandering, 4) : null,
    sa_safety_concerns:(e) => e.sa_safety_concerns !== undefined ? (e.sa_safety_concerns ? 1 : 4) : null,
    be_behaviors:      (e) => { const c = (e.be_behaviors||[]).filter(b=>b!=='None observed').length; return Math.max(0, 4 - Math.min(4,c)); },
    mo_mood:           (e) => e.mo_mood  ? getScore(e.mo_mood)  : null,
    mo_sleep:          (e) => e.mo_sleep ? getScore(e.mo_sleep) : null,
    sy_symptoms:       (e) => { const c = (e.sy_symptoms||[]).length; return Math.max(0, 4 - Math.min(4,c)); },
  };

  // For each metric, get the latest non-null value across filtered check-ins
  const points: { label: string; value: number | null }[] = metrics.map(m => {
    const getter = getters[m.key];
    if (!getter) return { label: m.label, value: null };
    // Walk from most recent to oldest, take first non-null
    for (let i = filtered.length - 1; i >= 0; i--) {
      const v = getter(filtered[i]);
      if (v !== null) return { label: m.label, value: v };
    }
    return { label: m.label, value: null };
  });

  const hasData = points.some(p => p.value !== null);
  const n = points.length;
  const totalW = 320; // SVG coordinate width

  // X positions: evenly spaced, one per metric
  const xOf = (i: number) =>
    n === 1 ? totalW / 2 : PAD_LEFT + (i / (n - 1)) * (totalW - PAD_LEFT - PAD_RIGHT);
  const toY = (v: number) => PAD_TOP + chartH - (v / yMax) * chartH;

  // Build path only through valid points
  const validPts = points
    .map((p, i) => ({ ...p, xi: xOf(i) }))
    .filter(p => p.value !== null) as { label: string; value: number; xi: number }[];

  const pathD = validPts.map((p, i) =>
    `${i === 0 ? 'M' : 'L'}${p.xi.toFixed(1)},${toY(p.value).toFixed(1)}`
  ).join(' ');

  const areaD = validPts.length > 1
    ? `${pathD} L${validPts[validPts.length-1].xi.toFixed(1)},${(PAD_TOP+chartH).toFixed(1)} L${validPts[0].xi.toFixed(1)},${(PAD_TOP+chartH).toFixed(1)} Z`
    : '';

  const svgH = PAD_TOP + chartH + PAD_BOTTOM;

  return (
    <div className="bg-white rounded-2xl shadow-card p-4 mb-5 border border-soft-taupe/30">
      {/* Section heading */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-soft-taupe/40">
        <div className={`w-8 h-8 rounded-xl ${color} flex items-center justify-center flex-shrink-0`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <h3 className="font-bold text-charcoal text-sm">{title}</h3>
      </div>

      {!hasData ? (
        <div className="h-24 flex items-center justify-center text-xs text-medium-gray">
          No check-in data for this period yet
        </div>
      ) : (
        <svg
          width="100%"
          viewBox={`0 0 ${totalW} ${svgH}`}
          className="overflow-visible w-full"
        >
          {/* Y-axis gridlines + labels */}
          {[0, 1, 2, 3, 4].map(v => (
            <g key={v}>
              <line
                x1={PAD_LEFT} y1={toY(v)}
                x2={totalW - PAD_RIGHT} y2={toY(v)}
                stroke="#e5e0d5" strokeWidth="0.6" strokeDasharray="4,3"
              />
              <text
                x={PAD_LEFT - 4} y={toY(v) + 3.5}
                textAnchor="end" fontSize="8" fill="#aaa"
              >{v}</text>
            </g>
          ))}

          {/* Gradient area fill */}
          {areaD && (
            <>
              <defs>
                <linearGradient id={`grad-${title.replace(/\s/g,'')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accentColor} stopOpacity="0.25" />
                  <stop offset="100%" stopColor={accentColor} stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <path d={areaD} fill={`url(#grad-${title.replace(/\s/g,'')})`} />
            </>
          )}

          {/* Line */}
          {pathD && (
            <path
              d={pathD} fill="none"
              stroke={accentColor} strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"
            />
          )}

          {/* Dots + X-axis labels */}
          {points.map((p, i) => {
            const cx = xOf(i);
            const hasVal = p.value !== null;
            return (
              <g key={i}>
                {/* Dot */}
                {hasVal && (
                  <>
                    <circle
                      cx={cx.toFixed(1)}
                      cy={toY(p.value!).toFixed(1)}
                      r="4.5" fill={accentColor} stroke="white" strokeWidth="2"
                    />
                    {/* Value label above dot */}
                    <text
                      x={cx.toFixed(1)}
                      y={(toY(p.value!) - 7).toFixed(1)}
                      textAnchor="middle" fontSize="8" fontWeight="bold" fill={accentColor}
                    >{p.value!.toFixed(0)}</text>
                  </>
                )}
                {/* Empty dot placeholder when no data */}
                {!hasVal && (
                  <circle
                    cx={cx.toFixed(1)} cy={(PAD_TOP + chartH / 2).toFixed(1)}
                    r="3" fill="#ddd" stroke="white" strokeWidth="1.5"
                  />
                )}
                {/* X-axis label — wrap long labels */}
                <text
                  x={cx.toFixed(1)}
                  y={(PAD_TOP + chartH + 14).toFixed(1)}
                  textAnchor="middle" fontSize="8.5" fill="#666"
                  fontWeight="500"
                >
                  {p.label}
                </text>
              </g>
            );
          })}

          {/* Y-axis line */}
          <line
            x1={PAD_LEFT} y1={PAD_TOP}
            x2={PAD_LEFT} y2={PAD_TOP + chartH}
            stroke="#ccc" strokeWidth="0.8"
          />
          {/* X-axis line */}
          <line
            x1={PAD_LEFT} y1={PAD_TOP + chartH}
            x2={totalW - PAD_RIGHT} y2={PAD_TOP + chartH}
            stroke="#ccc" strokeWidth="0.8"
          />
        </svg>
      )}
    </div>
  );
}

// ── Filter Buttons Component ──────────────────────────────────────────────────
function FilterButtons({ current, onChange }: { current: FilterDays; onChange: (days: FilterDays) => void }) {
  const filters: { days: FilterDays; label: string }[] = [
    { days: 7, label: '1 Week' },
    { days: 30, label: '1 Month' },
    { days: 60, label: '2 Months' },
    { days: 90, label: '3 Months' },
  ];
  
  return (
    <div className="flex gap-2 mb-4">
      {filters.map(f => (
        <button
          key={f.days}
          onClick={() => onChange(f.days)}
          className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
            current === f.days
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



// ── Simple Mood Timeline (Feeling Timeline) ───────────────────────────────────
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
      start.setDate(start.getDate() - start.getDay() + 1);
      return `${format(start, 'MMM d')} – ${format(new Date(start.getTime() + 6*24*60*60*1000), 'MMM d, yyyy')}`;
    }
    return format(baseDate, 'MMMM yyyy');
  };

  // Day view: show entries for selected day
  const DayView = () => {
    const dayStr = format(baseDate, 'yyyy-MM-dd');
    const dayEntries = entries.filter(e => e.timestamp.startsWith(dayStr));
    
    return (
      <div className="space-y-3">
        {dayEntries.length === 0 ? (
          <p className="text-sm text-medium-gray italic text-center py-4">No mood entries for this day.</p>
        ) : (
          dayEntries.sort((a,b) => b.timestamp.localeCompare(a.timestamp)).map((e, i) => {
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

  // Week view: show emoji per day
  const WeekView = () => {
    const start = new Date(baseDate);
    start.setDate(start.getDate() - start.getDay() + 1);
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
          const mood = de.length > 0 ? moodOf(de[de.length-1].mood) : null;
          return (
            <div key={ds} className={`flex items-center gap-3 p-3 rounded-xl ${isToday ? 'bg-warm-bronze/10' : 'bg-soft-taupe/20'}`}>
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

  // Month view: calendar grid
  const MonthView = () => {
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const blanks = Array(startDow === 0 ? 6 : startDow - 1).fill(null);
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
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => (
            <div key={d} className="text-center text-xs font-semibold text-medium-gray py-1">{d}</div>
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
              <div key={i} className={`flex flex-col items-center justify-center rounded-xl min-h-[52px] p-1 ${isToday ? 'ring-2 ring-warm-bronze' : ''} ${m ? m.bg : 'bg-soft-taupe/20'}`}>
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
              <button key={v.id} onClick={() => { setView(v.id); setBaseDate(new Date()); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${view === v.id ? 'bg-white shadow text-charcoal' : 'text-medium-gray hover:text-charcoal'}`}>
                <Icon className="w-3.5 h-3.5" />{v.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => nav(-1)} className="w-8 h-8 rounded-lg hover:bg-soft-taupe/50 flex items-center justify-center"><ChevronLeft className="w-4 h-4 text-charcoal" /></button>
          <span className="text-sm font-semibold text-charcoal min-w-[160px] text-center">{label()}</span>
          <button onClick={() => nav(1)} className="w-8 h-8 rounded-lg hover:bg-soft-taupe/50 flex items-center justify-center"><ChevronRight className="w-4 h-4 text-charcoal" /></button>
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={view + format(baseDate, 'yyyy-MM-dd')} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
          {view === 'day' && <DayView />}
          {view === 'week' && <WeekView />}
          {view === 'month' && <MonthView />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function PatientProgressTimeline() {
  const { state, dispatch } = useApp();
  const [selectedMood, setSelectedMood] = useState<MoodType | null>(null);
  const [moodNote, setMoodNote] = useState('');
  const [showCalmTools, setShowCalmTools] = useState(false);
  const [checkInData, setCheckInData] = useState<CheckInData[]>([]);
  const [filterDays, setFilterDays] = useState<FilterDays>(30);
  const [loading, setLoading] = useState(true);

  const moodEntries = state.moodEntries ?? [];
  const patientId = state.currentUser?.id;

  // Load Care Partner Check-in data
  useEffect(() => {
    if (!patientId) return;
    const loadCheckIns = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('care_partner_checkins')
          .select('*')
          .eq('patient_id', patientId)
          .order('check_in_date', { ascending: false });
        
        if (error) throw error;
        setCheckInData((data || []) as CheckInData[]);
      } catch (err) {
        console.error('Error loading check-ins:', err);
      } finally {
        setLoading(false);
      }
    };
    loadCheckIns();
  }, [patientId]);

  const calmTools = [
    { icon: Wind, title: 'Deep Breathing', description: 'Breathe along with the guide', action: () => toast.success('Breathing exercise started') },
    { icon: Music, title: 'Calming Music', description: 'Listen to soothing sounds', action: () => toast.success('Playing calming music') },
    { icon: BookOpen, title: 'Memory Book', description: 'Look at happy memories', action: () => toast.success('Opening memory book') },
    { icon: Sun, title: 'Gentle Stretch', description: 'Easy movements to relax', action: () => toast.success('Starting gentle stretches') },
  ];

  const handleMoodSelect = (mood: MoodType) => {
    setSelectedMood(mood);
    if (['anxious', 'sad', 'scared', 'angry'].includes(mood)) setShowCalmTools(true);
    else setShowCalmTools(false);
  };

  const submitMood = () => {
    if (!selectedMood) return;
    dispatch({
      type: 'ADD_MOOD_ENTRY',
      payload: {
        id: `me${Date.now()}`,
        patientId: state.patient?.id || '',
        mood: selectedMood,
        intensity: 7,
        note: moodNote,
        timeOfDay: (format(new Date(), 'a').toLowerCase().includes('am') ? 'morning' : 'afternoon') as 'morning' | 'afternoon' | 'evening' | 'night',
        timestamp: new Date().toISOString(),
        recordedBy: state.patient?.preferredName || 'Patient',
      },
    });
    toast.success('Thank you for sharing how you feel 💛');
    setSelectedMood(null);
    setMoodNote('');
    setShowCalmTools(false);
  };

  const timelineEntries = useMemo(() =>
    moodEntries.map(e => ({ timestamp: e.timestamp, mood: e.mood as MoodType, note: e.note })),
    [moodEntries]
  );

  // Define metrics for each section
  const sectionAMetrics = [
    { key: 'fn_dressing', label: 'Dressing' },
    { key: 'fn_bathing', label: 'Bathing' },
    { key: 'fn_toileting', label: 'Toileting' },
    { key: 'fn_transfers', label: 'Transfers' },
    { key: 'fn_mobility', label: 'Mobility' },
    { key: 'fn_medication', label: 'Medication' },
  ];
  
  const sectionBMetrics = [
    { key: 'nu_appetite', label: 'Appetite' },
    { key: 'nu_meal_pct', label: 'Meal %' },
    { key: 'nu_fluids', label: 'Fluids' },
    { key: 'nu_swallowing', label: 'Swallowing' },
  ];
  
  const sectionCMetrics = [
    { key: 'co_urinary', label: 'Urinary' },
    { key: 'co_bowel', label: 'Bowel' },
    { key: 'co_skin', label: 'Skin' },
  ];
  
  const sectionDMetrics = [
    { key: 'sa_falls', label: 'Falls' },
    { key: 'sa_wandering', label: 'Wandering' },
    { key: 'sa_safety_concerns', label: 'Safety Concerns' },
  ];
  
  const sectionEMetrics = [
    { key: 'be_behaviors', label: 'Behaviors Observed' },
  ];
  
  const sectionFMetrics = [
    { key: 'mo_mood', label: 'Mood' },
    { key: 'mo_sleep', label: 'Sleep' },
  ];
  
  const sectionGMetrics = [
    { key: 'sy_symptoms', label: 'Symptoms Present' },
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
      {/* ── SECTION 1: How Are You Feeling? (Mood Entry) ─────────────────── */}
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
              className={`flex flex-col items-center gap-3 p-4 rounded-2xl transition-all
                ${selectedMood === mood.type
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
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="mt-6 space-y-4">
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
              <Button onClick={submitMood} className="w-full bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl py-4 text-base font-semibold">
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

      {/* ── SECTION 2: Feeling Timeline ──────────────────────────────────── */}
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

      {/* ── SECTION 3: Care Partner Progress Graphs ───────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-warm-bronze" />
            <h2 className="text-lg font-bold text-charcoal">Care Partner Progress</h2>
          </div>
          <FilterButtons current={filterDays} onChange={setFilterDays} />
        </div>
        <p className="text-xs text-medium-gray mb-4">Track progress over time from daily care partner check-ins</p>

        {/* Section A — Daily Function */}
        <SectionCombinedGraph
          title="A — Daily Function"
          icon={Activity}
          color="bg-warm-bronze"
          accentColor="#c17a3a"
          metrics={sectionAMetrics}
          allCheckIns={checkInData}
          filterDays={filterDays}
        />

        {/* Section B — Nutrition & Hydration */}
        <SectionCombinedGraph
          title="B — Nutrition & Hydration"
          icon={Utensils}
          color="bg-soft-sage"
          accentColor="#7dbf7d"
          metrics={sectionBMetrics}
          allCheckIns={checkInData}
          filterDays={filterDays}
        />

        {/* Section C — Continence */}
        <SectionCombinedGraph
          title="C — Continence"
          icon={Droplets}
          color="bg-calm-blue"
          accentColor="#6baed6"
          metrics={sectionCMetrics}
          allCheckIns={checkInData}
          filterDays={filterDays}
        />

        {/* Section D — Safety Events */}
        <SectionCombinedGraph
          title="D — Safety Events"
          icon={Shield}
          color="bg-gentle-coral"
          accentColor="#e07b5a"
          metrics={sectionDMetrics}
          allCheckIns={checkInData}
          filterDays={filterDays}
        />

        {/* Section E — Behavior & Responsiveness */}
        <SectionCombinedGraph
          title="E — Behavior & Responsiveness"
          icon={Brain}
          color="bg-deep-bronze"
          accentColor="#8B6914"
          metrics={sectionEMetrics}
          allCheckIns={checkInData}
          filterDays={filterDays}
        />

        {/* Section F — Mood & Social Engagement */}
        <SectionCombinedGraph
          title="F — Mood & Social Engagement"
          icon={Heart}
          color="bg-warm-amber"
          accentColor="#f0a030"
          metrics={sectionFMetrics}
          allCheckIns={checkInData}
          filterDays={filterDays}
        />

        {/* Section G — Symptoms & Comfort */}
        <SectionCombinedGraph
          title="G — Symptoms & Comfort"
          icon={ThumbsUp}
          color="bg-purple-500"
          accentColor="#9b59b6"
          metrics={sectionGMetrics}
          allCheckIns={checkInData}
          filterDays={filterDays}
        />
      </div>
    </div>
  );
}