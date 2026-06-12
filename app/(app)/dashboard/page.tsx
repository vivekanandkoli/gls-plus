"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
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
import { TransactionTypeBadge } from "@/components/TransactionTypeBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppUser, usePendingCount } from "@/hooks/use-app-user";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSupabaseBrowserConfigError, getSupabaseClient } from "@/lib/supabase";
import { formatSupabaseQueryError } from "@/lib/supabase-errors";
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

/** Format ISO date string (YYYY-MM-DD) to short display like "Jan 15". */
function formatLedgerDate(dateStr: string): string {
  if (!dateStr || dateStr.startsWith("row-")) return dateStr;
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const SHORT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** Format month key "YYYY-MM" to short display like "Jun '25". */
function formatMonthKey(key: string): string {
  const parts = key.split("-");
  if (parts.length !== 2) return key;
  const m = SHORT_MONTHS[parseInt(parts[1], 10) - 1];
  const y = parts[0].slice(2);
  return m ? `${m} '${y}` : key;
}

const KPI_GRID =
  "grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-7";

/** Recharts tooltip — readable contrast on light/dark (ui-ux-pro-max). */
const chartTooltipStyle: CSSProperties = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  color: "var(--popover-foreground)",
  fontSize: "12px",
  boxShadow: "0 4px 14px rgba(28, 25, 23, 0.12)",
};

const chartTooltipLabelStyle: CSSProperties = {
  color: "var(--muted-foreground)",
  marginBottom: 4,
};

