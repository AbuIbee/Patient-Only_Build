import { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import { Activity, Utensils, Droplets, Shield, Brain, Heart, ThumbsUp, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Filters ──────────────────────────────────────────────────────────────────
type FilterKey = '7d' | '1m' | '2m' | '3m';
const FILTERS: { key: FilterKey; label: string; days: number }[] = [
  { key: '7d', label: '1 Week',   days: 7  },
  { key: '1m', label: '1 Month',  days: 30 },
  { key: '2m', label: '2 Months', days: 60 },
  { key: '3m', label: '3 Months', days: 90 },
];

// ─── Score mappings (1 = needs most support → 4 = fully independent) ─────────
const SCORE_MAPS: Record<string, Record<string, number>> = {
  fn_dressing:  { Independent:4, 'Needs cues':3, 'Needs hands-on help':2, Dependent:1 },
  fn_bathing:   { Independent:4, 'Needs cues':3, 'Needs help':2, Refused:1 },
  fn_toileting: { Independent:4, 'Needs help':3, 'Incontinent episode':2, Refused:1 },
  fn_transfers: { Independent:4, Supervision:3, Assist:2, Unable:1 },
  fn_mobility:  { Independent:4, Walker:3, Wheelchair:2, Bedbound:1 },
  fn_medication:{ 'Took as directed':4, Unknown:3, Missed:2, Refused:1 },
  nu_appetite:  { Normal:4, Increased:3, Decreased:2 },
  nu_meal_pct:  { '100%':4, '75%':3, '50%':2, '25%':2, '0%':1 },
  nu_fluids:    { Adequate:4, Unknown:3, Low:2, Refused:1 },
  nu_swallowing:{ 'No issues':4, Unknown:3, 'Needs soft diet':3, 'Coughing/choking':2, 'Pocketing food':2 },
  co_urinary:   { Continent:4, Unknown:3, 'Occasional accidents':2, 'Frequent accidents':1 },
  co_bowel:     { Continent:4, Unknown:3, 'Occasional accidents':2, 'Frequent accidents':1 },
  co_skin:      { None:4, Unknown:3, Redness:3, Rash:2, Breakdown:1 },
  sa_falls:     { None:4, 'Near-fall':3, 'Fall — no injury':2, 'Fall — injury':1 },
  sa_wandering: { None:4, Unknown:3, Attempted:2, 'Left home':1 },
  mo_mood:      { Calm:4, Elevated:3, Unknown:3, Labile:3, Anxious:2, Depressed:2, Irritable:2 },
  mo_social:    { Normal:4, Unknown:3, 'Seeking attention':3, Withdrawn:2, Overstimulated:2 },
  mo_sleep:     { Normal:4, Unknown:3, 'Slept too much':3, 'Slept too little':2, 'Day-night reversal':1 },
  sy_severity:  { '':4, Mild:3, Moderate:2, Severe:1 },
};

function scoreMetric(row: any, key: string): number | null {
  if (key === 'be_behaviors_count') {
    const b: string[] = row.be_behaviors || [];
    if (!b.length) return null;
    return Math.max(1, 4 - b.filter((x: string) => x !== 'None observed').length);
  }
  if (key === 'sy_symptoms_count') {
    const s: string[] = row.sy_symptoms || [];
    if (!s.length && !row.sy_other) return null;
    return Math.max(1, 4 - s.length);
  }
  const raw = row[key];
  if (!raw) return null;
  const m = SCORE_MAPS[key];
  return m ? (m[raw] ?? null) : null;
}

// ─── Section definitions with unique colors per metric ────────────────────────
interface Metric { key: string; label: string; color: string; }
interface Section {
  id: string; title: string; subtitle: string;
  icon: React.ElementType; iconBg: string;
  metrics: Metric[];
}

// Every color within a section is visually distinct
const SECTIONS: Section[] = [
  { id:'A', title:'A — Daily Function', subtitle:'Independence in daily activities',
    icon:Activity, iconBg:'bg-amber-100 text-amber-700',
    metrics:[
      { key:'fn_dressing',  label:'Dressing',   color:'#2563eb' },  // blue
      { key:'fn_bathing',   label:'Bathing',     color:'#16a34a' },  // green
      { key:'fn_toileting', label:'Toileting',   color:'#dc2626' },  // red
      { key:'fn_transfers', label:'Transfers',   color:'#7c3aed' },  // violet
      { key:'fn_mobility',  label:'Mobility',    color:'#ea580c' },  // orange
      { key:'fn_medication',label:'Medication',  color:'#0891b2' },  // cyan
    ],
  },
  { id:'B', title:'B — Nutrition & Hydration', subtitle:'Eating and drinking patterns',
    icon:Utensils, iconBg:'bg-green-100 text-green-700',
    metrics:[
      { key:'nu_appetite',   label:'Appetite',   color:'#16a34a' },  // green
      { key:'nu_meal_pct',   label:'Meal %',     color:'#ca8a04' },  // yellow
      { key:'nu_fluids',     label:'Fluids',     color:'#2563eb' },  // blue
      { key:'nu_swallowing', label:'Swallowing', color:'#dc2626' },  // red
    ],
  },
  { id:'C', title:'C — Continence', subtitle:'Bladder, bowel and skin',
    icon:Droplets, iconBg:'bg-blue-100 text-blue-700',
    metrics:[
      { key:'co_urinary', label:'Urinary',  color:'#2563eb' },  // blue
      { key:'co_bowel',   label:'Bowel',    color:'#16a34a' },  // green
      { key:'co_skin',    label:'Skin',     color:'#dc2626' },  // red
    ],
  },
  { id:'D', title:'D — Safety Events', subtitle:'Falls and wandering incidents',
    icon:Shield, iconBg:'bg-orange-100 text-orange-700',
    metrics:[
      { key:'sa_falls',     label:'Falls',     color:'#dc2626' },  // red
      { key:'sa_wandering', label:'Wandering', color:'#ea580c' },  // orange
    ],
  },
  { id:'E', title:'E — Behavior & Responsiveness', subtitle:'Observed behavioral patterns',
    icon:Brain, iconBg:'bg-purple-100 text-purple-700',
    metrics:[
      { key:'be_behaviors_count', label:'Behaviors', color:'#7c3aed' },  // violet
    ],
  },
  { id:'F', title:'F — Mood & Social Engagement', subtitle:'Emotional wellbeing and interaction',
    icon:Heart, iconBg:'bg-pink-100 text-pink-700',
    metrics:[
      { key:'mo_mood',   label:'Mood',   color:'#db2777' },  // pink
      { key:'mo_social', label:'Social', color:'#7c3aed' },  // violet
      { key:'mo_sleep',  label:'Sleep',  color:'#2563eb' },  // blue
    ],
  },
  { id:'G', title:'G — Symptoms & Comfort', subtitle:'Physical symptoms and discomfort',
    icon:ThumbsUp, iconBg:'bg-teal-100 text-teal-700',
    metrics:[
      { key:'sy_severity',       label:'Severity', color:'#dc2626' },  // red
      { key:'sy_symptoms_count', label:'Symptoms', color:'#ea580c' },  // orange
    ],
  },
];

// ─── X-axis label formatting based on filter ─────────────────────────────────
function xAxisLabel(dateStr: string, filterKey: FilterKey): string {
  const d = new Date(dateStr + 'T12:00');
  if (filterKey === '7d') return d.toLocaleDateString('en-US', { weekday: 'short' });           // Mon
  if (filterKey === '1m') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); // Apr 7
  if (filterKey === '2m') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); // Apr 7
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });                     // Apr 7
}

