"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
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

type ClientStat = {
  id: string;
  name: string;
  buyGrams: number;
  buyThb: number;
  sellGrams: number;
  sellThb: number;
  txCount: number;
};

type SortBy = "buyGrams" | "sellGrams" | "buyThb" | "sellThb" | "txCount";

function iso(d: Date) { return d.toISOString().slice(0, 10); }
function yearStart(y: number) { return `${y}-01-01`; }

export default function TopBuyersPage() {
  const now = new Date();
  const [period, setPeriod] = useState<"all" | "year" | "month">("year");
  const [sortBy, setSortBy] = useState<SortBy>("buyGrams");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<ClientStat[]>([]);

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

        const agg = new Map<string, ClientStat>();
        for (const r of (tx ?? []) as TxRow[]) {
          const w = typeof r.weight_grams === "number" ? r.weight_grams : 0;
          const a = typeof r.amount_thb === "number" ? r.amount_thb : 0;
          const cur = agg.get(r.client_id) ?? {
            id: r.client_id,
            name: nameMap.get(r.client_id) ?? r.client_id,
            buyGrams: 0, buyThb: 0, sellGrams: 0, sellThb: 0, txCount: 0,
          };
          cur.txCount += 1;
          if (r.type === "BUY") { cur.buyGrams += w; cur.buyThb += a; }
          else { cur.sellGrams += w; cur.sellThb += a; }
          agg.set(r.client_id, cur);
        }
        setStats([...agg.values()]);
      } finally { setLoading(false); }
    };
    void run();
  }, [canQuery, period]);

  const sorted = useMemo(
    () => [...stats].sort((a, b) => b[sortBy] - a[sortBy]).slice(0, 50),
    [stats, sortBy]
  );

  const top10Chart = sorted.slice(0, 10).map((s) => ({
    name: s.name.length > 14 ? s.name.slice(0, 13) + "…" : s.name,
    [sortBy]: s[sortBy],
  }));

  const periodLabel = period === "month" ? "This month" : period === "year" ? "This year" : "All time";

  return (
    <PageWrapper
      title="Top Clients"
      description="Clients ranked by activity—volume, frequency, or value."
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
          <div className="mb-1 text-xs font-medium text-muted-foreground">Rank by</div>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="buyGrams">BUY volume (g)</SelectItem>
              <SelectItem value="sellGrams">SELL volume (g)</SelectItem>
              <SelectItem value="buyThb">BUY amount (THB)</SelectItem>
              <SelectItem value="sellThb">SELL amount (THB)</SelectItem>
              <SelectItem value="txCount">Transaction count</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {loading && <span className="text-xs text-muted-foreground mt-5">Loading…</span>}
      </div>

      {/* Top 10 bar chart */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Top 10 clients — {periodLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top10Chart} layout="vertical" margin={{ left: 8, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                <Tooltip formatter={(v: any) => Number(v).toLocaleString()} />
                <Bar dataKey={sortBy} fill="#c9a227" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Full ranked table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">All clients ranked — {periodLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">BUY (g)</TableHead>
                  <TableHead className="text-right">BUY (THB)</TableHead>
                  <TableHead className="text-right">SELL (g)</TableHead>
                  <TableHead className="text-right">SELL (THB)</TableHead>
                  <TableHead className="text-right">Tx count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((s, i) => (
                  <TableRow key={s.id} className={cn(i === 0 && "bg-amber-50/60 dark:bg-amber-950/10")}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>
                      <Link href={`/clients/${s.id}`} className="font-medium hover:underline text-primary">
                        {s.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.buyGrams.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(s.buyThb, "THB", "th-TH")}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.sellGrams.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(s.sellThb, "THB", "th-TH")}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.txCount}</TableCell>
                  </TableRow>
                ))}
                {sorted.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
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
