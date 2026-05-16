"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
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

type Ledger = { date: string; balance_grams: number };
type Preset = "last_30d" | "last_90d" | "last_6m" | "this_year" | "custom";

function iso(d: Date) { return d.toISOString().slice(0, 10); }
function presetRange(p: Preset): [string, string] {
  const now = new Date(); const today = iso(now);
  if (p === "last_30d") return [iso(new Date(Date.now() - 30 * 86400000)), today];
  if (p === "last_90d") return [iso(new Date(Date.now() - 90 * 86400000)), today];
  if (p === "last_6m") return [iso(new Date(now.getFullYear(), now.getMonth() - 5, 1)), today];
  if (p === "this_year") return [iso(new Date(now.getFullYear(), 0, 1)), today];
  return [iso(new Date(Date.now() - 90 * 86400000)), today];
}

function KpiCard({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <Card className={cn("border-l-4", className)}>
      <CardHeader className="pb-1 pt-4">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function StockMovementReportPage() {
  const [preset, setPreset] = useState<Preset>("last_90d");
  const [from, setFrom] = useState<string>(() => presetRange("last_90d")[0]);
  const [to, setTo] = useState<string>(() => presetRange("last_90d")[1]);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Ledger[]>([]);

  const canQuery = useMemo(() => {
    try { getSupabaseClient(); return true; } catch { return false; }
  }, []);

  useEffect(() => {
    if (preset !== "custom") {
      const [f, t] = presetRange(preset);
      setFrom(f); setTo(t);
    }
  }, [preset]);

  useEffect(() => {
    if (!canQuery || !from || !to) return;
    const run = async () => {
      setLoading(true);
      try {
        const supabase = getSupabaseClient() as any;
        const { data, error } = await supabase
          .from("stock_ledger")
          .select("date,balance_grams,created_at")
          .gte("date", from).lte("date", to)
          .order("date", { ascending: true })
          .order("created_at", { ascending: true })
          .limit(100000);
        if (error) throw error;

        const points: Ledger[] = (data ?? [])
          .map((r: any) => ({ date: r.date, balance_grams: typeof r.balance_grams === "number" ? r.balance_grams : 0 }))
          .reduce((acc: Ledger[], cur: Ledger) => {
            const last = acc[acc.length - 1];
            if (last?.date === cur.date) acc[acc.length - 1] = cur;
            else acc.push(cur);
            return acc;
          }, []);
        setRows(points);
      } finally { setLoading(false); }
    };
    void run();
  }, [canQuery, from, to]);

  const stats = useMemo(() => {
    if (!rows.length) return { min: null as Ledger | null, max: null as Ledger | null, current: null as Ledger | null, change: 0 };
    let min = rows[0], max = rows[0];
    for (const r of rows) {
      if (r.balance_grams < min.balance_grams) min = r;
      if (r.balance_grams > max.balance_grams) max = r;
    }
    const current = rows[rows.length - 1];
    const change = rows.length >= 2 ? current.balance_grams - rows[0].balance_grams : 0;
    return { min, max, current, change };
  }, [rows]);

  return (
    <PageWrapper title="Stock Movement">
      {/* Filters */}
      <div className="no-print mb-6 flex flex-wrap items-end gap-3">
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Period</div>
          <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
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

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Current Balance"
          value={stats.current ? `${stats.current.balance_grams.toLocaleString()} g` : "—"}
          sub={stats.current ? `as of ${stats.current.date}` : ""}
          className="border-l-amber-500 bg-amber-50/60 dark:bg-amber-950/20"
        />
        <KpiCard
          label="Net Change"
          value={stats.change !== 0 ? `${stats.change >= 0 ? "+" : ""}${stats.change.toLocaleString()} g` : "0 g"}
          sub="over selected period"
          className={cn("border-l-4", stats.change >= 0 ? "border-l-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/20" : "border-l-red-500 bg-red-50/60 dark:bg-red-950/20")}
        />
        <KpiCard
          label="Peak Balance"
          value={stats.max ? `${stats.max.balance_grams.toLocaleString()} g` : "—"}
          sub={stats.max ? `on ${stats.max.date}` : ""}
          className="border-l-blue-500 bg-blue-50/60 dark:bg-blue-950/20"
        />
        <KpiCard
          label="Lowest Balance"
          value={stats.min ? `${stats.min.balance_grams.toLocaleString()} g` : "—"}
          sub={stats.min ? `on ${stats.min.date}` : ""}
          className="border-l-rose-500 bg-rose-50/60 dark:bg-rose-950/20"
        />
      </div>

      {/* Chart */}
      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Running stock balance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rows}>
                <defs>
                  <linearGradient id="stockGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#B8860B" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#B8860B" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                <Tooltip
                  formatter={(value: any) => [`${Number(value).toLocaleString()} g`, "Balance"]}
                />
                {stats.max && (
                  <ReferenceLine
                    y={stats.max.balance_grams}
                    stroke="#3b82f6"
                    strokeDasharray="4 2"
                    strokeOpacity={0.6}
                    label={{ value: `Peak: ${stats.max.balance_grams.toLocaleString()}g`, fill: "#3b82f6", fontSize: 10, position: "insideTopRight" }}
                  />
                )}
                {stats.min && (
                  <ReferenceLine
                    y={stats.min.balance_grams}
                    stroke="#f43f5e"
                    strokeDasharray="4 2"
                    strokeOpacity={0.6}
                    label={{ value: `Low: ${stats.min.balance_grams.toLocaleString()}g`, fill: "#f43f5e", fontSize: 10, position: "insideBottomRight" }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="balance_grams"
                  name="Balance (g)"
                  stroke="#B8860B"
                  fill="url(#stockGradient)"
                  strokeWidth={2.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Daily balances</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-y-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Balance (g)</TableHead>
                  <TableHead className="text-right">vs Peak</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const isPeak = r.date === stats.max?.date;
                  const isLow = r.date === stats.min?.date;
                  const vsPeak = stats.max ? r.balance_grams - stats.max.balance_grams : 0;
                  return (
                    <TableRow
                      key={r.date}
                      className={cn(
                        isPeak && "bg-blue-50/60 dark:bg-blue-950/20",
                        isLow && "bg-rose-50/60 dark:bg-rose-950/20"
                      )}
                    >
                      <TableCell className="font-medium">
                        {r.date}
                        {isPeak && <span className="ml-2 rounded bg-blue-100 px-1 py-0.5 text-xs text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">peak</span>}
                        {isLow && !isPeak && <span className="ml-2 rounded bg-rose-100 px-1 py-0.5 text-xs text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">lowest</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono">{r.balance_grams.toLocaleString()}</TableCell>
                      <TableCell className={cn("text-right text-xs font-mono", vsPeak < 0 ? "text-muted-foreground" : "text-blue-600 dark:text-blue-400")}>
                        {vsPeak === 0 ? "—" : `${vsPeak.toLocaleString()} g`}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
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