// Choose which date indices to label so they don't overlap
function pickLabelIndices(n: number, filterKey: FilterKey): number[] {
  const maxLabels = filterKey === '7d' ? 7 : filterKey === '1m' ? 6 : filterKey === '2m' ? 6 : 5;
  if (n <= maxLabels) return Array.from({ length: n }, (_, i) => i);
  const step = (n - 1) / (maxLabels - 1);
  return Array.from({ length: maxLabels }, (_, i) => Math.round(i * step));
}

// ─── The chart: X = dates, Y = score 0–4, one colored line per metric ────────
function SectionChart({
  section, rows, allDates, filterKey,
}: {
  section: Section; rows: any[]; allDates: string[]; filterKey: FilterKey;
}) {
  const byDate = useMemo(() => {
    const m = new Map<string, any>();
    rows.forEach(r => m.set(r.check_in_date, r));
    return m;
  }, [rows]);

  // Build per-metric time series: array of (dateIndex → score | null)
  const series = useMemo(() =>
    section.metrics.map(metric => ({
      ...metric,
      points: allDates.map((d, i) => ({
        i,
        date: d,
        score: byDate.has(d) ? scoreMetric(byDate.get(d), metric.key) : null,
      })),
    })),
    [section.metrics, allDates, byDate]
  );

  const hasData = series.some(s => s.points.some(p => p.score !== null));

  // ── SVG layout ─────────────────────────────────────────────────────────────
  // Y-axis: score 0 at bottom, 4 at top
  const Y_MIN = 0;
  const Y_MAX = 4;
  const Y_TICKS = [0, 1, 2, 3, 4];
  const Y_LABELS: Record<number, string> = { 0:'', 1:'Needs Support', 2:'Fair', 3:'Good', 4:'Excellent' };

  const PAD_L = 88;   // room for Y-axis labels
  const PAD_R = 16;
  const PAD_T = 18;
  const PAD_B = 40;   // room for X-axis labels

  // Use a viewBox that stretches to fill container width
  const VB_W = 900;
  const VB_H = 220;
  const CW   = VB_W - PAD_L - PAD_R;  // chart width
  const CH   = VB_H - PAD_T - PAD_B;  // chart height

  // Map score to Y pixel (score 4 = top, score 0 = bottom)
  const sy = (score: number) =>
    PAD_T + CH - ((score - Y_MIN) / (Y_MAX - Y_MIN)) * CH;

  // Map date index to X pixel
  const sx = (i: number) =>
    allDates.length <= 1 ? PAD_L + CW / 2 : PAD_L + (i / (allDates.length - 1)) * CW;

  const labelIdx = pickLabelIndices(allDates.length, filterKey);

  const gradId = (key: string) => 'cg' + key.replace(/[^a-z0-9]/gi, '');

  if (!hasData) {
    return (
      <div className="py-10 text-center text-sm text-medium-gray italic">
        No check-in data recorded for this period yet.
      </div>
    );
  }

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="w-full block"
        preserveAspectRatio="none"
        style={{ height: 220 }}
      >
        <defs>
          {series.map(s => (
            <linearGradient key={s.key} id={gradId(s.key)} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.02" />
            </linearGradient>
          ))}
        </defs>

        {/* ── Chart background ─────────────────────────────────── */}
        <rect x={PAD_L} y={PAD_T} width={CW} height={CH}
          fill="#fafaf8" rx="3" />

        {/* ── Y-axis grid lines and labels ─────────────────────── */}
        {Y_TICKS.filter(v => v > 0).map(v => {
          const y = sy(v);
          return (
            <g key={v}>
              <line x1={PAD_L} y1={y} x2={PAD_L + CW} y2={y}
                stroke={v === 4 ? '#d4cfc7' : '#e8e4dc'} strokeWidth={v === 4 ? 1 : 0.8}
                strokeDasharray={v === 4 ? '0' : '4,5'} />
              <text x={PAD_L - 8} y={y + 4} textAnchor="end"
                fontSize="11" fill="#9a9490" fontWeight="400">
                {v}
              </text>
              {Y_LABELS[v] && (
                <text x={PAD_L - 8} y={y + 15} textAnchor="end"
                  fontSize="8.5" fill="#b8b4ac" fontStyle="italic">
                  {Y_LABELS[v]}
                </text>
              )}
            </g>
          );
        })}

        {/* ── X-axis vertical grid lines ───────────────────────── */}
        {labelIdx.map(di => (
          <line key={di}
            x1={sx(di)} y1={PAD_T} x2={sx(di)} y2={PAD_T + CH}
            stroke="#e8e4dc" strokeWidth="0.6" strokeDasharray="3,5" />
        ))}

        {/* ── Axis borders ─────────────────────────────────────── */}
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + CH}
          stroke="#c8c4bc" strokeWidth="1.5" />
        <line x1={PAD_L} y1={PAD_T + CH} x2={PAD_L + CW} y2={PAD_T + CH}
          stroke="#c8c4bc" strokeWidth="1.5" />

        {/* ── Per-metric lines and dots ────────────────────────── */}
        {series.map(s => {
          const valid = s.points.filter(p => p.score !== null) as { i:number; date:string; score:number }[];

          // SVG path with gap handling for nulls
          const segs: string[] = [];
          let cur = '';
          s.points.forEach(p => {
            const x = sx(p.i);
            if (p.score === null) {
              if (cur) { segs.push(cur); cur = ''; }
            } else {
              const y = sy(p.score);
              cur += cur ? ` L${x.toFixed(1)},${y.toFixed(1)}` : `M${x.toFixed(1)},${y.toFixed(1)}`;
            }
          });
          if (cur) segs.push(cur);

          // Area fill
          let areaD = '';
          if (valid.length >= 2) {
            const baseY = PAD_T + CH;
            areaD = valid.map((p, i) =>
              `${i === 0 ? 'M' : 'L'}${sx(p.i).toFixed(1)},${sy(p.score).toFixed(1)}`
            ).join(' ')
              + ` L${sx(valid[valid.length - 1].i).toFixed(1)},${baseY}`
              + ` L${sx(valid[0].i).toFixed(1)},${baseY} Z`;
          }

          return (
            <g key={s.key}>
              {areaD && <path d={areaD} fill={`url(#${gradId(s.key)})`} />}
              {segs.map((d, j) => (
                <path key={j} d={d} fill="none" stroke={s.color}
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              ))}
              {s.points.map(p => {
                if (p.score === null) return null;
                const x = sx(p.i);
                const y = sy(p.score);
                return (
                  <g key={p.i}>
                    <circle cx={x} cy={y} r="7" fill={s.color} fillOpacity="0.15" />
                    <circle cx={x} cy={y} r="4" fill={s.color} stroke="white" strokeWidth="2" />
                    {/* Score label above dot */}
                    <text x={x} y={y - 9} textAnchor="middle"
                      fontSize="10" fontWeight="700" fill={s.color}>
                      {p.score}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* ── X-axis date labels ───────────────────────────────── */}
        {labelIdx.map(di => (
          <text key={di} x={sx(di)} y={PAD_T + CH + 24}
            textAnchor="middle" fontSize="11" fill="#7a7670" fontWeight="500">
            {xAxisLabel(allDates[di], filterKey)}
          </text>
        ))}
      </svg>

      {/* ── Legend: colored dot + category name ──────────────────── */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 px-1">
        {section.metrics.map(m => (
          <span key={m.key} className="flex items-center gap-1.5 text-[11px] font-medium"
            style={{ color: m.color }}>
            <svg width="10" height="10" viewBox="0 0 10 10" className="flex-shrink-0">
              <circle cx="5" cy="5" r="4" fill={m.color} />
            </svg>
            {m.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Collapsible section panel ────────────────────────────────────────────────
function SectionPanel({ section, rows, allDates, filterKey, defaultOpen }: {
  section: Section; rows: any[]; allDates: string[];
  filterKey: FilterKey; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const Icon = section.icon;

  const byDate = useMemo(() => {
    const m = new Map<string, any>();
    rows.forEach(r => m.set(r.check_in_date, r));
    return m;
  }, [rows]);

  const hasData = section.metrics.some(m =>
    allDates.some(d => byDate.has(d) && scoreMetric(byDate.get(d), m.key) !== null)
  );

  return (
    <div className="bg-white rounded-2xl border border-soft-taupe overflow-hidden shadow-sm">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50/70 transition-colors">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 ${section.iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="text-left">
            <p className="font-semibold text-charcoal text-sm">{section.title}</p>
            <p className="text-[11px] text-medium-gray mt-0.5">{section.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!hasData && (
            <span className="text-[10px] text-medium-gray bg-slate-100 px-2 py-0.5 rounded-full">
              No data
            </span>
          )}
          <svg
            className={`w-4 h-4 text-medium-gray transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-slate-100 px-5 py-4">
              <SectionChart
                section={section}
                rows={rows}
                allDates={allDates}
                filterKey={filterKey}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PatientProgressTimeline() {
  const { state } = useApp();
  const [filter, setFilter] = useState<FilterKey>('1m');
  const [rows, setRows]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const patientId = state.currentUser?.id;

  useEffect(() => {
    if (!patientId) { setLoading(false); return; }
    const days = FILTERS.find(f => f.key === filter)!.days;
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    setLoading(true);
    supabase
      .from('care_partner_checkins')
      .select('*')
      .eq('patient_id', patientId)
      .gte('check_in_date', since)
      .order('check_in_date', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setRows(data);
        setLoading(false);
      });
  }, [patientId, filter]);

  // Build date array once for the current filter
  const allDates = useMemo(() => {
    const days = FILTERS.find(f => f.key === filter)!.days;
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(Date.now() - (days - 1 - i) * 86400000);
      return d.toISOString().slice(0, 10);
    });
  }, [filter]);

  const xAxisDescription = {
    '7d': 'days of the week',
    '1m': 'dates across 30 days',
    '2m': 'dates across 2 months',
    '3m': 'dates across 3 months',
  }[filter];

  return (
    <div className="space-y-4 pb-10">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-warm-bronze to-deep-bronze rounded-2xl px-6 py-5 text-white">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <svg className="w-5 h-5 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4" />
              </svg>
              Care Partner Progress
            </h1>
            <p className="text-white/80 text-sm mt-0.5">
              Track progress over time from daily care partner check-ins
            </p>
          </div>
          {/* Filter tabs */}
          <div className="flex gap-1.5 flex-shrink-0">
            {FILTERS.map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                  filter === f.key
                    ? 'bg-white text-warm-bronze shadow-sm'
                    : 'bg-white/15 text-white hover:bg-white/25'
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Axis legend ────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-1 text-[11px] text-medium-gray">
        <span className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-warm-bronze" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h.01M12 7h.01M16 7h.01M8 17h.01M12 17h.01M16 17h.01M4 12h16" />
          </svg>
          <strong className="text-charcoal">X-axis:</strong> {xAxisDescription}
        </span>
        <span>·</span>
        <span className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-warm-bronze" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v16M4 12h16" />
          </svg>
          <strong className="text-charcoal">Y-axis:</strong> score 1 (needs support) → 4 (excellent/independent)
        </span>
      </div>

      {/* ── Sections ───────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-warm-bronze" />
        </div>
      ) : (
        <div className="space-y-3">
          {SECTIONS.map((section, i) => (
            <motion.div key={section.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}>
              <SectionPanel
                section={section}
                rows={rows}
                allDates={allDates}
                filterKey={filter}
                defaultOpen={i === 0}
              />
            </motion.div>
          ))}
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="text-center py-14 bg-white rounded-2xl border border-soft-taupe">
          <div className="w-12 h-12 bg-soft-taupe/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-soft-taupe" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4" />
            </svg>
          </div>
          <p className="font-semibold text-charcoal text-sm">No check-ins recorded in this period</p>
          <p className="text-xs text-medium-gray mt-1 max-w-xs mx-auto">
            When a Care Partner submits daily check-ins, progress graphs will appear here.
          </p>
        </div>
      )}
    </div>
  );
}