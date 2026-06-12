"use client";

import { useEffect, useState, useCallback } from "react";
import { format, startOfYear, endOfYear, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { Download } from "lucide-react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getSupabaseClient } from "@/lib/supabase";
import { useAppUser } from "@/hooks/use-app-user";

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtGm(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

interface CashTx {
  id: string;
  date: string;
  invoice_number: string;
  client_name: string | null;
  type: "BUY" | "SELL";
  weight_grams: number;
  rate_per_gram: number;
  amount_thb: number;
  status: string;
}

// Period presets
const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function CashReportPage() {
  const { isAdmin, loading: authLoading } = useAppUser();

  const [periodType, setPeriodType] = useState<"month" | "year" | "all">("month");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth()); // 0-indexed

  const [rows, setRows] = useState<CashTx[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCash = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = getSupabaseClient() as any;
      let q = supabase
        .from("transactions")
        .select("id,date,invoice_number,client_name,type,weight_grams,rate_per_gram,amount_thb,status")
        .eq("transaction_mode", "cash")
        .eq("status", "approved")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });

      if (periodType === "month") {
        const start = format(startOfMonth(new Date(selectedYear, selectedMonth)), "yyyy-MM-dd");
        const end = format(endOfMonth(new Date(selectedYear, selectedMonth)), "yyyy-MM-dd");
        q = q.gte("date", start).lte("date", end);
      } else if (periodType === "year") {
        const start = format(startOfYear(new Date(selectedYear, 0)), "yyyy-MM-dd");
        const end = format(endOfYear(new Date(selectedYear, 0)), "yyyy-MM-dd");
        q = q.gte("date", start).lte("date", end);
      }

      const { data, error } = await q.limit(2000);
      if (error) throw error;
      setRows(data ?? []);
    } finally {
      setLoading(false);
    }
  }, [periodType, selectedYear, selectedMonth]);

  useEffect(() => {
    if (!authLoading && isAdmin) fetchCash();
  }, [authLoading, isAdmin, fetchCash]);

  // Summaries
  let buyGrams = 0, buyThb = 0, sellGrams = 0, sellThb = 0;
  for (const r of rows) {
    if (r.type === "BUY") { buyGrams += r.weight_grams; buyThb += r.amount_thb; }
    else { sellGrams += r.weight_grams; sellThb += r.amount_thb; }
  }
  const pl = sellThb - buyThb;
  const netGrams = buyGrams - sellGrams;

  // Excel export
  function exportExcel() {
    import("xlsx").then(({ utils, writeFile }) => {
      const wsData = [
        ["Date", "Invoice", "Client", "Type", "Weight (gm)", "Rate (฿/gm)", "Amount (฿)"],
        ...rows.map((r) => [
          r.date,
          r.invoice_number,
          r.client_name ?? "",
          r.type,
          r.weight_grams,
          r.rate_per_gram,
          r.amount_thb,
        ]),
        [],
        ["", "", "", "BUY total", fmtGm(buyGrams), "", fmt(buyThb)],
        ["", "", "", "SELL total", fmtGm(sellGrams), "", fmt(sellThb)],
        ["", "", "", "Net P&L", "", "", fmt(pl)],
      ];
      const ws = utils.aoa_to_sheet(wsData);
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "Cash Transactions");
      const label = periodType === "month"
        ? `${MONTHS[selectedMonth]}-${selectedYear}`
        : periodType === "year" ? String(selectedYear) : "All";
      writeFile(wb, `Cash-Report-${label}.xlsx`);
    });
  }

  // Guard: non-admins see nothing
  if (!authLoading && !isAdmin) {
    return (
      <PageWrapper title="Cash Report" description="Admin only">
        <p className="text-sm text-muted-foreground">You do not have access to this report.</p>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper
      title="💰 Cash Report"
      description="Internal cash-only transactions — not included in official statements or CA reports."
    >
      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        {/* Period type */}
        <div className="flex rounded-md border overflow-hidden text-sm">
          {(["month", "year", "all"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setPeriodType(t)}
              className={`px-3 py-1.5 capitalize transition-colors ${periodType === t ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {t === "all" ? "All time" : t}
            </button>
          ))}
        </div>

        {/* Year picker */}
        {periodType !== "all" && (
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        )}

        {/* Month picker */}
        {periodType === "month" && (
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        )}

        <Button variant="outline" size="sm" onClick={exportExcel} className="ml-auto gap-1.5">
          <Download className="h-4 w-4" />
          Export Excel
        </Button>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-xs text-muted-foreground">Transactions</CardTitle></CardHeader>
          <CardContent className="pb-3 text-xl font-semibold">{rows.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-xs text-muted-foreground">BUY</CardTitle></CardHeader>
          <CardContent className="pb-3">
            <div className="text-base font-semibold text-emerald-700 dark:text-emerald-400">{fmtGm(buyGrams)} gm</div>
            <div className="text-xs text-muted-foreground">฿{fmt(buyThb)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-xs text-muted-foreground">SELL</CardTitle></CardHeader>
          <CardContent className="pb-3">
            <div className="text-base font-semibold text-amber-700 dark:text-amber-400">{fmtGm(sellGrams)} gm</div>
            <div className="text-xs text-muted-foreground">฿{fmt(sellThb)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-xs text-muted-foreground">Cash P&L</CardTitle></CardHeader>
          <CardContent className="pb-3">
            <div className={`text-base font-semibold ${pl >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600"}`}>
              {pl >= 0 ? "+" : ""}฿{fmt(pl)}
            </div>
            <div className="text-xs text-muted-foreground">Net stock: {netGrams >= 0 ? "+" : ""}{fmtGm(netGrams)} gm</div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No cash transactions found for this period.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Weight (gm)</TableHead>
                    <TableHead className="text-right">Rate (฿/gm)</TableHead>
                    <TableHead className="text-right">Amount (฿)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id} className="bg-zinc-50/80 dark:bg-zinc-900/20">
                      <TableCell className="text-xs text-muted-foreground">
                        {format(parseISO(r.date), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.invoice_number}</TableCell>
                      <TableCell className="text-sm">{r.client_name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-zinc-300 bg-zinc-100 text-zinc-600 text-[10px] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                          💰 CASH {r.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtGm(r.weight_grams)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(r.rate_per_gram)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(r.amount_thb)}</TableCell>
                    </TableRow>
                  ))}
                  {/* Totals row */}
                  <TableRow className="border-t-2 font-semibold bg-muted/30">
                    <TableCell colSpan={4} className="text-sm">Totals</TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmtGm(buyGrams - sellGrams)}</TableCell>
                    <TableCell />
                    <TableCell className={`text-right font-mono text-sm ${pl >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600"}`}>
                      {pl >= 0 ? "+" : ""}฿{fmt(pl)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
