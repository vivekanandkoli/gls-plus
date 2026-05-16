"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const demo = [
  { month: "Jan", volume: 12 },
  { month: "Feb", volume: 18 },
  { month: "Mar", volume: 15 },
  { month: "Apr", volume: 22 },
] as const;

export function VolumeChart() {
  return (
    <div className="h-72 w-full rounded-lg border bg-card p-4">
      <div className="mb-3 text-sm font-semibold">Monthly volume</div>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={[...demo]} margin={{ left: 8, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="volume" fill="#B8860B" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

