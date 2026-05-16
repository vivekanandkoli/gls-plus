"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSupabaseBrowserConfigError, getSupabaseClient } from "@/lib/supabase";
import { cn, embeddedClientName, formatCurrency } from "@/lib/utils";

type TxRow = {
  id: string;
  date: string;
  type: "BUY" | "SELL";
  invoice_number: string | null;
  weight_grams: number | null;
  rate_per_gram: number | null;
  amount_thb: number | null;
  client: { name: string } | { name: string }[] | null;
};

type LedgerPoint = {
  date: string;
  balance_grams: number;
};

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, months: number) {
  const next = new Date(d);
  next.setMonth(next.getMonth() + months);
  return next;
}

type Period = "all" | "month";

export default function DashboardPage() {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<Period>("month");
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(0);
  const [kpis, setKpis] = useState({
    currentStockGrams: 0,
    buyAllGrams: 0,
    buyAllThb: 0,
    sellAllGrams: 0,
    sellAllThb: 0,
    buyMonthGrams: 0,
    buyMonthThb: 0,
    sellMonthGrams: 0,
    sellMonthThb: 0,
    avgBuyRateToday: 0,
    avgSellRateToday: 0,
    totalClients: 0,
  });

  const [ledger90d, setLedger90d] = useState<LedgerPoint[]>([]);
  const [monthlyVolume, setMonthlyVolume] = useState<
    { month: string; buy_grams: number; sell_grams: number }[]
  >([]);
  const [recentTx, setRecentTx] = useState<TxRow[]>([]);

  const supabaseConfigError = useMemo(() => getSupabaseBrowserConfigError(), []);
  const canQuery = supabaseConfigError === null;

  useEffect(() => {
    if (!canQuery) return;

    const run = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const supabase = getSupabaseClient() as any;
        const now = new Date();
        const today = isoDate(now);
        const d90 = isoDate(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000));
        // Include imported historical data (e.g. 2025) when viewing in 2026+.
        const windowStart = isoDate(startOfMonth(addMonths(now, -24)));

        // Run all independent queries in parallel instead of sequentially.
        const monthStart = isoDate(startOfMonth(now));

        const [
          stockResult,
          allTxResult,
          monthTxResult,
          todayTxResult,
          clientCountResult,
          ledgerResult,
          volTxResult,
          recentResult,
          settingsResult,
        ] = await Promise.all([
          // 1) Current stock
          supabase
            .from("stock_ledger")
            .select("balance_grams")
            .order("recorded_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          // 2) All-time buy/sell totals
          supabase
            .from("transactions")
            .select("type,weight_grams,amount_thb")
            .limit(10000),
          // 3) This-month buy/sell totals
          supabase
            .from("transactions")
            .select("type,weight_grams,amount_thb")
            .gte("date", monthStart)
            .lte("date", today),
          // 4) Today avg rates
          supabase
            .from("transactions")
            .select("type,rate_per_gram")
            .eq("date", today),
          // 5) Total clients
          supabase
            .from("clients")
            .select("id", { count: "exact", head: true }),
          // 6) Ledger 90d for chart
          supabase
            .from("stock_ledger")
            .select("date,balance_grams")
            .gte("date", d90)
            .order("date", { ascending: true }),
          // 7) Monthly volume (last 24 months)
          supabase
            .from("transactions")
            .select("date,type,weight_grams")
            .gte("date", windowStart)
            .lte("date", today),
          // 8) Recent transactions
          supabase
            .from("transactions")
            .select(
              "id,date,type,invoice_number,weight_grams,rate_per_gram,amount_thb,client:clients(name)"
            )
            .order("date", { ascending: false })
            .order("id", { ascending: false })
            .limit(10),
          // 9) Settings (low stock threshold)
          supabase
            .from("settings")
            .select("low_stock_threshold_grams")
            .limit(1)
            .maybeSingle(),
        ]);

        if (stockResult.error) throw stockResult.error;
        if (allTxResult.error) throw allTxResult.error;
        if (todayTxResult.error) throw todayTxResult.error;
        if (clientCountResult.error) throw clientCountResult.error;
        if (volTxResult.error) throw volTxResult.error;
        if (recentResult.error) throw recentResult.error;

        const lastLedger = stockResult.data;
        const allTx = allTxResult.data ?? [];
        const monthTx = monthTxResult.data ?? [];
        const todayTx = todayTxResult.data ?? [];
        const clientCount = clientCountResult.count;
        const volTx = volTxResult.data ?? [];
        const recent = recentResult.data ?? [];

        // Low stock threshold from settings.
        const threshold =
          typeof settingsResult.data?.low_stock_threshold_grams === "number"
            ? settingsResult.data.low_stock_threshold_grams
            : 0;
        setLowStockThreshold(threshold);

        // Compute all-time buy/sell totals.
        let buyAllGrams = 0, buyAllThb = 0, sellAllGrams = 0, sellAllThb = 0;
        for (const r of allTx) {
          const w = typeof r.weight_grams === "number" ? r.weight_grams : 0;
          const a = typeof r.amount_thb === "number" ? r.amount_thb : 0;
          if (r.type === "BUY") { buyAllGrams += w; buyAllThb += a; }
          else if (r.type === "SELL") { sellAllGrams += w; sellAllThb += a; }
        }

        // Compute this-month buy/sell totals.
        let buyMonthGrams = 0, buyMonthThb = 0, sellMonthGrams = 0, sellMonthThb = 0;
        for (const r of monthTx) {
          const w = typeof r.weight_grams === "number" ? r.weight_grams : 0;
          const a = typeof r.amount_thb === "number" ? r.amount_thb : 0;
          if (r.type === "BUY") { buyMonthGrams += w; buyMonthThb += a; }
          else if (r.type === "SELL") { sellMonthGrams += w; sellMonthThb += a; }
        }

        // Today avg rates.
        let buyRateSum = 0, buyRateCount = 0, sellRateSum = 0, sellRateCount = 0;
        for (const r of todayTx) {
          const rate = typeof r.rate_per_gram === "number" ? r.rate_per_gram : null;
          if (rate === null) continue;
          if (r.type === "BUY") { buyRateSum += rate; buyRateCount += 1; }
          else if (r.type === "SELL") { sellRateSum += rate; sellRateCount += 1; }
        }

        // Ledger chart data — fallback to id-sorted if date column is missing.
        let ledgerRows: { date?: string; id?: string; balance_grams?: number }[] = [];
        if (ledgerResult.error) {
          const { data: ledgerPlain, error: ledErr2 } = await supabase
            .from("stock_ledger")
            .select("id,balance_grams")
            .order("id", { ascending: true })
            .limit(2000);
          if (ledErr2) throw ledErr2;
          ledgerRows = (ledgerPlain ?? []).map(
            (r: { id: string; balance_grams: number }, i: number) => ({
              date: `row-${i + 1}`,
              balance_grams: r.balance_grams,
            })
          );
        } else {
          ledgerRows = ledgerResult.data ?? [];
        }

        const ledgerPoints: LedgerPoint[] = (ledgerRows ?? [])
          .map((r: any) => ({
            date: String(r.date ?? r.id ?? ""),
            balance_grams: typeof r.balance_grams === "number" ? r.balance_grams : 0,
          }))
          .reduce((acc: LedgerPoint[], cur: LedgerPoint) => {
            const last = acc[acc.length - 1];
            if (last?.date === cur.date) { acc[acc.length - 1] = cur; } else { acc.push(cur); }
            return acc;
          }, []);

        // Monthly volume buckets.
        const buckets = new Map<string, { month: string; buy_grams: number; sell_grams: number }>();
        for (const r of volTx) {
          const d = new Date(String(r.date));
          const key = monthKey(d);
          const b = buckets.get(key) ?? { month: key, buy_grams: 0, sell_grams: 0 };
          const w = typeof r.weight_grams === "number" ? r.weight_grams : 0;
          if (r.type === "BUY") b.buy_grams += w;
          if (r.type === "SELL") b.sell_grams += w;
          buckets.set(key, b);
        }
        const months: string[] = [];
        for (let i = 11; i >= 0; i--) months.push(monthKey(addMonths(now, -i)));
        const vol = months.map((m) => buckets.get(m) ?? { month: m, buy_grams: 0, sell_grams: 0 });

        setKpis({
          currentStockGrams:
            typeof lastLedger?.balance_grams === "number"
              ? lastLedger.balance_grams
              : 0,
          buyAllGrams,
          buyAllThb,
          sellAllGrams,
          sellAllThb,
          buyMonthGrams,
          buyMonthThb,
          sellMonthGrams,
          sellMonthThb,
          avgBuyRateToday: buyRateCount ? buyRateSum / buyRateCount : 0,
          avgSellRateToday: sellRateCount ? sellRateSum / sellRateCount : 0,
          totalClients: clientCount ?? 0,
        });
        setLedger90d(ledgerPoints);
        setMonthlyVolume(vol);
        setRecentTx((recent ?? []) as unknown as TxRow[]);
      } catch (e) {
        console.error(e);
        setLoadError(
          e instanceof Error
            ? e.message
            : "Failed to load dashboard (check .env and Supabase RLS policies)."
        );
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [canQuery]);

  const showGrams = period === "month" ? kpis.buyMonthGrams : kpis.buyAllGrams;
  const showBuyThb = period === "month" ? kpis.buyMonthThb : kpis.buyAllThb;
  const showSellGrams = period === "month" ? kpis.sellMonthGrams : kpis.sellAllGrams;
  const showSellThb = period === "month" ? kpis.sellMonthThb : kpis.sellAllThb;
  const grossMargin = showSellThb - showBuyThb;
  const marginPct = showSellThb > 0 ? (grossMargin / showSellThb) * 100 : 0;
  const isLowStock =
    lowStockThreshold > 0 && kpis.currentStockGrams < lowStockThreshold;

  return (
    <PageWrapper title="Dashboard">
      {supabaseConfigError ? (
        <div className="mb-4 rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          <strong className="font-semibold">Supabase is not configured for the browser.</strong>{" "}
          {supabaseConfigError} Without this, the dashboard cannot load any data.
        </div>
      ) : null}
      {loadError ? (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {loadError}
        </div>
      ) : null}
      {isLowStock ? (
        <div className="mb-4 rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          <strong className="font-semibold">Low stock warning:</strong> Current balance is{" "}
          <span className="font-semibold">{kpis.currentStockGrams.toLocaleString()} g</span>, below
          your threshold of {lowStockThreshold.toLocaleString()} g.
        </div>
      ) : null}

      {/* Top bar: period toggle + quick-add */}
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-1 rounded-lg border bg-muted p-1 w-fit">
        {(["month", "all"] as Period[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              period === p
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {p === "month" ? "This month" : "All time"}
          </button>
        ))}
      </div>
        <Button asChild>
          <Link href="/transactions/new">
            <Plus className="mr-2 h-4 w-4" />
            New Transaction
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-1">
          <CardHeader className="py-4">
            <CardTitle className="text-sm">Current Stock Balance</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className={cn("text-2xl font-semibold", isLowStock && "text-amber-600")}>
              {kpis.currentStockGrams.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">grams</div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="py-4">
            <CardTitle className="text-sm">
              {period === "month" ? "BUY this month" : "Total BUY"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-2xl font-semibold text-emerald-700">
              {showGrams.toLocaleString()}g
            </div>
            <div className="text-xs text-muted-foreground">
              {formatCurrency(showBuyThb, "THB", "th-TH")}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="py-4">
            <CardTitle className="text-sm">
              {period === "month" ? "SELL this month" : "Total SELL"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-2xl font-semibold text-amber-700">
              {showSellGrams.toLocaleString()}g
            </div>
            <div className="text-xs text-muted-foreground">
              {formatCurrency(showSellThb, "THB", "th-TH")}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="py-4">
            <CardTitle className="text-sm">Avg Buy Rate today</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-2xl font-semibold">
              {kpis.avgBuyRateToday ? kpis.avgBuyRateToday.toFixed(2) : "—"}
            </div>
            <div className="text-xs text-muted-foreground">THB/g</div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="py-4">
            <CardTitle className="text-sm">Avg Sell Rate today</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-2xl font-semibold">
              {kpis.avgSellRateToday ? kpis.avgSellRateToday.toFixed(2) : "—"}
            </div>
            <div className="text-xs text-muted-foreground">THB/g</div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="py-4">
            <CardTitle className="text-sm">Total Clients</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-2xl font-semibold">
              {kpis.totalClients.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">clients</div>
          </CardContent>
        </Card>

        <Card className={cn("lg:col-span-1 border-l-4", grossMargin >= 0 ? "border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/10" : "border-l-red-500 bg-red-50/40")}>
          <CardHeader className="py-4">
            <CardTitle className="text-sm">Gross Margin</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className={cn("text-2xl font-semibold", grossMargin >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600")}>
              {grossMargin >= 0 ? "+" : ""}{formatCurrency(grossMargin, "THB", "th-TH")}
            </div>
            <div className="text-xs text-muted-foreground">
              {marginPct.toFixed(1)}% of revenue
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Stock balance (from ledger)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ledger90d}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="balance_grams"
                    stroke="#B8860B"
                    fill="rgba(184, 134, 11, 0.22)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Monthly BUY vs SELL (last 12 months)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyVolume}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="buy_grams" name="BUY (g)" fill="#16a34a" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="sell_grams" name="SELL (g)" fill="#B8860B" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Recent Transactions</CardTitle>
          <Link href="/transactions" className="text-sm font-medium text-primary hover:underline">
            View All
          </Link>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="w-[110px]">Type</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead className="text-right">Weight (g)</TableHead>
                  <TableHead className="text-right">Rate (THB/g)</TableHead>
                  <TableHead className="text-right">Amount (THB)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentTx.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.date}</TableCell>
                    <TableCell>{embeddedClientName(r.client) ?? "-"}</TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          r.type === "BUY"
                            ? "bg-emerald-600 text-white hover:bg-emerald-600"
                            : "bg-amber-600 text-white hover:bg-amber-600"
                        )}
                      >
                        {r.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.invoice_number ?? "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {typeof r.weight_grams === "number"
                        ? r.weight_grams.toLocaleString()
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {typeof r.rate_per_gram === "number"
                        ? r.rate_per_gram.toLocaleString()
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {typeof r.amount_thb === "number"
                        ? formatCurrency(r.amount_thb, "THB", "th-TH")
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))}

                {recentTx.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center">
                      {loading ? "Loading..." : "No transactions found."}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </PageWrapper>
  );
}

