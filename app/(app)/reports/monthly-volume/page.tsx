"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type Tx = { date: string; type: "BUY" | "SELL"; weight_grams: number | null; amount_thb: number | null };

type MonthRow = {
  month: string;
  buy_g: number;
  buy_thb: number;
  sell_g: number;
  sell_thb: number;
  net_g: number;
};

function yearStart(y: number) { return `${y}-01-01`; }
function yearEnd(y: number) { return `${y}-12-31`; }

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

function buildMonthRows(data: Tx[], year: number): MonthRow[] {
  const m = new Map<string, MonthRow>();
  for (const r of data) {
    const dt = new Date(r.date);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    const cur = m.get(key) ?? { month: key, buy_g: 0, buy_thb: 0, sell_g: 0, sell_thb: 0, net_g: 0 };
    const g = typeof r.weight_grams === "number" ? r.weight_grams : 0;
    const thb = typeof r.amount_thb === "number" ? r.amount_thb : 0;
    if (r.type === "BUY") { cur.buy_g += g; cur.buy_thb += thb; cur.net_g += g; }
    else { cur.sell_g += g; cur.sell_thb += thb; cur.net_g -= g; }
    m.set(key, cur);
  }
  const list: MonthRow[] = [];
  for (let mm = 1; mm <= 12; mm++) {
    const key = `${year}-${String(mm).padStart(2, "0")}`;
    list.push(m.get(key) ?? { month: key, buy_g: 0, buy_thb: 0, sell_g: 0, sell_thb: 0, net_g: 0 });
  }
  return list;
}

