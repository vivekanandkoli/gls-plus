"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const demo = [
  { day: "Mon", stock: 40 },
  { day: "Tue", stock: 38 },
  { day: "Wed", stock: 44 },
  { day: "Thu", stock: 41 },
  { day: "Fri", stock: 47 },
] as const;

export function StockChart() {
  return (
    <div className="h-72 w-full rounded-lg border bg-card p-4">
      <div className="mb-3 text-sm font-semibold">Stock movement</div>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={[...demo]} margin={{ left: 8, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="day" />
          <YAxis />
          <Tooltip />
          <Area
            type="monotone"
            dataKey="stock"
            stroke="#B8860B"
            fill="rgba(184, 134, 11, 0.25)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