export default function DashboardPage() {
  const { user, isAdmin } = useAppUser();
  const { count: pendingApprovalCount } = usePendingCount(isAdmin);
  const [myWorkflow, setMyWorkflow] = useState({
    monthCount: 0,
    pending: 0,
    rejected: 0,
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<Period>("month");
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(0);
  const [physicalStockGm, setPhysicalStockGm] = useState<number | null>(null);
  const [officialStockGm, setOfficialStockGm] = useState<number | null>(null);
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
    // Period-weighted avg rates (all-time and month)
    avgBuyRateAll: 0,
    avgSellRateAll: 0,
    avgBuyRateMonth: 0,
    avgSellRateMonth: 0,
    totalClients: 0,
    // 3-way P&L (official / cash / combined)
    officialBuyAllThb: 0,
    officialSellAllThb: 0,
    cashBuyAllThb: 0,
    cashSellAllThb: 0,
    officialBuyMonthThb: 0,
    officialSellMonthThb: 0,
    cashBuyMonthThb: 0,
    cashSellMonthThb: 0,
  });

  const [ledger90d, setLedger90d] = useState<LedgerPoint[]>([]);
  const [monthlyVolume, setMonthlyVolume] = useState<
    { month: string; buy_grams: number; sell_grams: number }[]
  >([]);
  const [recentTx, setRecentTx] = useState<TxRow[]>([]);

  type ProfitSummary = {
    trading_profit: { value: number; label: string; note: string };
    tax_profit: {
      value: number;
      label: string;
      note: string;
      formula: {
        total_sell: number;
        total_buy: number;
        owner_closing_rate: number;
        closing_value_owner: number;
      };
    };
    current_stock_gm: number;
    current_wac: number;
    closing_rate_owner: number;
  };
  const [profitSummary, setProfitSummary] = useState<ProfitSummary | null>(null);

  const supabaseConfigError = useMemo(() => getSupabaseBrowserConfigError(), []);
  const canQuery = supabaseConfigError === null;
  const showKpiSkeleton = loading && canQuery;

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
            .select("type,weight_grams,amount_thb,transaction_mode")
            .eq("status", "approved")
            .limit(10000),
          // 3) This-month buy/sell totals
          supabase
            .from("transactions")
            .select("type,weight_grams,amount_thb,transaction_mode")
            .eq("status", "approved")
            .gte("date", monthStart)
            .lte("date", today),
          // 4) Today avg rates
          supabase
            .from("transactions")
            .select("type,rate_per_gram")
            .eq("status", "approved")
            .eq("date", today),
          // 5) Total clients
          supabase
            .from("clients")
            .select("id", { count: "exact", head: true }),
          // 6) Ledger for chart — use same 24-month window as monthly volume
          //    so historical (2025) data always appears.
          supabase
            .from("stock_ledger")
            .select("recorded_at,balance_grams")
            .gte("recorded_at", windowStart)
            .order("recorded_at", { ascending: true })
            .limit(500),
          // 7) Monthly volume (last 24 months)
          supabase
            .from("transactions")
            .select("date,type,weight_grams")
            .eq("status", "approved")
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
        if (monthTxResult.error) throw monthTxResult.error;
        if (todayTxResult.error) throw todayTxResult.error;
        if (clientCountResult.error) throw clientCountResult.error;
        if (volTxResult.error) throw volTxResult.error;
        if (recentResult.error) throw recentResult.error;
        if (settingsResult.error) throw settingsResult.error;

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
        let officialBuyAllThb = 0, officialSellAllThb = 0;
        let cashBuyAllThb = 0, cashSellAllThb = 0;
        for (const r of allTx) {
          const w = typeof r.weight_grams === "number" ? r.weight_grams : 0;
          const a = typeof r.amount_thb === "number" ? r.amount_thb : 0;
          const isCash = r.transaction_mode === "cash";
          if (r.type === "BUY") {
            buyAllGrams += w; buyAllThb += a;
            if (isCash) cashBuyAllThb += a; else officialBuyAllThb += a;
          } else if (r.type === "SELL") {
            sellAllGrams += w; sellAllThb += a;
            if (isCash) cashSellAllThb += a; else officialSellAllThb += a;
          }
        }

        // Compute this-month buy/sell totals.
        let buyMonthGrams = 0, buyMonthThb = 0, sellMonthGrams = 0, sellMonthThb = 0;
        let officialBuyMonthThb = 0, officialSellMonthThb = 0;
        let cashBuyMonthThb = 0, cashSellMonthThb = 0;
        for (const r of monthTx) {
          const w = typeof r.weight_grams === "number" ? r.weight_grams : 0;
          const a = typeof r.amount_thb === "number" ? r.amount_thb : 0;
          const isCash = r.transaction_mode === "cash";
          if (r.type === "BUY") {
            buyMonthGrams += w; buyMonthThb += a;
            if (isCash) cashBuyMonthThb += a; else officialBuyMonthThb += a;
          } else if (r.type === "SELL") {
            sellMonthGrams += w; sellMonthThb += a;
            if (isCash) cashSellMonthThb += a; else officialSellMonthThb += a;
          }
        }

        // Period-weighted avg rates — computed from weight × rate aggregates.
        // Falls back gracefully: month avg when period=month, all-time when period=all.
        // todayTx is kept for backward compat (not used in display anymore).
        void todayTx; // retained in parallel fetch for future use

        // Dual-stock: physical (all txns) vs official (official-mode only)
        try {
          const res = await fetch("/api/inventory/current-wac");
          if (res.ok) {
            const body = await res.json();
            if (typeof body?.physical_stock_gm === "number") setPhysicalStockGm(body.physical_stock_gm);
            if (typeof body?.official_stock_gm === "number") setOfficialStockGm(body.official_stock_gm);
          }
        } catch { /* ignore — dual stock is optional */ }

        // Ledger chart data — map recorded_at → date string (YYYY-MM-DD).
        let ledgerRows: { recorded_at?: string; balance_grams?: number }[] = [];
        if (ledgerResult.error) {
          console.warn("Ledger query error:", ledgerResult.error.message);
        } else {
          ledgerRows = ledgerResult.data ?? [];
        }

        const ledgerPoints: LedgerPoint[] = (ledgerRows ?? [])
          .map((r: any) => {
            // recorded_at may be a full ISO timestamp or a date string — take first 10 chars.
            const raw: string = String(r.recorded_at ?? "");
            const dateStr = raw.length >= 10 ? raw.slice(0, 10) : raw;
            return {
              date: dateStr,
              balance_grams: typeof r.balance_grams === "number" ? r.balance_grams : 0,
            };
          })
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
          avgBuyRateAll: buyAllGrams > 0 ? buyAllThb / buyAllGrams : 0,
          avgSellRateAll: sellAllGrams > 0 ? sellAllThb / sellAllGrams : 0,
          avgBuyRateMonth: buyMonthGrams > 0 ? buyMonthThb / buyMonthGrams : 0,
          avgSellRateMonth: sellMonthGrams > 0 ? sellMonthThb / sellMonthGrams : 0,
          totalClients: clientCount ?? 0,
          officialBuyAllThb,
          officialSellAllThb,
          cashBuyAllThb,
          cashSellAllThb,
          officialBuyMonthThb,
          officialSellMonthThb,
          cashBuyMonthThb,
          cashSellMonthThb,
        });
        setLedger90d(ledgerPoints);
        setMonthlyVolume(vol);
        setRecentTx((recent ?? []) as unknown as TxRow[]);

        // Profit summary (owner's + WAC method) — non-blocking.
        try {
          const psRes = await fetch("/api/dashboard/profit-summary");
          if (psRes.ok) {
            const ps = await psRes.json();
            if (ps?.trading_profit) setProfitSummary(ps);
          }
        } catch { /* ignore — P&L card degrades gracefully */ }
      } catch (e) {
        console.error(e);
        setLoadError(formatSupabaseQueryError(e));
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [canQuery]);

  useEffect(() => {
    if (!canQuery || isAdmin || !user?.id) return;

    const run = async () => {
      try {
        const supabase = getSupabaseClient() as any;
        const now = new Date();
        const monthStart = isoDate(startOfMonth(now));
        const today = isoDate(now);

        const [monthRes, pendingRes, rejectedRes] = await Promise.all([
          supabase
            .from("transactions")
            .select("id", { count: "exact", head: true })
            .eq("created_by", user.id)
            .gte("date", monthStart)
            .lte("date", today),
          supabase
            .from("transactions")
            .select("id", { count: "exact", head: true })
            .eq("created_by", user.id)
            .eq("status", "pending"),
          supabase
            .from("transactions")
            .select("id", { count: "exact", head: true })
            .eq("created_by", user.id)
            .eq("status", "rejected"),
        ]);

        setMyWorkflow({
          monthCount: monthRes.count ?? 0,
          pending: pendingRes.count ?? 0,
          rejected: rejectedRes.count ?? 0,
        });
      } catch (e) {
        console.warn("Failed to load user workflow stats", e);
      }
    };

    void run();
  }, [canQuery, isAdmin, user?.id]);

  const showGrams = period === "month" ? kpis.buyMonthGrams : kpis.buyAllGrams;
  const showBuyThb = period === "month" ? kpis.buyMonthThb : kpis.buyAllThb;
  const showSellGrams = period === "month" ? kpis.sellMonthGrams : kpis.sellAllGrams;
  const showSellThb = period === "month" ? kpis.sellMonthThb : kpis.sellAllThb;
  const grossMargin = showSellThb - showBuyThb;
  const marginPct = showSellThb > 0 ? (grossMargin / showSellThb) * 100 : 0;

  // Period avg rates — weighted by volume (not simple avg of daily rates)
  const displayBuyRate = period === "month" ? kpis.avgBuyRateMonth : kpis.avgBuyRateAll;
  const displaySellRate = period === "month" ? kpis.avgSellRateMonth : kpis.avgSellRateAll;

  // 3-way P&L figures (admin only)
  const officialBuyThb = period === "month" ? kpis.officialBuyMonthThb : kpis.officialBuyAllThb;
  const officialSellThb = period === "month" ? kpis.officialSellMonthThb : kpis.officialSellAllThb;
  const cashBuyThb = period === "month" ? kpis.cashBuyMonthThb : kpis.cashBuyAllThb;
  const cashSellThb = period === "month" ? kpis.cashSellMonthThb : kpis.cashSellAllThb;
  const officialPl = officialSellThb - officialBuyThb;
  const cashPl = cashSellThb - cashBuyThb;
  const combinedPl = officialPl + cashPl;
  const isLowStock =
    lowStockThreshold > 0 && kpis.currentStockGrams < lowStockThreshold;

  return (
    <PageWrapper
      title="Dashboard"
      description="Stock position, activity, and key metrics for your counter."
    >
      {supabaseConfigError ? (
        <div className="mb-4 rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          <strong className="font-semibold">Supabase is not configured for the browser.</strong>{" "}
          {supabaseConfigError} Without this, the dashboard cannot load any data.
        </div>
      ) : null}
      {loadError ? (
        <div
          className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
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

      {isAdmin && pendingApprovalCount > 0 ? (
        <div className="mb-4 rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          <strong className="font-semibold">{pendingApprovalCount} pending approval</strong>
          {pendingApprovalCount === 1 ? "" : "s"} need review.{" "}
          <Link href="/transactions?status=pending" className="font-medium underline underline-offset-2">
            Review pending transactions →
          </Link>
        </div>
      ) : null}

      {!isAdmin && user ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                My transactions this month
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3 pt-0 text-2xl font-semibold tabular-nums">
              {myWorkflow.monthCount}
            </CardContent>
          </Card>
          <Card className={myWorkflow.pending > 0 ? "border-amber-500/40 bg-amber-500/5" : undefined}>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending approval
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3 pt-0 text-2xl font-semibold tabular-nums">
              {myWorkflow.pending}
            </CardContent>
          </Card>
          <Card className={myWorkflow.rejected > 0 ? "border-destructive/40 bg-destructive/5" : undefined}>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Rejected (needs fix)
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3 pt-0 text-2xl font-semibold tabular-nums">
              {myWorkflow.rejected}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <span className="sr-only" aria-live="polite">
        {showKpiSkeleton ? "Loading dashboard data." : ""}
      </span>

      {/* Top bar: period toggle + quick-add */}
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
      <div
        role="group"
        aria-label="Dashboard time period"
        className="flex items-center gap-1 rounded-lg border bg-muted p-1 w-fit"
      >
        {(["month", "all"] as Period[]).map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={period === p}
            onClick={() => setPeriod(p)}
            className={cn(
              "rounded-md px-3 py-2 min-h-10 text-sm font-medium transition-colors focus-visible:outline-offset-2",
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

      {showKpiSkeleton ? (
        <div className={KPI_GRID} aria-busy="true">
          {Array.from({ length: 7 }, (_, i) => (
            <Card key={i} className="min-w-0">
              <CardHeader className="py-4">
                <Skeleton className="h-4 w-28 max-w-full" />
              </CardHeader>
              <CardContent className="space-y-2 pb-4">
                <Skeleton className="h-8 w-24 max-w-full" />
                <Skeleton className="h-3 w-16 max-w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
      <div className={KPI_GRID}>
        <Card className="lg:col-span-1 min-w-0">
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Current Stock</CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div
              className={cn("text-xl font-semibold tabular-nums", isLowStock && "text-amber-600")}
              aria-label={`Current stock ${kpis.currentStockGrams.toLocaleString()} grams`}
            >
              {kpis.currentStockGrams.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">grams</div>
            {isAdmin && physicalStockGm !== null && officialStockGm !== null && (
              <div className="mt-1.5 space-y-0.5 border-t pt-1.5 text-[11px] text-muted-foreground">
                <div className="flex justify-between gap-1">
                  <span className="shrink-0">Physical</span>
                  <span className="font-medium tabular-nums text-foreground truncate">
                    {physicalStockGm.toLocaleString(undefined, { maximumFractionDigits: 2 })} gm
                  </span>
                </div>
                <div className="flex justify-between gap-1">
                  <span className="shrink-0">Official</span>
                  <span className="font-medium tabular-nums text-foreground truncate">
                    {officialStockGm.toLocaleString(undefined, { maximumFractionDigits: 2 })} gm
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1 min-w-0">
          <CardHeader className="py-3">
            <div className="flex items-center gap-1.5">
              <TransactionTypeBadge type="BUY">Buy</TransactionTypeBadge>
              <CardTitle className="text-xs text-muted-foreground font-normal truncate">
                {period === "month" ? "this month" : "all time"}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pb-3">
            <div
              className="text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400 truncate"
              aria-label={`Buy volume ${showGrams.toLocaleString()} grams, ${formatCurrency(showBuyThb, "THB", "th-TH")}`}
            >
              {showGrams.toLocaleString()}g
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {formatCurrency(showBuyThb, "THB", "th-TH")}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1 min-w-0">
          <CardHeader className="py-3">
            <div className="flex items-center gap-1.5">
              <TransactionTypeBadge type="SELL">Sell</TransactionTypeBadge>
              <CardTitle className="text-xs text-muted-foreground font-normal truncate">
                {period === "month" ? "this month" : "all time"}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pb-3">
            <div
              className="text-xl font-semibold tabular-nums text-amber-700 dark:text-amber-400 truncate"
              aria-label={`Sell volume ${showSellGrams.toLocaleString()} grams, ${formatCurrency(showSellThb, "THB", "th-TH")}`}
            >
              {showSellGrams.toLocaleString()}g
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {formatCurrency(showSellThb, "THB", "th-TH")}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1 min-w-0">
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Avg Buy Rate</CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="text-xl font-semibold tabular-nums">
              {displayBuyRate ? displayBuyRate.toFixed(2) : "—"}
            </div>
            <div className="text-xs text-muted-foreground">
              THB/g · {period === "month" ? "this month" : "all time"}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1 min-w-0">
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Avg Sell Rate</CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="text-xl font-semibold tabular-nums">
              {displaySellRate ? displaySellRate.toFixed(2) : "—"}
            </div>
            <div className="text-xs text-muted-foreground">
              THB/g · {period === "month" ? "this month" : "all time"}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1 min-w-0">
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Total Clients</CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="text-xl font-semibold tabular-nums">
              {kpis.totalClients.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">clients</div>
          </CardContent>
        </Card>

        {/* NET PROFIT card — admin sees Trading Profit + Tax Profit */}
        {isAdmin ? (
          <Card className="lg:col-span-1 min-w-0">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Net Profit</CardTitle>
            </CardHeader>
            <CardContent className="pb-3 space-y-2">
              {profitSummary ? (
                <>
                  {/* Trading Profit (Private) — primary */}
                  <div>
                    <div className={cn(
                      "text-xl font-bold tabular-nums leading-tight",
                      profitSummary.trading_profit.value >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600"
                    )}>
                      {formatCurrency(profitSummary.trading_profit.value, "THB", "th-TH")}
                    </div>
                    <div className="text-[10px] text-muted-foreground leading-tight font-medium">
                      Trading Profit (Private)
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      All deals · cash + non-cash
                    </div>
                  </div>

                  <div className="border-t" />

                  {/* Tax Profit (Official) — secondary */}
                  <div>
                    <div className={cn(
                      "text-base font-semibold tabular-nums leading-tight",
                      profitSummary.tax_profit.value >= 0 ? "text-emerald-700/80 dark:text-emerald-400/80" : "text-red-500"
                    )}>
                      {formatCurrency(profitSummary.tax_profit.value, "THB", "th-TH")}
                    </div>
                    <div className="text-[10px] text-muted-foreground leading-tight font-medium">
                      Tax Profit (Official)
                    </div>
                    <div className="text-[10px] text-muted-foreground leading-tight">
                      Non-cash · WAC method
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Closing @{" "}
                      <span className="font-medium">
                        ฿{profitSummary.closing_rate_owner.toLocaleString()}/gm
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground animate-pulse">Computing…</div>
              )}
            </CardContent>
          </Card>
        ) : (
        <Card className={cn("lg:col-span-1 min-w-0 border-l-4", grossMargin >= 0 ? "border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/10" : "border-l-red-500 bg-red-50/40 dark:bg-red-950/20")}>
          <CardHeader className="py-3 space-y-1">
            <CardTitle className="text-sm">Net Profit</CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div
              className={cn("text-xl font-semibold tabular-nums", grossMargin >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600")}
            >
              {grossMargin >= 0 ? "+" : ""}{formatCurrency(grossMargin, "THB", "th-TH")}
            </div>
            <div className="text-xs text-muted-foreground">
              {marginPct.toFixed(1)}% of revenue
            </div>
          </CardContent>
        </Card>
        )}
      </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Stock Balance (last 24 months)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              {showKpiSkeleton ? (
                <Skeleton className="h-full w-full min-h-[288px] rounded-lg" aria-hidden />
              ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ledger90d}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={formatLedgerDate}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
                  <Area
                    type="monotone"
                    dataKey="balance_grams"
                    stroke="#B8860B"
                    fill="rgba(184, 134, 11, 0.22)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Monthly BUY vs SELL (last 12 months)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              {showKpiSkeleton ? (
                <Skeleton className="h-full w-full min-h-[288px] rounded-lg" aria-hidden />
              ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyVolume}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11 }}
                    tickFormatter={formatMonthKey}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
                  <Legend />
                  <Bar dataKey="buy_grams" name="BUY (g)" fill="#16a34a" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="sell_grams" name="SELL (g)" fill="#B8860B" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              )}
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
                      <TransactionTypeBadge type={r.type} />
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