export default function MonthlyVolumeReportPage() {
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [compareYear, setCompareYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<MonthRow[]>([]);
  const [compareRows, setCompareRows] = useState<MonthRow[]>([]);

  const canQuery = useMemo(() => {
    try { getSupabaseClient(); return true; } catch { return false; }
  }, []);

  useEffect(() => {
    if (!canQuery) return;
    const run = async () => {
      setLoading(true);
      try {
        const supabase = getSupabaseClient() as any;
        const yearsToFetch = compareYear ? [year, compareYear] : [year];
        const results = await Promise.all(
          yearsToFetch.map((y) =>
            supabase
              .from("transactions")
              .select("date,type,weight_grams,amount_thb")
              .gte("date", yearStart(y))
              .lte("date", yearEnd(y))
              .limit(100000)
          )
        );
        const [primary, secondary] = results;
        if (primary.error) throw primary.error;
        setRows(buildMonthRows((primary.data ?? []) as Tx[], year));
        if (compareYear && secondary && !secondary.error) {
          setCompareRows(buildMonthRows((secondary.data ?? []) as Tx[], compareYear));
        } else {
          setCompareRows([]);
        }
      } finally { setLoading(false); }
    };
    void run();
  }, [canQuery, year, compareYear]);

  const years = useMemo(() => {
    const ys = [];
    for (let y = now.getFullYear(); y >= now.getFullYear() - 8; y--) ys.push(y);
    return ys;
  }, [now]);

  // Merge primary + comparison rows for chart
  const chartData = useMemo(() => {
    return rows.map((r, i) => ({
      month: r.month.slice(5), // "01" – "12"
      buy_g: r.buy_g,
      sell_g: r.sell_g,
      cmp_buy_g: compareRows[i]?.buy_g ?? null,
      cmp_sell_g: compareRows[i]?.sell_g ?? null,
    }));
  }, [rows, compareRows]);

  const totals = useMemo(() => rows.reduce(
    (acc, r) => ({
      buy_g: acc.buy_g + r.buy_g,
      buy_thb: acc.buy_thb + r.buy_thb,
      sell_g: acc.sell_g + r.sell_g,
      sell_thb: acc.sell_thb + r.sell_thb,
      net_g: acc.net_g + r.net_g,
    }),
    { buy_g: 0, buy_thb: 0, sell_g: 0, sell_thb: 0, net_g: 0 }
  ), [rows]);

  const peakMonth = useMemo(() => rows.reduce(
    (best, r) => (r.buy_g + r.sell_g > (best?.buy_g ?? 0) + (best?.sell_g ?? 0) ? r : best),
    null as MonthRow | null
  ), [rows]);

  return (
    <PageWrapper
      title="Monthly Volume"
      description="BUY vs SELL weight aggregated by calendar month."
    >
      {/* Year pickers */}
      <div className="no-print mb-6 flex flex-wrap items-end gap-4">
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Year</div>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Compare with year</div>
          <Select
            value={compareYear === null ? "none" : String(compareYear)}
            onValueChange={(v) => setCompareYear(v === "none" ? null : Number(v))}
          >
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {years.filter((y) => y !== year).map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {loading && <span className="text-xs text-muted-foreground mt-5">Loading…</span>}
      </div>

      {/* KPI summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total BUY"
          value={`${totals.buy_g.toLocaleString()} g`}
          sub={formatCurrency(totals.buy_thb, "THB", "th-TH")}
          className="border-l-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/20"
        />
        <KpiCard
          label="Total SELL"
          value={`${totals.sell_g.toLocaleString()} g`}
          sub={formatCurrency(totals.sell_thb, "THB", "th-TH")}
          className="border-l-amber-500 bg-amber-50/60 dark:bg-amber-950/20"
        />
        <KpiCard
          label="Net Change"
          value={`${totals.net_g >= 0 ? "+" : ""}${totals.net_g.toLocaleString()} g`}
          sub={totals.net_g >= 0 ? "Stock grew this year" : "Stock reduced this year"}
          className={cn("border-l-4", totals.net_g >= 0 ? "border-l-blue-500 bg-blue-50/60 dark:bg-blue-950/20" : "border-l-red-500 bg-red-50/60 dark:bg-red-950/20")}
        />
        <KpiCard
          label="Peak Month"
          value={peakMonth ? peakMonth.month.slice(5) : "-"}
          sub={peakMonth ? `${(peakMonth.buy_g + peakMonth.sell_g).toLocaleString()} g total volume` : ""}
          className="border-l-violet-500 bg-violet-50/60 dark:bg-violet-950/20"
        />
      </div>

      {/* Chart */}
      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            BUY vs SELL grams - {year}{compareYear ? ` vs ${compareYear}` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={2} barCategoryGap="18%">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  labelFormatter={(label) => `Month: ${label}`}
                  formatter={(value: any, name: any) => [`${Number(value).toLocaleString()} g`, name]}
                />
                <Legend />
                <Bar dataKey="buy_g" name={`BUY ${year} (g)`} fill="#16a34a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="sell_g" name={`SELL ${year} (g)`} fill="#c9a227" radius={[4, 4, 0, 0]} />
                {compareYear && (
                  <>
                    <Bar dataKey="cmp_buy_g" name={`BUY ${compareYear} (g)`} fill="#86efac" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="cmp_sell_g" name={`SELL ${compareYear} (g)`} fill="#fde68a" radius={[4, 4, 0, 0]} />
                  </>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Monthly breakdown - {year}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">BUY grams</TableHead>
                  <TableHead className="text-right">BUY THB</TableHead>
                  <TableHead className="text-right">SELL grams</TableHead>
                  <TableHead className="text-right">SELL THB</TableHead>
                  <TableHead className="text-right">Net grams</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.month} className={r.buy_g === 0 && r.sell_g === 0 ? "opacity-40" : ""}>
                    <TableCell className="font-medium">{r.month}</TableCell>
                    <TableCell className="text-right">{r.buy_g.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.buy_thb, "THB", "th-TH")}</TableCell>
                    <TableCell className="text-right">{r.sell_g.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.sell_thb, "THB", "th-TH")}</TableCell>
                    <TableCell className={cn("text-right font-medium", r.net_g >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600")}>
                      {r.net_g >= 0 ? "+" : ""}{r.net_g.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      {loading ? "Loading…" : "No data for this year."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              {rows.some((r) => r.buy_g > 0 || r.sell_g > 0) && (
                <TableFooter>
                  <TableRow className="font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">{totals.buy_g.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{formatCurrency(totals.buy_thb, "THB", "th-TH")}</TableCell>
                    <TableCell className="text-right">{totals.sell_g.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{formatCurrency(totals.sell_thb, "THB", "th-TH")}</TableCell>
                    <TableCell className={cn("text-right", totals.net_g >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600")}>
                      {totals.net_g >= 0 ? "+" : ""}{totals.net_g.toLocaleString()}
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
