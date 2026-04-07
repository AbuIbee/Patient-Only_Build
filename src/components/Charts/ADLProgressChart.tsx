import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ResponsiveContainer
} from "recharts";

const data = [
  { date: "Wed", Dressing: 0, Bathing: 1, Toileting: 0, Transfers: 1, Mobility: 1, Medication: 0 },
  { date: "Thu", Dressing: 1, Bathing: 1, Toileting: 1, Transfers: 2, Mobility: 1, Medication: 1 },
  { date: "Fri", Dressing: 1, Bathing: 2, Toileting: 1, Transfers: 2, Mobility: 2, Medication: 1 },
  { date: "Sat", Dressing: 2, Bathing: 2, Toileting: 2, Transfers: 3, Mobility: 2, Medication: 1 },
  { date: "Sun", Dressing: 2, Bathing: 3, Toileting: 2, Transfers: 3, Mobility: 3, Medication: 2 },
  { date: "Mon", Dressing: 3, Bathing: 3, Toileting: 3, Transfers: 4, Mobility: 3, Medication: 2 },
  { date: "Tue", Dressing: 4, Bathing: 4, Toileting: 3, Transfers: 4, Mobility: 4, Medication: 3 }
];

export default function ADLProgressChart() {
  return (
    <div className="w-full h-[400px]">
      <ResponsiveContainer>
        <LineChart data={data}>
          
          <CartesianGrid strokeDasharray="3 3" />

          <XAxis dataKey="date" />

          <YAxis
            domain={[0,5]}
            ticks={[0,1,2,3,4,5]}
            label={{
              value: "Function Level",
              angle: -90,
              position: "insideLeft"
            }}
          />

          <Tooltip />
          <Legend />

          <Line type="monotone" dataKey="Dressing" stroke="#2563eb" strokeWidth={3}/>
          <Line type="monotone" dataKey="Bathing" stroke="#22c55e" strokeWidth={3}/>
          <Line type="monotone" dataKey="Toileting" stroke="#ef4444" strokeWidth={3}/>
          <Line type="monotone" dataKey="Transfers" stroke="#8b5cf6" strokeWidth={3}/>
          <Line type="monotone" dataKey="Mobility" stroke="#f97316" strokeWidth={3}/>
          <Line type="monotone" dataKey="Medication" stroke="#06b6d4" strokeWidth={3}/>

        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}