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
  fn_dressing: string | null;
  fn_bathing: string | null;
  fn_toileting: string | null;
  fn_transfers: string | null;
  fn_mobility: string | null;
  fn_medication: string | null;
};

type ChartPoint = {
  date: string;
  Dressing: number | null;
  Bathing: number | null;
  Toileting: number | null;
  Transfers: number | null;
  Mobility: number | null;
  Medication: number | null;
};

type Props = {
  patientId: string;
  days?: number;
};

const SCORE_MAPS: Record<string, Record<string, number>> = {
  fn_dressing:  { Independent: 0, "Needs cues": 2, "Needs hands-on help": 4, Dependent: 5 },
  fn_bathing:   { Independent: 0, "Needs cues": 2, "Needs help": 4, Refused: 5 },
  fn_toileting: { Independent: 0, "Needs help": 3, "Incontinent episode": 4, Refused: 5 },
  fn_transfers: { Independent: 0, Supervision: 2, Assist: 4, Unable: 5 },
  fn_mobility:  { Independent: 0, Walker: 2, Wheelchair: 4, Bedbound: 5 },
  fn_medication:{ "Took as directed": 0, Unknown: 2, Missed: 4, Refused: 5 },
};

function scoreMetric(row: CarePartnerCheckinRow, key: keyof CarePartnerCheckinRow): number | null {
  const raw = row[key];
  if (!raw || typeof raw !== "string") return null;
  const map = SCORE_MAPS[key as string];
  return map ? (map[raw] ?? null) : null;
}

function formatShortDate(value: string) {
  const d = new Date(value + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ADLProgressChart({ patientId, days = 30 }: Props) {
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

      const { data, error } = await supabase
        .from("care_partner_checkins")
        .select(`
          id,
          patient_id,
          check_in_date,
          fn_dressing,
          fn_bathing,
          fn_toileting,
          fn_transfers,
          fn_mobility,
          fn_medication
        `)
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
      .channel(`care-partner-checkins-${patientId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "care_partner_checkins",
          filter: `patient_id=eq.${patientId}`,
        },
        async () => {
          const { data, error } = await supabase
            .from("care_partner_checkins")
            .select(`
              id,
              patient_id,
              check_in_date,
              fn_dressing,
              fn_bathing,
              fn_toileting,
              fn_transfers,
              fn_mobility,
              fn_medication
            `)
            .eq("patient_id", patientId)
            .gte("check_in_date", startDate)
            .order("check_in_date", { ascending: true });

          if (error) {
            setError(error.message);
            return;
          }

          setRows((data ?? []) as CarePartnerCheckinRow[]);
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [patientId, startDate]);

  const chartData: ChartPoint[] = useMemo(() => {
    return rows.map((row) => ({
      date: row.check_in_date,
      Dressing: scoreMetric(row, "fn_dressing"),
      Bathing: scoreMetric(row, "fn_bathing"),
      Toileting: scoreMetric(row, "fn_toileting"),
      Transfers: scoreMetric(row, "fn_transfers"),
      Mobility: scoreMetric(row, "fn_mobility"),
      Medication: scoreMetric(row, "fn_medication"),
    }));
  }, [rows]);

  if (loading) return <div className="p-4">Loading chart...</div>;
  if (error) return <div className="p-4 text-red-600">Chart error: {error}</div>;

  return (
    <div className="rounded-2xl border bg-white p-6">
      <h3 className="mb-3 text-lg font-semibold">A — Daily Function</h3>
      <p className="mb-3 text-sm text-gray-500">0 = normal, 5 = incapable</p>

      <div className="h-[420px] w-full">
        <ResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 10, right: 24, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={formatShortDate} minTickGap={24} />
            <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} allowDecimals={false} />
            <Tooltip labelFormatter={(value) => `Date: ${formatShortDate(String(value))}`} />
            <Legend />

            <Line type="monotone" dataKey="Dressing" stroke="#2563eb" strokeWidth={3} dot />
            <Line type="monotone" dataKey="Bathing" stroke="#16a34a" strokeWidth={3} dot />
            <Line type="monotone" dataKey="Toileting" stroke="#dc2626" strokeWidth={3} dot />
            <Line type="monotone" dataKey="Transfers" stroke="#7c3aed" strokeWidth={3} dot />
            <Line type="monotone" dataKey="Mobility" stroke="#ea580c" strokeWidth={3} dot />
            <Line type="monotone" dataKey="Medication" stroke="#0891b2" strokeWidth={3} dot />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}