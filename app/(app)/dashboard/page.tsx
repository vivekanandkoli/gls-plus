"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
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
import { TransactionTypeBadge } from "@/components/TransactionTypeBadge";
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

type Book = "official" | "unofficial";
type Period = "all" | "month";

type WacState = { wac: number; stockGm: number; stockValueThb: number };
type WacByBook = { official: WacState; unofficial: WacState };

type TxRow = {
  id: string;
  date: string;
  book: Book;
  type: "BUY" | "SELL";
  invoice_number: string | null;
  weight_grams: number | null;
  rate_per_gram: number | null;
  amount_thb: number | null;
  client: { name: string } | { name: string }[] | null;
};

type AggTx = {
  date: string;
  book: Book;
  type: "BUY" | "SELL";
  weight_grams: number | null;
  amount_thb: number | null;
  profit_loss: number | null;
};

type BookAgg = { buyGm: number; buyThb: number; sellGm: number; sellThb: number; profit: number };

function emptyAgg(): BookAgg {
  return { buyGm: 0, buyThb: 0, sellGm: 0, sellThb: 0, profit: 0 };
}

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

const SHORT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function formatMonthKey(key: string): string {
  const parts = key.split("-");
  if (parts.length !== 2) return key;
  const m = SHORT_MONTHS[parseInt(parts[1], 10) - 1];
  return m ? `${m} '${parts[0].slice(2)}` : key;
}

const chartTooltipStyle: CSSProperties = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  color: "var(--popover-foreground)",
  fontSize: "12px",
};
const chartTooltipLabelStyle: CSSProperties = { color: "var(--muted-foreground)", marginBottom: 4 };

