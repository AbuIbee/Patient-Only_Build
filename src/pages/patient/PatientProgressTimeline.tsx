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

// CORRECTED: X-axis = timeline (dates), Y-axis = categories (metrics)
// Each metric gets its own line across time
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

  const N = allDates.length; // X-axis points
  const M = section.metrics.length; // Y-axis rows (categories)
  
  // Chart dimensions
  const LEFT_MARGIN = 72;  // Space for Y-axis labels (category names)
  const RIGHT_MARGIN = 16;
  const TOP_MARGIN = 16;
  const BOTTOM_MARGIN = 32; // Space for X-axis date labels
  const ROW_HEIGHT = 38;     // Height per category row
  
  const CHART_WIDTH = 420;   // Width of the plotting area
  const TOTAL_WIDTH = LEFT_MARGIN + CHART_WIDTH + RIGHT_MARGIN;
  const TOTAL_HEIGHT = TOP_MARGIN + M * ROW_HEIGHT + BOTTOM_MARGIN;
  
  // X position for each date (timeline)
  const xPos = (idx: number) => 
    N === 1 ? CHART_WIDTH / 2 : (idx / (N - 1)) * CHART_WIDTH;
  
  // Y position for each category row center
  const yCenter = (metricIdx: number) => 
    TOP_MARGIN + metricIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
  
  // Y position for a specific score value within a row (1-4 scale)
  const yForScore = (metricIdx: number, score: number) => {
    const rowTop = TOP_MARGIN + metricIdx * ROW_HEIGHT;
    const rowBottom = rowTop + ROW_HEIGHT;
    // Score 4 = top of row, Score 1 = bottom of row
    return rowBottom - ((score - 1) / 3) * ROW_HEIGHT;
  };

  // Select which dates to show labels for (max 6)
  const labelIndices = [];
  if (N <= 6) {
    for (let i = 0; i < N; i++) labelIndices.push(i);
  } else {
    const step = (N - 1) / 5;
    for (let i = 0; i <= 5; i++) {
      labelIndices.push(Math.round(i * step));
    }
  }

  // Score legend (1-4)
  const scoreLabels = [
    { value: 4, label: 'Excellent', y: TOP_MARGIN - 8 },
    { value: 3, label: 'Good', y: TOP_MARGIN + (ROW_HEIGHT * M) / 4 - 8 },
    { value: 2, label: 'Fair', y: TOP_MARGIN + (ROW_HEIGHT * M) / 2 - 8 },
    { value: 1, label: 'Needs Support', y: TOP_MARGIN + (ROW_HEIGHT * M) * 0.75 - 8 },
  ];

  return (
    <div className="overflow-x-auto">
      <svg width={TOTAL_WIDTH} height={TOTAL_HEIGHT} className="block mx-auto" style={{ fontFamily: 'system-ui, sans-serif' }}>
        
        {/* Background grid - horizontal lines between rows */}
        {Array.from({ length: M + 1 }, (_, i) => {
          const y = TOP_MARGIN + i * ROW_HEIGHT;
          return (
            <line
              key={`grid-${i}`}
              x1={LEFT_MARGIN}
              y1={y}
              x2={LEFT_MARGIN + CHART_WIDTH}
              y2={y}
              stroke="#e5e0d5"
              strokeWidth="0.8"
              strokeDasharray={i === 0 || i === M ? "0" : "4,4"}
            />
          );
        })}
        
        {/* Vertical grid lines for dates */}
        {labelIndices.map(idx => {
          const x = LEFT_MARGIN + xPos(idx);
          return (
            <line
              key={`vline-${idx}`}
              x1={x}
              y1={TOP_MARGIN}
              x2={x}
              y2={TOP_MARGIN + M * ROW_HEIGHT}
              stroke="#e5e0d5"
              strokeWidth="0.5"
              strokeDasharray="3,3"
            />
          );
        })}
        
        {/* Y-axis category labels */}
        {section.metrics.map((metric, idx) => {
          const y = yCenter(idx);
          return (
            <g key={metric.key}>
              {/* Color dot */}
              <circle cx={LEFT_MARGIN - 12} cy={y} r="4" fill={metric.color} />
              {/* Label text */}
              <text
                x={LEFT_MARGIN - 18}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fontWeight="500"
                fill="#5a5a5a"
              >
                {metric.label}
              </text>
            </g>
          );
        })}
        
        {/* Score value guide lines (horizontal dotted lines within each row) */}
        {[1, 2, 3, 4].map(score => {
          const y = TOP_MARGIN + M * ROW_HEIGHT - ((score - 1) / 3) * (M * ROW_HEIGHT);
          return (
            <line
              key={`score-guide-${score}`}
              x1={LEFT_MARGIN - 25}
              y1={y}
              x2={LEFT_MARGIN - 5}
              y2={y}
              stroke="#c0c0c0"
              strokeWidth="0.5"
              strokeDasharray="2,2"
            />
          );
        })}
        
        {/* Score legend on left side */}
        <text x={LEFT_MARGIN - 45} y={scoreLabels[0].y} fontSize="8" fill="#888" textAnchor="start">↑ Better</text>
        {scoreLabels.map(s => (
          <text key={s.value} x={LEFT_MARGIN - 42} y={s.y} fontSize="7" fill="#999" textAnchor="start">
            {s.label}
          </text>
        ))}
        
        {/* Draw lines and points for each metric */}
        {metricSeries.map((metric, metricIdx) => {
          // Build line path
          let pathD = '';
          let firstPoint = true;
          
          metric.scores.forEach((score, dateIdx) => {
            if (score !== null) {
              const x = LEFT_MARGIN + xPos(dateIdx);
              const y = yForScore(metricIdx, score);
              if (firstPoint) {
                pathD += `M ${x} ${y}`;
                firstPoint = false;
              } else {
                pathD += ` L ${x} ${y}`;
              }
            } else if (!firstPoint) {
              // Break the line on null values
              pathD += ` M ${LEFT_MARGIN + xPos(dateIdx)} ${yForScore(metricIdx, 2.5)}`; // temporary, will be overwritten
            }
          });
          
          // Area under the line
          let areaD = '';
          const validPoints: { x: number; y: number }[] = [];
          metric.scores.forEach((score, dateIdx) => {
            if (score !== null) {
              validPoints.push({
                x: LEFT_MARGIN + xPos(dateIdx),
                y: yForScore(metricIdx, score),
              });
            }
          });
          
          if (validPoints.length >= 2) {
            const bottomY = TOP_MARGIN + (metricIdx + 1) * ROW_HEIGHT;
            areaD = validPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') +
              ` L ${validPoints[validPoints.length - 1].x} ${bottomY}` +
              ` L ${validPoints[0].x} ${bottomY} Z`;
          }
          
          return (
            <g key={metric.key}>
              {/* Area fill */}
              {areaD && (
                <path
                  d={areaD}
                  fill={metric.color}
                  fillOpacity="0.12"
                />
              )}
              {/* Line */}
              {pathD && (
                <path
                  d={pathD}
                  fill="none"
                  stroke={metric.color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {/* Data points */}
              {metric.scores.map((score, dateIdx) => {
                if (score === null) return null;
                const x = LEFT_MARGIN + xPos(dateIdx);
                const y = yForScore(metricIdx, score);
                return (
                  <g key={`${metric.key}-${dateIdx}`}>
                    <circle cx={x} cy={y} r="5" fill={metric.color} fillOpacity="0.2" />
                    <circle cx={x} cy={y} r="3" fill={metric.color} stroke="white" strokeWidth="1.5" />
                  </g>
                );
              })}
            </g>
          );
        })}
        
        {/* X-axis date labels */}
        {labelIndices.map(idx => {
          const x = LEFT_MARGIN + xPos(idx);
          const date = allDates[idx];
          const formatted = new Date(date + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          return (
            <text
              key={`xlabel-${idx}`}
              x={x}
              y={TOP_MARGIN + M * ROW_HEIGHT + 18}
              textAnchor="middle"
              fontSize="9"
              fill="#888"
            >
              {formatted}
            </text>
          );
        })}
        
        {/* X-axis label line */}
        <line
          x1={LEFT_MARGIN}
          y1={TOP_MARGIN + M * ROW_HEIGHT}
          x2={LEFT_MARGIN + CHART_WIDTH}
          y2={TOP_MARGIN + M * ROW_HEIGHT}
          stroke="#ccc"
          strokeWidth="1"
        />
        
        {/* Y-axis line */}
        <line
          x1={LEFT_MARGIN}
          y1={TOP_MARGIN}
          x2={LEFT_MARGIN}
          y2={TOP_MARGIN + M * ROW_HEIGHT}
          stroke="#ccc"
          strokeWidth="1"
        />
      </svg>
      
      {/* Color legend for metrics */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 pl-2">
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
          Each graph shows <strong className="text-charcoal">progress over time</strong>. The <strong className="text-charcoal">Y-axis rows</strong> are the individual topics (e.g. Dressing, Bathing…).
          Lines track scores across dates — <span className="font-medium" style={{ color: '#41ab5d' }}>higher = more independent / better</span>. Tap a section to expand.
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