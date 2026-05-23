"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSupabaseClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Tx = { date: string; type: "BUY" | "SELL"; rate_per_gram: number | null; weight_grams: number | null };
type Preset = "last_30d" | "last_90d" | "last_6m" | "this_year" | "custom";

function iso(d: Date) { return d.toISOString().slice(0, 10); }

function presetRange(p: Preset): [string, string] {
  const now = new Date();
  const today = iso(now);
  if (p === "last_30d") return [iso(new Date(Date.now() - 30 * 86400000)), today];
  if (p === "last_90d") return [iso(new Date(Date.now() - 90 * 86400000)), today];
  if (p === "last_6m") return [iso(new Date(now.getFullYear(), now.getMonth() - 5, 1)), today];
  if (p === "this_year") return [iso(new Date(now.getFullYear(), 0, 1)), today];
  return [iso(new Date(Date.now() - 90 * 86400000)), today];
}

function StatCard({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  className?: string;
}) {
  return (
    <Card className={cn("border-l-4", className)}>
      <CardHeader className="pb-1 pt-4">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="text-xl font-bold tracking-tight">{value}</div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function RateTrendReportPage() {
  const [preset, setPreset] = useState<Preset>("last_90d");
  const [from, setFrom] = useState<string>(() => presetRange("last_90d")[0]);
  const [to, setTo] = useState<string>(() => presetRange("last_90d")[1]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ date: string; buyRate: number | null; sellRate: number | null }[]>([]);

  const canQuery = useMemo(() => {
    try { getSupabaseClient(); return true; } catch { return false; }
  }, []);

  useEffect(() => {
    if (preset !== "custom") {
      const [f, t] = presetRange(preset);
      setFrom(f);
      setTo(t);
    }
  }, [preset]);

  useEffect(() => {
    if (!canQuery || !from || !to) return;
    const run = async () => {
      setLoading(true);
      try {
        const supabase = getSupabaseClient() as any;
        const { data: tx, error } = await supabase
          .from("transactions")
          .select("date,type,rate_per_gram,weight_grams")
          .gte("date", from)
          .lte("date", to)
          .limit(50000);
        if (error) throw error;

        // VWAP: weight each rate by the gram volume of that trade
        type Bucket = { date: string; buyWeightedSum: number; buyWeight: number; sellWeightedSum: number; sellWeight: number };
        const byDate = new Map<string, Bucket>();
        for (const r of (tx ?? []) as Tx[]) {
          const rate = typeof r.rate_per_gram === "number" ? r.rate_per_gram : null;
          const w = typeof r.weight_grams === "number" && r.weight_grams > 0 ? r.weight_grams : 1;
          if (rate === null) continue;
          const cur = byDate.get(r.date) ?? { date: r.date, buyWeightedSum: 0, buyWeight: 0, sellWeightedSum: 0, sellWeight: 0 };
          if (r.type === "BUY") { cur.buyWeightedSum += rate * w; cur.buyWeight += w; }
          else { cur.sellWeightedSum += rate * w; cur.sellWeight += w; }
          byDate.set(r.date, cur);
        }
        const points = [...byDate.values()]
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((d) => ({
            date: d.date,
            buyRate: d.buyWeight ? d.buyWeightedSum / d.buyWeight : null,
            sellRate: d.sellWeight ? d.sellWeightedSum / d.sellWeight : null,
          }));
        setData(points);
      } finally { setLoading(false); }
    };
    void run();
  }, [canQuery, from, to]);

  const stats = useMemo(() => {
    const buy = data.map((d) => d.buyRate).filter((n): n is number => n !== null);
    const sell = data.map((d) => d.sellRate).filter((n): n is number => n !== null);
    // Simple mean of daily VWAPs for the period avg (each day already VWAP-weighted internally)
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    return {
      buyMin: buy.length ? Math.min(...buy) : 0,
      buyMax: buy.length ? Math.max(...buy) : 0,
      buyAvg: avg(buy),
      sellMin: sell.length ? Math.min(...sell) : 0,
      sellMax: sell.length ? Math.max(...sell) : 0,
      sellAvg: avg(sell),
      spread: avg(sell) - avg(buy),
    };
  }, [data]);

  return (
    <PageWrapper
      title="Rate Trend"
      description="Average buy and sell rates (THB/g) over time."
    >
      {/* Filters */}
      <div className="no-print mb-6 flex flex-wrap items-end gap-3">
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Period</div>
          <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="last_30d">Last 30 days</SelectItem>
              <SelectItem value="last_90d">Last 90 days</SelectItem>
              <SelectItem value="last_6m">Last 6 months</SelectItem>
              <SelectItem value="this_year">This year</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {preset === "custom" && (
          <>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">From</div>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[160px]" />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">To</div>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[160px]" />
            </div>
          </>
        )}
        {loading && <span className="text-xs text-muted-foreground mt-5">Loading…</span>}
      </div>

      {/* KPI cards — 7 stats */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
        <StatCard label="BUY min" value={stats.buyMin ? stats.buyMin.toFixed(2) : "—"} sub="THB/g" className="border-l-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/20" />
        <StatCard label="BUY avg" value={stats.buyAvg ? stats.buyAvg.toFixed(2) : "—"} sub="THB/g" className="border-l-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/10" />
        <StatCard label="BUY max" value={stats.buyMax ? stats.buyMax.toFixed(2) : "—"} sub="THB/g" className="border-l-emerald-300 bg-emerald-50/20 dark:bg-emerald-950/5" />
        <StatCard
          label="Spread"
          value={stats.spread ? `${stats.spread > 0 ? "+" : ""}${stats.spread.toFixed(2)}` : "—"}
          sub="SELL avg − BUY avg"
          className={cn("border-l-4", stats.spread >= 0 ? "border-l-blue-500 bg-blue-50/60 dark:bg-blue-950/20" : "border-l-red-500 bg-red-50/60")}
        />
        <StatCard label="SELL min" value={stats.sellMin ? stats.sellMin.toFixed(2) : "—"} sub="THB/g" className="border-l-amber-300 bg-amber-50/20 dark:bg-amber-950/5" />
        <StatCard label="SELL avg" value={stats.sellAvg ? stats.sellAvg.toFixed(2) : "—"} sub="THB/g" className="border-l-amber-400 bg-amber-50/40 dark:bg-amber-950/10" />
        <StatCard label="SELL max" value={stats.sellMax ? stats.sellMax.toFixed(2) : "—"} sub="THB/g" className="border-l-amber-500 bg-amber-50/60 dark:bg-amber-950/20" />
      </div>

      {/* Chart */}
      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Buy vs Sell rate (THB/g)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                <Tooltip
                  formatter={(value: any, name: any) =>
                    value != null ? [`${Number(value).toFixed(2)} THB/g`, name] : ["—", name]
                  }
                />
                <Legend />
                {stats.buyAvg > 0 && (
                  <ReferenceLine y={stats.buyAvg} stroke="#16a34a" strokeDasharray="4 2" strokeOpacity={0.5} label={{ value: "BUY avg", fill: "#16a34a", fontSize: 10 }} />
                )}
                {stats.sellAvg > 0 && (
                  <ReferenceLine y={stats.sellAvg} stroke="#B8860B" strokeDasharray="4 2" strokeOpacity={0.5} label={{ value: "SELL avg", fill: "#B8860B", fontSize: 10 }} />
                )}
                <Line type="monotone" dataKey="buyRate" name="BUY rate" stroke="#16a34a" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="sellRate" name="SELL rate" stroke="#B8860B" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Daily VWAP (volume-weighted average rates)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">BUY VWAP (THB/g)</TableHead>
                  <TableHead className="text-right">SELL VWAP (THB/g)</TableHead>
                  <TableHead className="text-right">Spread</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((r) => {
                  const spread = r.sellRate !== null && r.buyRate !== null ? r.sellRate - r.buyRate : null;
                  return (
                    <TableRow key={r.date}>
                      <TableCell className="font-medium">{r.date}</TableCell>
                      <TableCell className="text-right text-emerald-700 dark:text-emerald-400">
                        {r.buyRate !== null ? r.buyRate.toFixed(2) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-amber-700 dark:text-amber-400">
                        {r.sellRate !== null ? r.sellRate.toFixed(2) : "—"}
                      </TableCell>
                      <TableCell className={cn(
                        "text-right font-medium",
                        spread === null ? "text-muted-foreground" : spread >= 0 ? "text-blue-600 dark:text-blue-400" : "text-red-600"
                      )}>
                        {spread !== null ? (spread >= 0 ? "+" : "") + spread.toFixed(2) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                      {loading ? "Loading…" : "No data for this range."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
