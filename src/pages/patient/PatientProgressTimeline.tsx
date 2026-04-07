import { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import {
  Activity, Utensils, Droplets, Shield, Brain, Heart, ThumbsUp,
  Loader2, TrendingUp, ChevronDown, ChevronUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type FilterKey = '7d' | '1m' | '2m' | '3m';
const FILTERS: { key: FilterKey; label: string; days: number }[] = [
  { key: '7d', label: '1 Week',   days: 7  },
  { key: '1m', label: '1 Month',  days: 30 },
  { key: '2m', label: '2 Months', days: 60 },
  { key: '3m', label: '3 Months', days: 90 },
];

const SCORE_MAPS: Record<string, Record<string, number>> = {
  fn_dressing:  { 'Independent': 4, 'Needs cues': 3, 'Needs hands-on help': 2, 'Dependent': 1 },
  fn_bathing:   { 'Independent': 4, 'Needs cues': 3, 'Needs help': 2, 'Refused': 1 },
  fn_toileting: { 'Independent': 4, 'Needs help': 3, 'Incontinent episode': 2, 'Refused': 1 },
  fn_transfers: { 'Independent': 4, 'Supervision': 3, 'Assist': 2, 'Unable': 1 },
  fn_mobility:  { 'Independent': 4, 'Walker': 3, 'Wheelchair': 2, 'Bedbound': 1 },
  fn_medication:{ 'Took as directed': 4, 'Unknown': 3, 'Missed': 2, 'Refused': 1 },
  nu_appetite:    { 'Normal': 4, 'Increased': 3, 'Decreased': 2 },
  nu_meal_pct:    { '100%': 4, '75%': 3, '50%': 2, '25%': 2, '0%': 1 },
  nu_fluids:      { 'Adequate': 4, 'Unknown': 3, 'Low': 2, 'Refused': 1 },
  nu_swallowing:  { 'No issues': 4, 'Unknown': 3, 'Needs soft diet': 3, 'Coughing/choking': 2, 'Pocketing food': 2 },
  co_urinary: { 'Continent': 4, 'Unknown': 3, 'Occasional accidents': 2, 'Frequent accidents': 1 },
  co_bowel:   { 'Continent': 4, 'Unknown': 3, 'Occasional accidents': 2, 'Frequent accidents': 1 },
  co_skin:    { 'None': 4, 'Unknown': 3, 'Redness': 3, 'Rash': 2, 'Breakdown': 1 },
  sa_falls:     { 'None': 4, 'Near-fall': 3, 'Fall — no injury': 2, 'Fall — injury': 1 },
  sa_wandering: { 'None': 4, 'Unknown': 3, 'Attempted': 2, 'Left home': 1 },
  mo_mood:   { 'Calm': 4, 'Elevated': 3, 'Unknown': 3, 'Labile': 3, 'Anxious': 2, 'Depressed': 2, 'Irritable': 2 },
  mo_social: { 'Normal': 4, 'Unknown': 3, 'Seeking attention': 3, 'Withdrawn': 2, 'Overstimulated': 2 },
  mo_sleep:  { 'Normal': 4, 'Unknown': 3, 'Slept too much': 3, 'Slept too little': 2, 'Day-night reversal': 1 },
  sy_severity: { '': 4, 'Mild': 3, 'Moderate': 2, 'Severe': 1 },
};

interface MetricDef { key: string; label: string; color: string; }
interface SectionDef {
  id: string; title: string;
  icon: React.ElementType; iconBg: string; accentColor: string;
  metrics: MetricDef[];
}

const SECTIONS: SectionDef[] = [
  {
    id: 'A', title: 'A — Daily Function',
    icon: Activity, iconBg: 'bg-warm-amber/20 text-warm-bronze', accentColor: '#c8965a',
    metrics: [
      { key: 'fn_dressing',  label: 'Dressing',   color: '#6baed6' },
      { key: 'fn_bathing',   label: 'Bathing',    color: '#74c476' },
      { key: 'fn_toileting', label: 'Toileting',  color: '#fd8d3c' },
      { key: 'fn_transfers', label: 'Transfers',  color: '#9e9ac8' },
      { key: 'fn_mobility',  label: 'Mobility',   color: '#e7298a' },
      { key: 'fn_medication',label: 'Medication', color: '#41b6c4' },
    ],
  },
  {
    id: 'B', title: 'B — Nutrition & Hydration',
    icon: Utensils, iconBg: 'bg-green-100 text-green-700', accentColor: '#41ab5d',
    metrics: [
      { key: 'nu_appetite',   label: 'Appetite',   color: '#74c476' },
      { key: 'nu_meal_pct',   label: 'Meal Eaten', color: '#fd8d3c' },
      { key: 'nu_fluids',     label: 'Fluids',     color: '#6baed6' },
      { key: 'nu_swallowing', label: 'Swallowing', color: '#9e9ac8' },
    ],
  },
  {
    id: 'C', title: 'C — Continence',
    icon: Droplets, iconBg: 'bg-blue-100 text-blue-700', accentColor: '#3182bd',
    metrics: [
      { key: 'co_urinary', label: 'Urinary', color: '#6baed6' },
      { key: 'co_bowel',   label: 'Bowel',   color: '#74c476' },
      { key: 'co_skin',    label: 'Skin',    color: '#fd8d3c' },
    ],
  },
  {
    id: 'D', title: 'D — Safety Events',
    icon: Shield, iconBg: 'bg-orange-100 text-orange-700', accentColor: '#e6550d',
    metrics: [
      { key: 'sa_falls',     label: 'Falls',     color: '#e05c5c' },
      { key: 'sa_wandering', label: 'Wandering', color: '#fd8d3c' },
    ],
  },
  {
    id: 'E', title: 'E — Behavior & Responsiveness',
    icon: Brain, iconBg: 'bg-purple-100 text-purple-700', accentColor: '#756bb1',
    metrics: [
      { key: 'be_behaviors_count', label: 'Behaviors', color: '#9e9ac8' },
    ],
  },
  {
    id: 'F', title: 'F — Mood & Social Engagement',
    icon: Heart, iconBg: 'bg-pink-100 text-pink-700', accentColor: '#e7298a',
    metrics: [
      { key: 'mo_mood',   label: 'Mood',   color: '#e7298a' },
      { key: 'mo_social', label: 'Social', color: '#9e9ac8' },
      { key: 'mo_sleep',  label: 'Sleep',  color: '#6baed6' },
    ],
  },
  {
    id: 'G', title: 'G — Symptoms & Comfort',
    icon: ThumbsUp, iconBg: 'bg-soft-sage/20 text-green-700', accentColor: '#31a354',
    metrics: [
      { key: 'sy_severity',       label: 'Severity', color: '#e05c5c' },
      { key: 'sy_symptoms_count', label: 'Symptoms', color: '#fd8d3c' },
    ],
  },
];

function scoreMetric(row: any, key: string): number | null {
  if (key === 'be_behaviors_count') {
    const b: string[] = row.be_behaviors || [];
    if (b.length === 0) return null;
    return Math.max(1, 4 - b.filter((x: string) => x !== 'None observed').length);
  }
  if (key === 'sy_symptoms_count') {
    const s: string[] = row.sy_symptoms || [];
    if (s.length === 0 && !row.sy_other) return null;
    return Math.max(1, 4 - s.length);
  }
  const raw = row[key];
  if (!raw) return null;
  const map = SCORE_MAPS[key];
  return map ? (map[raw] ?? null) : null;
}

// One combined graph: Y-axis rows = metric names, X-axis = dates, lines per metric
function SectionGraph({ section, rows, allDates }: {
  section: SectionDef; rows: any[]; allDates: string[];
}) {
  const byDate = useMemo(() => {
    const m = new Map<string, any>();
    rows.forEach(r => m.set(r.check_in_date, r));
    return m;
  }, [rows]);

  const metricSeries = useMemo(() =>
    section.metrics.map(m => ({
      ...m,
      scores: allDates.map(d => byDate.has(d) ? scoreMetric(byDate.get(d), m.key) : null),
    })),
    [section.metrics, allDates, byDate]
  );

  const hasData = metricSeries.some(m => m.scores.some(s => s !== null));

  if (!hasData) {
    return (
      <div className="py-8 text-center text-sm text-medium-gray italic">
        No check-in data for this period yet.
      </div>
    );
  }

  const N = section.metrics.length;
  const ROW_H = 46;
  const LEFT_W = 84;
  const RIGHT_PAD = 14;
  const TOP_PAD = 10;
  const BOT_PAD = 26;
  const CHART_W = 300;
  const SVG_W = LEFT_W + CHART_W + RIGHT_PAD;
  const SVG_H = TOP_PAD + N * ROW_H + BOT_PAD;

  const xOf = (i: number) =>
    allDates.length <= 1 ? CHART_W / 2 : (i / (allDates.length - 1)) * CHART_W;

  const yCentre = (mi: number) => TOP_PAD + mi * ROW_H + ROW_H / 2;

  // Map score 1-4 to y within the row band (leave 6px margin top/bottom)
  const yOfScore = (mi: number, s: number) => {
    const top = TOP_PAD + mi * ROW_H + 6;
    const bot = TOP_PAD + mi * ROW_H + ROW_H - 6;
    return bot - ((s - 1) / 3) * (bot - top);
  };

  // Up to 5 x-axis labels
  const nLabels = Math.min(allDates.length, allDates.length <= 7 ? allDates.length : 5);
  const xLabelIdx = Array.from({ length: nLabels }, (_, i) =>
    Math.round(i * (allDates.length - 1) / Math.max(nLabels - 1, 1))
  );

  const gid = (key: string) => `g${key.replace(/[^a-z0-9]/gi, '')}`;

  return (
    <div className="overflow-x-auto -mx-1">
      <svg width={SVG_W} height={SVG_H} className="block mx-auto">
        <defs>
          {metricSeries.map(m => (
            <linearGradient key={m.key} id={gid(m.key)} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={m.color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={m.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {/* Row backgrounds + separators + Y-axis labels */}
        {section.metrics.map((m, mi) => {
          const rowTop = TOP_PAD + mi * ROW_H;
          const yc = yCentre(mi);
          return (
            <g key={m.key}>
              {mi % 2 === 1 && (
                <rect x={LEFT_W} y={rowTop} width={CHART_W + RIGHT_PAD} height={ROW_H}
                  fill="rgba(0,0,0,0.016)" />
              )}
              <line x1={LEFT_W} y1={rowTop} x2={LEFT_W + CHART_W + RIGHT_PAD} y2={rowTop}
                stroke="#ece8e0" strokeWidth="1" />
              {/* mid-row dashed guide */}
              <line x1={LEFT_W} y1={yc} x2={LEFT_W + CHART_W} y2={yc}
                stroke="#ece8e0" strokeWidth="0.5" strokeDasharray="3,5" />
              {/* colour dot */}
              <circle cx={LEFT_W - 10} cy={yc} r="3.5" fill={m.color} />
              {/* label */}
              <text x={LEFT_W - 17} y={yc + 4} textAnchor="end"
                fontSize="10" fontWeight="500" fill="#706b65">{m.label}</text>
            </g>
          );
        })}
        {/* Bottom separator */}
        <line x1={LEFT_W} y1={TOP_PAD + N * ROW_H}
          x2={LEFT_W + CHART_W + RIGHT_PAD} y2={TOP_PAD + N * ROW_H}
          stroke="#ece8e0" strokeWidth="1" />

        {/* Vertical date grid lines */}
        {xLabelIdx.map(di => (
          <line key={di}
            x1={LEFT_W + xOf(di)} y1={TOP_PAD}
            x2={LEFT_W + xOf(di)} y2={TOP_PAD + N * ROW_H}
            stroke="#ece8e0" strokeWidth="0.5" strokeDasharray="2,5" />
        ))}

        {/* Lines + dots per metric */}
        {metricSeries.map((m, mi) => {
          const pts = m.scores.map((s, i) => ({
            x: LEFT_W + xOf(i),
            y: s !== null ? yOfScore(mi, s) : null,
            s,
          }));

          // Build path string with gaps at nulls
          const segments: string[] = [];
          let cur = '';
          pts.forEach(pt => {
            if (pt.y === null) {
              if (cur) { segments.push(cur); cur = ''; }
            } else {
              cur += cur ? ` L${pt.x.toFixed(1)},${pt.y.toFixed(1)}` : `M${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
            }
          });
          if (cur) segments.push(cur);

          // Area fill
          const valid = pts.filter(p => p.y !== null) as { x: number; y: number }[];
          const rowBot = TOP_PAD + mi * ROW_H + ROW_H - 6;
          let area = '';
          if (valid.length >= 2) {
            area = valid.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
              + ` L${valid[valid.length - 1].x.toFixed(1)},${rowBot}`
              + ` L${valid[0].x.toFixed(1)},${rowBot} Z`;
          }

          return (
            <g key={m.key}>
              {area && <path d={area} fill={`url(#${gid(m.key)})`} />}
              {segments.map((d, i) => (
                <path key={i} d={d} fill="none" stroke={m.color}
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              ))}
              {pts.map((pt, i) => pt.y !== null ? (
                <g key={i}>
                  <circle cx={pt.x} cy={pt.y as number} r="5" fill={m.color} opacity="0.15" />
                  <circle cx={pt.x} cy={pt.y as number} r="3" fill={m.color} stroke="white" strokeWidth="1.5" />
                </g>
              ) : null)}
            </g>
          );
        })}

        {/* X-axis date labels */}
        {xLabelIdx.map(di => (
          <text key={di}
            x={LEFT_W + xOf(di)} y={TOP_PAD + N * ROW_H + 18}
            textAnchor="middle" fontSize="9" fill="#9a9490">
            {new Date(allDates[di] + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </text>
        ))}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 pl-2">
        {section.metrics.map(m => (
          <span key={m.key} className="flex items-center gap-1 text-[10px] text-medium-gray">
            <span className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0" style={{ background: m.color }} />
            {m.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function SectionPanel({ section, rows, filter }: {
  section: SectionDef; rows: any[]; filter: FilterKey;
}) {
  const [open, setOpen] = useState(false);
  const days = FILTERS.find(f => f.key === filter)!.days;

  const allDates = useMemo(() => {
    const list: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      list.push(d.toISOString().slice(0, 10));
    }
    return list;
  }, [days]);

  const byDate = useMemo(() => {
    const m = new Map<string, any>();
    rows.forEach(r => m.set(r.check_in_date, r));
    return m;
  }, [rows]);

  const hasData = section.metrics.some(m =>
    allDates.some(d => byDate.has(d) && scoreMetric(byDate.get(d), m.key) !== null)
  );

  const Icon = section.icon;

  return (
    <div className="bg-white rounded-2xl border border-soft-taupe overflow-hidden shadow-sm">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-soft-taupe/10 transition-colors">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 ${section.iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
            <Icon className="w-5 h-5" />
          </div>
          <span className="font-semibold text-charcoal text-sm">{section.title}</span>
        </div>
        <div className="flex items-center gap-2">
          {!hasData && (
            <span className="text-[10px] text-medium-gray bg-soft-taupe/30 px-2 py-0.5 rounded-full">No data</span>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-medium-gray" /> : <ChevronDown className="w-4 h-4 text-medium-gray" />}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-5 pt-3 border-t border-soft-taupe">
              <SectionGraph section={section} rows={rows} allDates={allDates} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PatientProgressTimeline() {
  const { state } = useApp();
  const [filter, setFilter] = useState<FilterKey>('1m');
  const [rows, setRows] = useState<any[]>([]);
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

  return (
    <div className="space-y-5 pb-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="bg-gradient-to-r from-warm-bronze via-warm-bronze to-deep-bronze rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Patient Progress Timeline</h1>
            <p className="text-white/90 text-sm mt-1">Track progress over time from daily care partner check-ins</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold">{rows.length}</p>
            <p className="text-white/80 text-xs font-medium">check-in{rows.length !== 1 ? 's' : ''} in period</p>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`flex-1 text-xs py-2 rounded-xl font-semibold transition-all ${
                filter === f.key ? 'bg-white text-warm-bronze shadow-sm' : 'bg-white/20 text-white/90 hover:bg-white/30'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </motion.div>

      <div className="bg-white rounded-2xl border border-soft-taupe px-4 py-3 shadow-sm flex items-start gap-3">
        <TrendingUp className="w-4 h-4 text-warm-bronze flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-medium-gray leading-snug">
          Each section has <strong className="text-charcoal">one graph</strong>. The <strong className="text-charcoal">Y-axis rows</strong> are the individual topics (e.g. Dressing, Bathing…).
          Lines track scores over time — <span className="font-medium" style={{ color: '#41ab5d' }}>higher = more independent / better</span>. Tap a section to expand.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-warm-bronze" />
        </div>
      ) : (
        <div className="space-y-3">
          {SECTIONS.map((section, i) => (
            <motion.div key={section.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <SectionPanel section={section} rows={rows} filter={filter} />
            </motion.div>
          ))}
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="text-center py-12 bg-white rounded-2xl border border-soft-taupe">
          <TrendingUp className="w-12 h-12 mx-auto mb-3 text-soft-taupe" />
          <p className="font-semibold text-charcoal">No check-ins yet for this period</p>
          <p className="text-sm text-medium-gray mt-1">Care Partner daily check-ins will appear here as graphs over time.</p>
        </div>
      )}
    </div>
  );
}
