"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const demo = [
  { date: "Jan", rate: 100 },
  { date: "Feb", rate: 115 },
  { date: "Mar", rate: 110 },
  { date: "Apr", rate: 125 },
  { date: "May", rate: 130 },
] as const;

export function RateChart() {
  return (
    <div className="h-72 w-full rounded-lg border bg-card p-4">
      <div className="mb-3 text-sm font-semibold">Rate trend</div>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={[...demo]} margin={{ left: 8, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="rate"
            stroke="#B8860B"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

