"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSupabaseClient } from "@/lib/supabase";
import { cn, formatCurrency } from "@/lib/utils";

type TxRow = {
  client_id: string;
  type: "BUY" | "SELL";
  weight_grams: number | null;
  amount_thb: number | null;
};
type ClientName = { id: string; name: string };

type ClientPL = {
  id: string;
  name: string;
  buyGrams: number;
  buyThb: number;
  sellGrams: number;
  sellThb: number;
  margin: number;
  marginPct: number;
};

function iso(d: Date) { return d.toISOString().slice(0, 10); }
function yearStart(y: number) { return `${y}-01-01`; }

export default function ClientPLPage() {
  const now = new Date();
  const [period, setPeriod] = useState<"all" | "year" | "month">("year");
  const [sortBy, setSortBy] = useState<"margin" | "sellThb" | "sellGrams">("margin");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ClientPL[]>([]);

  const canQuery = useMemo(() => {
    try { getSupabaseClient(); return true; } catch { return false; }
  }, []);

  useEffect(() => {
    if (!canQuery) return;
    const run = async () => {
      setLoading(true);
      try {
        const supabase = getSupabaseClient() as any;
        const today = iso(now);
        const from =
          period === "month" ? iso(new Date(now.getFullYear(), now.getMonth(), 1))
          : period === "year" ? yearStart(now.getFullYear())
          : "2000-01-01";

        const [{ data: tx, error: txErr }, { data: clients, error: cErr }] = await Promise.all([
          supabase
            .from("transactions")
            .select("client_id,type,weight_grams,amount_thb")
            .gte("date", from)
            .lte("date", today)
            .limit(100000),
          supabase.from("clients").select("id,name").limit(2000),
        ]);
        if (txErr) throw txErr;
        if (cErr) throw cErr;

        const nameMap = new Map<string, string>(
          ((clients ?? []) as ClientName[]).map((c) => [c.id, c.name])
        );

        const agg = new Map<string, Omit<ClientPL, "margin" | "marginPct">>();
        for (const r of (tx ?? []) as TxRow[]) {
          const w = typeof r.weight_grams === "number" ? r.weight_grams : 0;
          const a = typeof r.amount_thb === "number" ? r.amount_thb : 0;
          const cur = agg.get(r.client_id) ?? {
            id: r.client_id, name: nameMap.get(r.client_id) ?? r.client_id,
            buyGrams: 0, buyThb: 0, sellGrams: 0, sellThb: 0,
          };
          if (r.type === "BUY") { cur.buyGrams += w; cur.buyThb += a; }
          else { cur.sellGrams += w; cur.sellThb += a; }
          agg.set(r.client_id, cur);
        }

        const computed: ClientPL[] = [...agg.values()].map((c) => {
          const margin = c.sellThb - c.buyThb;
          return { ...c, margin, marginPct: c.sellThb > 0 ? (margin / c.sellThb) * 100 : 0 };
        });
        setRows(computed);
      } finally { setLoading(false); }
    };
    void run();
  }, [canQuery, period]);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => b[sortBy] - a[sortBy]),
    [rows, sortBy]
  );

  const totals = useMemo(() => rows.reduce(
    (acc, r) => ({
      buyThb: acc.buyThb + r.buyThb,
      sellThb: acc.sellThb + r.sellThb,
      margin: acc.margin + r.margin,
    }),
    { buyThb: 0, sellThb: 0, margin: 0 }
  ), [rows]);

  const periodLabel = period === "month" ? "This month" : period === "year" ? "This year" : "All time";

  return (
    <PageWrapper
      title="Client P/L"
      description="Estimated profit or loss by client based on recorded trades."
    >
      <div className="no-print mb-6 flex flex-wrap items-end gap-4">
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Period</div>
          <Select value={period} onValueChange={(v) => setPeriod(v as any)}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="month">This month</SelectItem>
              <SelectItem value="year">This year</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Sort by</div>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="margin">Gross margin (THB)</SelectItem>
              <SelectItem value="sellThb">SELL revenue</SelectItem>
              <SelectItem value="sellGrams">SELL volume (g)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {loading && <span className="text-xs text-muted-foreground mt-5">Loading…</span>}
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Card className="border-l-4 border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/10">
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-xs text-muted-foreground">Total SELL Revenue</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-2xl font-bold">{formatCurrency(totals.sellThb, "THB", "th-TH")}</div>
            <div className="text-xs text-muted-foreground">{periodLabel}</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500 bg-amber-50/40 dark:bg-amber-950/10">
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-xs text-muted-foreground">Total BUY Cost</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-2xl font-bold">{formatCurrency(totals.buyThb, "THB", "th-TH")}</div>
            <div className="text-xs text-muted-foreground">{periodLabel}</div>
          </CardContent>
        </Card>
        <Card className={cn("border-l-4", totals.margin >= 0 ? "border-l-blue-500 bg-blue-50/40 dark:bg-blue-950/10" : "border-l-red-500 bg-red-50/40")}>
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-xs text-muted-foreground">Gross Margin</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className={cn("text-2xl font-bold", totals.margin >= 0 ? "text-emerald-700" : "text-red-600")}>
              {totals.margin >= 0 ? "+" : ""}{formatCurrency(totals.margin, "THB", "th-TH")}
            </div>
            <div className="text-xs text-muted-foreground">
              {totals.sellThb > 0 ? ((totals.margin / totals.sellThb) * 100).toFixed(1) + "% margin" : "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Per-client P/L — {periodLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">SELL Revenue (THB)</TableHead>
                  <TableHead className="text-right">BUY Cost (THB)</TableHead>
                  <TableHead className="text-right">Gross Margin (THB)</TableHead>
                  <TableHead className="text-right">Margin %</TableHead>
                  <TableHead className="text-right">SELL (g)</TableHead>
                  <TableHead className="text-right">BUY (g)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((s, i) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>
                      <Link href={`/clients/${s.id}`} className="font-medium hover:underline text-primary">
                        {s.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(s.sellThb, "THB", "th-TH")}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(s.buyThb, "THB", "th-TH")}</TableCell>
                    <TableCell className={cn("text-right tabular-nums font-semibold", s.margin >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600")}>
                      {s.margin >= 0 ? "+" : ""}{formatCurrency(s.margin, "THB", "th-TH")}
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums", s.marginPct >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600")}>
                      {s.marginPct.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.sellGrams.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.buyGrams.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {sorted.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      {loading ? "Loading…" : "No data for this period."}
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