function fmtGm(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function DashboardPage() {
  const { isAdmin } = useAppUser();
  const { count: pendingApprovalCount } = usePendingCount(isAdmin);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("month");

  const [wac, setWac] = useState<WacByBook | null>(null);
  const [aggAll, setAggAll] = useState<Record<Book, BookAgg>>({ official: emptyAgg(), unofficial: emptyAgg() });
  const [aggMonth, setAggMonth] = useState<Record<Book, BookAgg>>({ official: emptyAgg(), unofficial: emptyAgg() });
  const [totalClients, setTotalClients] = useState(0);
  const [monthlyVolume, setMonthlyVolume] = useState<{ month: string; buy_grams: number; sell_grams: number }[]>([]);
  const [recentTx, setRecentTx] = useState<TxRow[]>([]);

  const supabaseConfigError = useMemo(() => getSupabaseBrowserConfigError(), []);
  const canQuery = supabaseConfigError === null;
  const showSkeleton = loading && canQuery;

  useEffect(() => {
    if (!canQuery) return;
    const run = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabase = getSupabaseClient() as any;
        const now = new Date();
        const today = isoDate(now);
        const monthStart = isoDate(startOfMonth(now));
        const windowStart = isoDate(startOfMonth(addMonths(now, -11)));

        const wacPromise = fetch("/api/inventory/wac").then((r) => (r.ok ? r.json() : null)).catch(() => null);

        const [aggResult, clientCountResult, volResult, recentResult, wacData] = await Promise.all([
          supabase
            .from("transactions")
            .select("date,book,type,weight_grams,amount_thb,profit_loss")
            .eq("status", "approved")
            .limit(10000),
          supabase.from("clients").select("id", { count: "exact", head: true }),
          supabase
            .from("transactions")
            .select("date,type,weight_grams")
            .eq("status", "approved")
            .gte("date", windowStart)
            .lte("date", today),
          supabase
            .from("transactions")
            .select("id,date,book,type,invoice_number,weight_grams,rate_per_gram,amount_thb,client:clients(name)")
            .order("date", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(10),
          wacPromise,
        ]);

        if (aggResult.error) throw aggResult.error;
        if (recentResult.error) throw recentResult.error;

        if (wacData?.official && wacData?.unofficial) setWac(wacData as WacByBook);

        const all: Record<Book, BookAgg> = { official: emptyAgg(), unofficial: emptyAgg() };
        const month: Record<Book, BookAgg> = { official: emptyAgg(), unofficial: emptyAgg() };
        for (const r of (aggResult.data ?? []) as AggTx[]) {
          const book: Book = r.book === "unofficial" ? "unofficial" : "official";
          const w = typeof r.weight_grams === "number" ? r.weight_grams : 0;
          const a = typeof r.amount_thb === "number" ? r.amount_thb : 0;
          const p = typeof r.profit_loss === "number" ? r.profit_loss : 0;
          const apply = (agg: BookAgg) => {
            if (r.type === "BUY") { agg.buyGm += w; agg.buyThb += a; }
            else { agg.sellGm += w; agg.sellThb += a; agg.profit += p; }
          };
          apply(all[book]);
          if (r.date >= monthStart && r.date <= today) apply(month[book]);
        }
        setAggAll(all);
        setAggMonth(month);
        setTotalClients(clientCountResult.count ?? 0);

        // Monthly volume (both books combined) — last 12 months.
        const buckets = new Map<string, { month: string; buy_grams: number; sell_grams: number }>();
        for (const r of (volResult.data ?? []) as { date: string; type: string; weight_grams: number | null }[]) {
          const key = monthKey(new Date(String(r.date)));
          const b = buckets.get(key) ?? { month: key, buy_grams: 0, sell_grams: 0 };
          const w = typeof r.weight_grams === "number" ? r.weight_grams : 0;
          if (r.type === "BUY") b.buy_grams += w; else b.sell_grams += w;
          buckets.set(key, b);
        }
        const months: string[] = [];
        for (let i = 11; i >= 0; i--) months.push(monthKey(addMonths(now, -i)));
        setMonthlyVolume(months.map((m) => buckets.get(m) ?? { month: m, buy_grams: 0, sell_grams: 0 }));

        setRecentTx((recentResult.data ?? []) as unknown as TxRow[]);
      } catch (e) {
        console.error(e);
        setLoadError(formatSupabaseQueryError(e));
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [canQuery]);

  const agg = period === "month" ? aggMonth : aggAll;
  const buyGm = agg.official.buyGm + agg.unofficial.buyGm;
  const buyThb = agg.official.buyThb + agg.unofficial.buyThb;
  const sellGm = agg.official.sellGm + agg.unofficial.sellGm;
  const sellThb = agg.official.sellThb + agg.unofficial.sellThb;
  const actualPl = agg.unofficial.profit; // owner's real P/L = unofficial alone
  const taxPl = agg.official.profit;

  const periodLabel = period === "month" ? "this month" : "all time";

  return (
    <PageWrapper title="Dashboard" description="Real vault, official book, and activity for the current year.">
      {supabaseConfigError ? (
        <div className="mb-4 rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          <strong className="font-semibold">Supabase is not configured for the browser.</strong> {supabaseConfigError}
        </div>
      ) : null}
      {loadError ? (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
          {loadError}
        </div>
      ) : null}

      {isAdmin && pendingApprovalCount > 0 ? (
        <div className="mb-4 rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          <strong className="font-semibold">{pendingApprovalCount} pending approval{pendingApprovalCount === 1 ? "" : "s"}</strong> need review.{" "}
          <Link href="/transactions?status=pending" className="font-medium underline underline-offset-2">Review →</Link>
        </div>
      ) : null}

      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div role="group" aria-label="Time period" className="flex items-center gap-1 rounded-lg border bg-muted p-1 w-fit">
          {(["month", "all"] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
              className={cn(
                "rounded-md px-3 py-2 min-h-10 text-sm font-medium transition-colors",
                period === p ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {p === "month" ? "This month" : "All time"}
            </button>
          ))}
        </div>
        <Button asChild>
          <Link href="/transactions/new"><Plus className="mr-2 h-4 w-4" />New Transaction</Link>
        </Button>
      </div>

      {/* Two-book headline: vault (unofficial) primary, official secondary */}
      <div className="grid gap-3 md:grid-cols-2">
        <Card className="border-l-4 border-l-amber-500 bg-amber-50/40 dark:bg-amber-950/10 min-w-0">
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">🔒 Vault (Unofficial) — actual</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            {showSkeleton ? <Skeleton className="h-8 w-40" /> : (
              <>
                <div className="text-2xl font-semibold tabular-nums">{wac ? fmtGm(wac.unofficial.stockGm) : "—"} <span className="text-sm font-normal text-muted-foreground">g</span></div>
                <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
                  <div><div className="text-muted-foreground">Current WAC</div><div className="font-medium tabular-nums">{wac ? wac.unofficial.wac.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "—"} THB/g</div></div>
                  <div><div className="text-muted-foreground">Actual P/L ({periodLabel})</div><div className={cn("font-semibold tabular-nums", actualPl >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600")}>{formatCurrency(actualPl, "THB", "th-TH")}</div></div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500 bg-blue-50/30 dark:bg-blue-950/10 min-w-0">
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">Official — tax / audit</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            {showSkeleton ? <Skeleton className="h-8 w-40" /> : (
              <>
                <div className="text-2xl font-semibold tabular-nums">{wac ? fmtGm(wac.official.stockGm) : "—"} <span className="text-sm font-normal text-muted-foreground">g</span></div>
                <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
                  <div><div className="text-muted-foreground">Current WAC</div><div className="font-medium tabular-nums">{wac ? wac.official.wac.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "—"} THB/g</div></div>
                  <div><div className="text-muted-foreground">Tax P/L ({periodLabel})</div><div className={cn("font-semibold tabular-nums", taxPl >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600")}>{formatCurrency(taxPl, "THB", "th-TH")}</div></div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Actual P/L is the unofficial book alone; the official book is the declared tax view. They are not added together.</p>

      {/* Activity KPIs */}
      <div className="mt-4 grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card className="min-w-0"><CardHeader className="py-3"><div className="flex items-center gap-1.5"><TransactionTypeBadge type="BUY">Buy</TransactionTypeBadge><CardTitle className="text-xs text-muted-foreground font-normal">{periodLabel}</CardTitle></div></CardHeader><CardContent className="pb-3"><div className="text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{fmtGm(buyGm)}g</div><div className="text-xs text-muted-foreground truncate">{formatCurrency(buyThb, "THB", "th-TH")}</div></CardContent></Card>
        <Card className="min-w-0"><CardHeader className="py-3"><div className="flex items-center gap-1.5"><TransactionTypeBadge type="SELL">Sell</TransactionTypeBadge><CardTitle className="text-xs text-muted-foreground font-normal">{periodLabel}</CardTitle></div></CardHeader><CardContent className="pb-3"><div className="text-xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">{fmtGm(sellGm)}g</div><div className="text-xs text-muted-foreground truncate">{formatCurrency(sellThb, "THB", "th-TH")}</div></CardContent></Card>
        <Card className="min-w-0"><CardHeader className="py-3"><CardTitle className="text-sm">Avg Buy Rate</CardTitle></CardHeader><CardContent className="pb-3"><div className="text-xl font-semibold tabular-nums">{buyGm > 0 ? (buyThb / buyGm).toFixed(2) : "—"}</div><div className="text-xs text-muted-foreground">THB/g · {periodLabel}</div></CardContent></Card>
        <Card className="min-w-0"><CardHeader className="py-3"><CardTitle className="text-sm">Total Clients</CardTitle></CardHeader><CardContent className="pb-3"><div className="text-xl font-semibold tabular-nums">{totalClients.toLocaleString()}</div><div className="text-xs text-muted-foreground">clients</div></CardContent></Card>
      </div>

      {/* Monthly volume chart */}
      <Card className="mt-6">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Monthly BUY vs SELL (last 12 months)</CardTitle></CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            {showSkeleton ? <Skeleton className="h-full w-full min-h-[288px] rounded-lg" aria-hidden /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyVolume}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={formatMonthKey} />
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

      {/* Recent transactions */}
      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Recent Transactions</CardTitle>
          <Link href="/transactions" className="text-sm font-medium text-primary hover:underline">View All</Link>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Book</TableHead>
                  <TableHead className="w-[90px]">Type</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead className="text-right">Weight (g)</TableHead>
                  <TableHead className="text-right">Amount (THB)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentTx.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.date}</TableCell>
                    <TableCell>{embeddedClientName(r.client) ?? "-"}</TableCell>
                    <TableCell>
                      <span className={cn("rounded px-1.5 py-0.5 text-xs", r.book === "unofficial" ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" : "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300")}>
                        {r.book === "unofficial" ? "Unofficial" : "Official"}
                      </span>
                    </TableCell>
                    <TableCell><TransactionTypeBadge type={r.type} /></TableCell>
                    <TableCell className="font-mono text-xs">{r.invoice_number ?? "-"}</TableCell>
                    <TableCell className="text-right">{typeof r.weight_grams === "number" ? r.weight_grams.toLocaleString() : "-"}</TableCell>
                    <TableCell className="text-right">{typeof r.amount_thb === "number" ? formatCurrency(r.amount_thb, "THB", "th-TH") : "-"}</TableCell>
                  </TableRow>
                ))}
                {recentTx.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-10 text-center">{loading ? "Loading..." : "No transactions found."}</TableCell></TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
