import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { supabase } from "@/lib/supabase";

type CarePartnerCheckinRow = {
  id: string;
  patient_id: string;
  check_in_date: string;
  [key: string]: any;
};

type MetricConfig = {
  key: string;
  label: string;
  color: string;
};

type ChartPoint = {
  date: string;
  [key: string]: string | number | null;
};

type Props = {
  title: string;
  patientId: string;
  metrics: MetricConfig[];
  days?: number;
};

const SCORE_MAPS: Record<string, Record<string, number>> = {
  fn_dressing: { Independent: 0, "Needs cues": 2, "Needs hands-on help": 4, Dependent: 5 },
  fn_bathing: { Independent: 0, "Needs cues": 2, "Needs help": 4, Refused: 5 },
  fn_toileting: { Independent: 0, "Needs help": 3, "Incontinent episode": 4, Refused: 5 },
  fn_transfers: { Independent: 0, Supervision: 2, Assist: 4, Unable: 5 },
  fn_mobility: { Independent: 0, Walker: 2, Wheelchair: 4, Bedbound: 5 },
  fn_medication: { "Took as directed": 0, Unknown: 2, Missed: 4, Refused: 5 },

  nu_appetite: { Normal: 0, Increased: 1, Decreased: 3 },
  nu_meal_pct: { "100%": 0, "75%": 1, "50%": 3, "25%": 4, "0%": 5 },
  nu_fluids: { Adequate: 0, Unknown: 2, Low: 4, Refused: 5 },
  nu_swallowing: { "No issues": 0, Unknown: 2, "Needs soft diet": 3, "Coughing/choking": 5, "Pocketing food": 4 },

  co_urinary: { Continent: 0, Unknown: 2, "Occasional accidents": 3, "Frequent accidents": 5 },
  co_bowel: { Continent: 0, Unknown: 2, "Occasional accidents": 3, "Frequent accidents": 5 },
  co_skin: { None: 0, Unknown: 2, Redness: 2, Rash: 3, Breakdown: 5 },

  sa_falls: { None: 0, "Near-fall": 2, "Fall — no injury": 4, "Fall — injury": 5 },
  sa_wandering: { None: 0, Unknown: 2, Attempted: 3, "Left home": 5 },

  mo_mood: { Calm: 0, Elevated: 1, Unknown: 2, Labile: 3, Anxious: 4, Depressed: 4, Irritable: 4 },
  mo_social: { Normal: 0, Unknown: 2, "Seeking attention": 2, Withdrawn: 4, Overstimulated: 4 },
  mo_sleep: { Normal: 0, Unknown: 2, "Slept too much": 2, "Slept too little": 3, "Day-night reversal": 5 },

  sy_severity: { Mild: 2, Moderate: 4, Severe: 5 },
};

function scoreMetric(row: CarePartnerCheckinRow, key: string): number | null {
  if (key === "be_behaviors") {
    const arr: string[] = row.be_behaviors || [];
    const filtered = arr.filter((x) => x !== "None observed");
    if (!filtered.length) return 0;
    return Math.min(5, filtered.length + 1);
  }

  if (key === "sy_symptoms") {
    const arr: string[] = row.sy_symptoms || [];
    if (!arr.length) return 0;
    return Math.min(5, arr.length);
  }

  if (key === "sa_safety_concerns") {
    return row.sa_safety_concerns ? 4 : 0;
  }

  const raw = row[key];
  if (!raw || typeof raw !== "string") return null;

  const map = SCORE_MAPS[key];
  return map ? (map[raw] ?? null) : null;
}

function formatShortDate(value: string) {
  const d = new Date(value + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ADLProgressChart({
  title,
  patientId,
  metrics,
  days = 30,
}: Props) {
  const [rows, setRows] = useState<CarePartnerCheckinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const startDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }, [days]);

  useEffect(() => {
    if (!patientId) return;

    let active = true;

    async function loadRows() {
      setLoading(true);
      setError(null);

      const fields = [
        "id",
        "patient_id",
        "check_in_date",
        ...metrics.map((m) => m.key),
      ];

      const { data, error } = await supabase
        .from("care_partner_checkins")
        .select(fields.join(","))
        .eq("patient_id", patientId)
        .gte("check_in_date", startDate)
        .order("check_in_date", { ascending: true });

      if (!active) return;

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      setRows((data ?? []) as CarePartnerCheckinRow[]);
      setLoading(false);
    }

    loadRows();

    const channel = supabase
      .channel(`care-partner-checkins-${patientId}-${title}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "care_partner_checkins",
          filter: `patient_id=eq.${patientId}`,
        },
        loadRows
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [patientId, startDate, metrics, title]);

  const chartData: ChartPoint[] = useMemo(() => {
    return rows.map((row) => {
      const point: ChartPoint = { date: row.check_in_date };

      metrics.forEach((metric) => {
        point[metric.label] = scoreMetric(row, metric.key);
      });

      return point;
    });
  }, [rows, metrics]);

  if (loading) return <div className="p-4">Loading chart...</div>;
  if (error) return <div className="p-4 text-red-600">Chart error: {error}</div>;

  return (
    <div className="rounded-2xl border bg-white p-6">
      <h3 className="mb-3 text-lg font-semibold">{title}</h3>
      <p className="mb-3 text-sm text-gray-500">0 = normal, 5 = incapable</p>

      <div className="h-[420px] w-full">
        <ResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 10, right: 24, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={formatShortDate} minTickGap={24} />
            <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} allowDecimals={false} />
            <Tooltip labelFormatter={(value) => `Date: ${formatShortDate(String(value))}`} />
            <Legend />
            {metrics.map((metric) => (
              <Line
                key={metric.key}
                type="monotone"
                dataKey={metric.label}
                stroke={metric.color}
                strokeWidth={3}
                dot
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}