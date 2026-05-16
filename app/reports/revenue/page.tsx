"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingDown, TrendingUp } from "lucide-react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Badge } from "@/components/ui/badge";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSupabaseClient } from "@/lib/supabase";
import { cn, formatCurrency } from "@/lib/utils";

type Tx = { date: string; type: "BUY" | "SELL"; amount_thb: number | null };
type Preset = "this_month" | "last_3m" | "last_6m" | "this_year" | "custom";

function iso(d: Date) { return d.toISOString().slice(0, 10); }
function monthKey(dateIso: string) {
  const d = new Date(dateIso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function presetRange(p: Preset): [string, string] {
  const now = new Date();
  const today = iso(now);
  if (p === "this_month") return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), today];
  if (p === "last_3m") return [iso(new Date(now.getFullYear(), now.getMonth() - 2, 1)), today];
  if (p === "last_6m") return [iso(new Date(now.getFullYear(), now.getMonth() - 5, 1)), today];
  if (p === "this_year") return [iso(new Date(now.getFullYear(), 0, 1)), today];
  return [iso(new Date(now.getFullYear(), 0, 1)), today];
}

function KpiCard({
  label,
  value,
  sub,
  variant,
}: {
  label: string;
  value: string;
  sub?: string;
  variant?: "revenue" | "cost" | "margin" | "neutral";
}) {
  const colors = {
    revenue: "border-l-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/20",
    cost: "border-l-amber-500 bg-amber-50/60 dark:bg-amber-950/20",
    margin: "border-l-blue-500 bg-blue-50/60 dark:bg-blue-950/20",
    neutral: "border-l-slate-400 bg-muted/40",
  };
  return (
    <Card className={cn("border-l-4", colors[variant ?? "neutral"])}>
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

export default function RevenueReportPage() {
  const [preset, setPreset] = useState<Preset>("this_year");
  const [from, setFrom] = useState<string>(() => presetRange("this_year")[0]);
  const [to, setTo] = useState<string>(() => presetRange("this_year")[1]);
  const [loading, setLoading] = useState(false);

  const [summary, setSummary] = useState({ revenue: 0, cost: 0, margin: 0, marginPct: 0 });
  const [monthly, setMonthly] = useState<
    { month: string; revenue: number; cost: number; margin: number; marginPct: number }[]
  >([]);

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
        const { data, error } = await supabase
          .from("transactions")
          .select("date,type,amount_thb")
          .gte("date", from)
          .lte("date", to)
          .limit(100000);
        if (error) throw error;

        let revenue = 0, cost = 0;
        const m = new Map<string, { month: string; revenue: number; cost: number }>();
        for (const r of (data ?? []) as Tx[]) {
          const a = typeof r.amount_thb === "number" ? r.amount_thb : 0;
          const key = monthKey(r.date);
          const cur = m.get(key) ?? { month: key, revenue: 0, cost: 0 };
          if (r.type === "SELL") { revenue += a; cur.revenue += a; }
          else { cost += a; cur.cost += a; }
          m.set(key, cur);
        }
        const margin = revenue - cost;
        const marginPct = revenue ? (margin / revenue) * 100 : 0;
        const monthlyRows = [...m.values()]
          .sort((a, b) => a.month.localeCompare(b.month))
          .map((r) => {
            const mar = r.revenue - r.cost;
            return { month: r.month, revenue: r.revenue, cost: r.cost, margin: mar, marginPct: r.revenue ? (mar / r.revenue) * 100 : 0 };
          });
        setSummary({ revenue, cost, margin, marginPct });
        setMonthly(monthlyRows);
      } finally { setLoading(false); }
    };
    void run();
  }, [canQuery, from, to]);

  const totals = useMemo(() => monthly.reduce(
    (acc, r) => ({ revenue: acc.revenue + r.revenue, cost: acc.cost + r.cost, margin: acc.margin + r.margin }),
    { revenue: 0, cost: 0, margin: 0 }
  ), [monthly]);

  return (
    <PageWrapper title="Revenue & Margin">
      {/* Filters */}
      <div className="no-print mb-6 flex flex-wrap items-end gap-3">
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Period</div>
          <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this_month">This month</SelectItem>
              <SelectItem value="last_3m">Last 3 months</SelectItem>
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
        {loading && <span className="text-xs text-muted-foreground">Loading…</span>}
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Revenue" value={formatCurrency(summary.revenue, "THB", "th-TH")} sub="from SELL transactions" variant="revenue" />
        <KpiCard label="Total Cost" value={formatCurrency(summary.cost, "THB", "th-TH")} sub="from BUY transactions" variant="cost" />
        <KpiCard
          label="Gross Margin"
          value={formatCurrency(summary.margin, "THB", "th-TH")}
          sub={summary.margin >= 0 ? "Profit" : "Loss"}
          variant="margin"
        />
        <KpiCard
          label="Margin %"
          value={`${summary.marginPct.toFixed(2)}%`}
          sub={summary.marginPct >= 0 ? "of revenue" : "negative margin"}
          variant="neutral"
        />
      </div>

      {/* Bar chart */}
      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Monthly Revenue vs Cost (THB)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value: any, name: any) => [
                    formatCurrency(Number(value), "THB", "th-TH"),
                    name,
                  ]}
                />
                <Legend />
                <Bar dataKey="revenue" name="Revenue" fill="#16a34a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cost" name="Cost" fill="#B8860B" radius={[4, 4, 0, 0]} />
                <Bar dataKey="margin" name="Margin" radius={[4, 4, 0, 0]}>
                  {monthly.map((entry, idx) => (
                    <Cell key={idx} fill={entry.margin >= 0 ? "#3b82f6" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Monthly breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-right">Margin %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthly.map((r) => (
                  <TableRow key={r.month}>
                    <TableCell className="font-medium">{r.month}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.revenue, "THB", "th-TH")}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.cost, "THB", "th-TH")}</TableCell>
                    <TableCell className={cn("text-right font-medium", r.margin >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600")}>
                      {formatCurrency(r.margin, "THB", "th-TH")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        className={cn(
                          "font-mono text-xs",
                          r.marginPct >= 0
                            ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300"
                            : "bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-900/40 dark:text-red-400"
                        )}
                      >
                        {r.marginPct >= 0 ? (
                          <TrendingUp className="mr-1 inline h-3 w-3" />
                        ) : (
                          <TrendingDown className="mr-1 inline h-3 w-3" />
                        )}
                        {r.marginPct.toFixed(2)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {monthly.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      {loading ? "Loading…" : "No data for this range."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              {monthly.length > 0 && (
                <TableFooter>
                  <TableRow className="font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">{formatCurrency(totals.revenue, "THB", "th-TH")}</TableCell>
                    <TableCell className="text-right">{formatCurrency(totals.cost, "THB", "th-TH")}</TableCell>
                    <TableCell className={cn("text-right", totals.margin >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600")}>
                      {formatCurrency(totals.margin, "THB", "th-TH")}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {totals.revenue ? ((totals.margin / totals.revenue) * 100).toFixed(2) : "0.00"}%
                    </TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
