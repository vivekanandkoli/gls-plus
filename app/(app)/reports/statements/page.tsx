"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import {
  Calendar,
  Download,
  FileSpreadsheet,
  Printer,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import * as XLSX from "xlsx";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
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
import { cn, formatCurrency } from "@/lib/utils";
import {
  MONTH_NAMES,
  monthLabel,
  type AnnualSummaryPayload,
  type ClientStatementPayload,
  type MonthlyStatementPayload,
  type StatementRow,
} from "@/lib/statement-utils";
import { useAppUser } from "@/hooks/use-app-user";

// ─── Formatting helpers ───────────────────────────────────────────────────────

const thb = (n: number) => formatCurrency(n, "THB", "th-TH");
const grams = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const rate = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });

function PnlCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">-</span>;
  const positive = value >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium tabular-nums",
        positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
      )}
    >
      {positive ? (
        <TrendingUp className="h-3 w-3 shrink-0" />
      ) : (
        <TrendingDown className="h-3 w-3 shrink-0" />
      )}
      {thb(value)}
    </span>
  );
}

// ─── Current year/month defaults ─────────────────────────────────────────────

const NOW = new Date();
const CUR_YEAR = NOW.getFullYear();
const CUR_MONTH = NOW.getMonth() + 1;
const YEARS = Array.from({ length: 6 }, (_, i) => CUR_YEAR - i);

// ─── Shared: Transaction table ────────────────────────────────────────────────

function TxTable({ rows }: { rows: StatementRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[90px]">Date</TableHead>
            <TableHead>Invoice</TableHead>
            <TableHead>Client</TableHead>
            <TableHead className="w-[60px]">Type</TableHead>
            <TableHead className="text-right">Weight (g)</TableHead>
            <TableHead className="text-right">Rate (฿/g)</TableHead>
            <TableHead className="text-right">Amount (฿)</TableHead>
            <TableHead className="text-right">WAC at sale</TableHead>
            <TableHead className="text-right">Cost of Sale (฿)</TableHead>
            <TableHead className="text-right">P&amp;L (฿)</TableHead>
            <TableHead className="text-right">Running Stock (g)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={11}
                className="py-8 text-center text-muted-foreground"
              >
                No transactions in this period.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.date}</TableCell>
                <TableCell className="font-mono">{r.invoiceNumber ?? "-"}</TableCell>
                <TableCell>{r.clientName}</TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                      r.type === "BUY"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
                        : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                    )}
                  >
                    {r.type}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{grams(r.weightGrams)}</TableCell>
                <TableCell className="text-right tabular-nums">{rate(r.ratePerGram)}</TableCell>
                <TableCell className="text-right tabular-nums">{thb(r.amountThb)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {r.type === "SELL" && r.wacAtSale != null ? rate(r.wacAtSale) : "-"}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {r.type === "SELL" && r.costOfSale != null ? thb(r.costOfSale) : "-"}
                </TableCell>
                <TableCell className="text-right">
                  {r.type === "SELL" ? <PnlCell value={r.profitLoss} /> : "-"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{grams(r.runningStockGrams)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Print Header ─────────────────────────────────────────────────────────────

function PrintHeader({
  title,
  subtitle,
  generatedAt,
}: {
  title: string;
  subtitle: string;
  generatedAt: string;
}) {
  return (
    <div className="mb-6 border-b pb-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">GLS+</h1>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>Generated:</div>
          <div>{new Date(generatedAt).toLocaleString("en-GB")}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Summary Footer Cards ─────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
  variant,
}: {
  label: string;
  value: string;
  sub?: string;
  variant?: "profit" | "loss" | "neutral";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        variant === "profit"
          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
          : variant === "loss"
          ? "border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30"
          : "bg-muted/40"
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-base font-bold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ─── Tab A: Overall Monthly Statement ────────────────────────────────────────

function OverallTab() {
  const [year, setYear] = useState(CUR_YEAR);
  const [month, setMonth] = useState(CUR_MONTH);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MonthlyStatementPayload | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({ contentRef: printRef });

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/reports/monthly-statement?year=${year}&month=${month}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setData(json as MonthlyStatementPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  const exportExcel = useCallback(() => {
    if (!data) return;
    const wb = XLSX.utils.book_new();

    /* ── Sheet 1: Transactions ── */
    const txHeaders = [
      "Date", "Invoice", "Client", "Type",
      "Weight (g)", "Rate (฿/g)", "Amount (฿)",
      "WAC at Sale (฿/g)", "Cost of Sale (฿)", "P&L (฿)", "P&L %",
      "Running Stock (g)",
    ];
    const txData = data.rows.map((r) => [
      r.date, r.invoiceNumber ?? "", r.clientName, r.type,
      r.weightGrams, r.ratePerGram, r.amountThb,
      r.wacAtSale ?? "", r.costOfSale ?? "", r.profitLoss ?? "", r.plPercent ?? "",
      r.runningStockGrams,
    ]);
    const ws1 = XLSX.utils.aoa_to_sheet([txHeaders, ...txData]);
    XLSX.utils.book_append_sheet(wb, ws1, "Transactions");

    /* ── Sheet 2: Summary ── */
    const label = monthLabel(data.year, data.month);
    const s = data.summary;
    const o = data.opening;
    const ws2 = XLSX.utils.aoa_to_sheet([
      ["GLS+ Monthly Statement", label],
      [],
      ["Opening Stock (g)", o.stockGrams],
      ["Opening Stock Value (฿)", o.stockValueThb],
      ["Opening WAC (฿/g)", o.wac],
      [],
      ["Total BUY Qty (g)", s.totalBuyQty],
      ["Total BUY Value (฿)", s.totalBuyValue],
      ["Total SELL Qty (g)", s.totalSellQty],
      ["Total SELL Value (฿)", s.totalSellValue],
      [],
      ["Total P&L (฿)", s.totalProfitLoss],
      ["Gross Margin %", s.grossMarginPct ?? ""],
      [],
      ["Closing Stock (g)", s.closingStockGrams],
      ["Closing Stock Value (฿)", s.closingStockValue],
      ["Month-end WAC (฿/g)", s.closingWac],
    ]);
    XLSX.utils.book_append_sheet(wb, ws2, "Summary");

    XLSX.writeFile(wb, `GLS_Monthly_Statement_${data.year}_${String(data.month).padStart(2, "0")}.xlsx`);
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4" />
            Select Period
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Month
              </label>
              <Select
                value={String(month)}
                onValueChange={(v) => setMonth(Number(v))}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((name, idx) => (
                    <SelectItem key={idx + 1} value={String(idx + 1)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Year
              </label>
              <Select
                value={String(year)}
                onValueChange={(v) => setYear(Number(v))}
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={generate} disabled={loading}>
              {loading ? "Generating…" : "Generate Statement"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Results */}
      {data && (
        <>
          {/* Export buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              {monthLabel(data.year, data.month)} Statement
            </h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportExcel}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Export Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => handlePrint()}>
                <Printer className="mr-2 h-4 w-4" />
                Print / PDF
              </Button>
            </div>
          </div>

          {/* Printable content */}
          <div ref={printRef} className="print-statement space-y-6">
            <PrintHeader
              title="Overall Monthly Statement"
              subtitle={monthLabel(data.year, data.month)}
              generatedAt={data.generatedAt}
            />

            {/* Opening stock */}
            <div className="grid grid-cols-3 gap-3">
              <SummaryCard
                label="Opening Stock"
                value={`${grams(data.opening.stockGrams)} g`}
                sub={thb(data.opening.stockValueThb)}
              />
              <SummaryCard
                label="Opening WAC"
                value={`฿ ${rate(data.opening.wac)}/g`}
              />
              <SummaryCard
                label="Transactions This Month"
                value={String(data.rows.length)}
                sub={`${data.rows.filter((r) => r.type === "BUY").length} BUY · ${data.rows.filter((r) => r.type === "SELL").length} SELL`}
              />
            </div>

            {/* Transaction table */}
            <TxTable rows={data.rows} />

            {/* Summary footer */}
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Monthly Summary
              </h3>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                <SummaryCard
                  label="Total BUY (g)"
                  value={grams(data.summary.totalBuyQty)}
                  sub={thb(data.summary.totalBuyValue)}
                />
                <SummaryCard
                  label="Total SELL (g)"
                  value={grams(data.summary.totalSellQty)}
                  sub={thb(data.summary.totalSellValue)}
                />
                <SummaryCard
                  label="Total P&L"
                  value={thb(data.summary.totalProfitLoss)}
                  variant={
                    data.summary.totalProfitLoss >= 0 ? "profit" : "loss"
                  }
                />
                <SummaryCard
                  label="Gross Margin"
                  value={
                    data.summary.grossMarginPct != null
                      ? `${data.summary.grossMarginPct.toFixed(2)}%`
                      : "-"
                  }
                  sub="P&L ÷ Sell value"
                />
                <SummaryCard
                  label="Closing Stock"
                  value={`${grams(data.summary.closingStockGrams)} g`}
                  sub={thb(data.summary.closingStockValue)}
                />
                <SummaryCard
                  label="Month-end WAC"
                  value={`฿ ${rate(data.summary.closingWac)}/g`}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Tab B: Client-wise Statement ─────────────────────────────────────────────

type Client = { id: string; name: string };

function ClientTab() {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [year, setYear] = useState(CUR_YEAR);
  const [month, setMonth] = useState(CUR_MONTH);
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [from, setFrom] = useState(`${CUR_YEAR}-${String(CUR_MONTH).padStart(2, "0")}-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ClientStatementPayload | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({ contentRef: printRef });

  // Load clients on mount
  useEffect(() => {
    fetch("/api/reports/clients")
      .then((r) => r.json())
      .then((j) => setClients(j.clients ?? []))
      .catch(console.error)
      .finally(() => setClientsLoading(false));
  }, []);

  const generate = useCallback(async () => {
    if (!selectedClient) return;
    setLoading(true);
    setError(null);
    try {
      let fromDate = from;
      let toDate = to;
      if (!useCustomRange) {
        const mm = String(month).padStart(2, "0");
        const lastDay = new Date(year, month, 0).getDate();
        fromDate = `${year}-${mm}-01`;
        toDate = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;
      }
      const res = await fetch(
        `/api/reports/client-statement?clientId=${selectedClient}&from=${fromDate}&to=${toDate}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setData(json as ClientStatementPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [selectedClient, from, to, useCustomRange, year, month]);

  const exportExcel = useCallback(() => {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    const txHeaders = [
      "Date", "Invoice", "Type",
      "Weight (g)", "Rate (฿/g)", "Amount (฿)",
      "WAC at Sale (฿/g)", "Cost of Sale (฿)", "P&L (฿)", "P&L %",
      "Running Stock (g)",
    ];
    const txData = data.rows.map((r) => [
      r.date, r.invoiceNumber ?? "", r.type,
      r.weightGrams, r.ratePerGram, r.amountThb,
      r.wacAtSale ?? "", r.costOfSale ?? "", r.profitLoss ?? "", r.plPercent ?? "",
      r.runningStockGrams,
    ]);
    const ws1 = XLSX.utils.aoa_to_sheet([txHeaders, ...txData]);
    XLSX.utils.book_append_sheet(wb, ws1, "Transactions");

    const s = data.summary;
    const ws2 = XLSX.utils.aoa_to_sheet([
      ["GLS+ Client Statement"],
      ["Client", data.clientName],
      ["Period", `${data.from} to ${data.to}`],
      [],
      ["Total BUY Qty (g)", s.totalBuyQty],
      ["Total BUY Value (฿)", s.totalBuyValue],
      ["Total SELL Qty (g)", s.totalSellQty],
      ["Total SELL Value (฿)", s.totalSellValue],
      ["Total Value Transacted (฿)", s.totalValue],
      ["Average Rate (฿/g)", s.avgRate ?? ""],
      ["P&L on SELL (฿)", s.totalProfitLoss],
    ]);
    XLSX.utils.book_append_sheet(wb, ws2, "Summary");

    XLSX.writeFile(wb, `GLS_Client_${data.clientName.replace(/\s+/g, "_")}_${data.from}_${data.to}.xlsx`);
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Client &amp; Period
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Client
            </label>
            <Select
              value={selectedClient}
              onValueChange={setSelectedClient}
              disabled={clientsLoading}
            >
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder={clientsLoading ? "Loading…" : "Select client…"} />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setUseCustomRange(false)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                  !useCustomRange
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:bg-muted"
                )}
              >
                Month / Year
              </button>
              <button
                type="button"
                onClick={() => setUseCustomRange(true)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                  useCustomRange
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:bg-muted"
                )}
              >
                Custom Range
              </button>
            </div>

            {!useCustomRange ? (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Month
                  </label>
                  <Select
                    value={String(month)}
                    onValueChange={(v) => setMonth(Number(v))}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTH_NAMES.map((name, idx) => (
                        <SelectItem key={idx + 1} value={String(idx + 1)}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Year
                  </label>
                  <Select
                    value={String(year)}
                    onValueChange={(v) => setYear(Number(v))}
                  >
                    <SelectTrigger className="w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {YEARS.map((y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    From
                  </label>
                  <Input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="w-[160px]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    To
                  </label>
                  <Input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="w-[160px]"
                  />
                </div>
              </>
            )}

            <Button onClick={generate} disabled={loading || !selectedClient}>
              {loading ? "Generating…" : "Generate Statement"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              {data.clientName} - {data.from} to {data.to}
            </h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportExcel}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Export Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => handlePrint()}>
                <Printer className="mr-2 h-4 w-4" />
                Print / PDF
              </Button>
            </div>
          </div>

          <div ref={printRef} className="print-statement space-y-6">
            <PrintHeader
              title={`Client Statement - ${data.clientName}`}
              subtitle={`${data.from} to ${data.to}`}
              generatedAt={data.generatedAt}
            />

            <TxTable rows={data.rows} />

            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Client Summary
              </h3>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                <SummaryCard
                  label="Total Bought from Client (g)"
                  value={grams(data.summary.totalBuyQty)}
                  sub={thb(data.summary.totalBuyValue)}
                />
                <SummaryCard
                  label="Total Sold to Client (g)"
                  value={grams(data.summary.totalSellQty)}
                  sub={thb(data.summary.totalSellValue)}
                />
                <SummaryCard
                  label="Avg Rate (฿/g)"
                  value={
                    data.summary.avgRate != null
                      ? rate(data.summary.avgRate)
                      : "-"
                  }
                  sub="Across all transactions"
                />
                <SummaryCard
                  label="P&L on SELL"
                  value={thb(data.summary.totalProfitLoss)}
                  variant={data.summary.totalProfitLoss >= 0 ? "profit" : "loss"}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Tab C: Annual Summary ────────────────────────────────────────────────────

function AnnualTab() {
  const [year, setYear] = useState(CUR_YEAR);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnnualSummaryPayload | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({ contentRef: printRef });

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/annual-summary?year=${year}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setData(json as AnnualSummaryPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [year]);

  const exportExcel = useCallback(() => {
    if (!data) return;
    const wb = XLSX.utils.book_new();

    /* ── Sheet 1: Month-by-month ── */
    const headers = [
      "Month",
      "BUY Qty (g)", "BUY Value (฿)",
      "SELL Qty (g)", "SELL Value (฿)",
      "P&L (฿)",
      "Closing Stock (g)", "Closing Stock Value (฿)", "Month-end WAC (฿/g)",
    ];
    const rows = data.months.map((m) => [
      MONTH_NAMES[m.month - 1],
      m.buyQty, m.buyValue,
      m.sellQty, m.sellValue,
      m.profitLoss,
      m.closingStockGrams, m.closingStockValue, m.closingWac,
    ]);
    const totalsRow = [
      "TOTAL",
      data.totals.buyQty, data.totals.buyValue,
      data.totals.sellQty, data.totals.sellValue,
      data.totals.profitLoss,
      data.yearEndStock.stockGrams, data.yearEndStock.stockValueThb, data.yearEndStock.wac,
    ];
    const ws1 = XLSX.utils.aoa_to_sheet([headers, ...rows, [], totalsRow]);
    XLSX.utils.book_append_sheet(wb, ws1, `${data.year} Summary`);

    /* ── Sheet 2: Profit Formula Breakdown ── */
    const s = data.yearEndStock;
    // Find January opening: state before first day of year
    // Approximate: use the yearEndStock of previous year isn't available, use first month's prior data
    const ws2 = XLSX.utils.aoa_to_sheet([
      [`GLS+ Annual Profit Formula - ${data.year}`],
      [],
      ["Total SELL Revenue (฿)", data.totals.sellValue],
      ["Total BUY Cost (฿)", data.totals.buyValue],
      ["Net P&L (฿)", data.totals.profitLoss],
      [],
      ["Year-end Closing Stock (g)", s.stockGrams],
      ["Year-end Closing Stock Value (฿)", s.stockValueThb],
      ["Year-end WAC (฿/g)", s.wac],
    ]);
    XLSX.utils.book_append_sheet(wb, ws2, "Profit Formula");

    XLSX.writeFile(wb, `GLS_Annual_Summary_${data.year}.xlsx`);
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4" />
            Select Year
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Year
              </label>
              <Select
                value={String(year)}
                onValueChange={(v) => setYear(Number(v))}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={generate} disabled={loading}>
              {loading ? "Generating…" : "Generate Annual Summary"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{data.year} Annual Summary</h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportExcel}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Export Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => handlePrint()}>
                <Printer className="mr-2 h-4 w-4" />
                Print / PDF
              </Button>
            </div>
          </div>

          <div ref={printRef} className="print-statement space-y-6">
            <PrintHeader
              title={`Annual Summary - ${data.year}`}
              subtitle="Month-by-month breakdown"
              generatedAt={data.generatedAt}
            />

            {/* Month table */}
            <div className="overflow-x-auto rounded-lg border">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">BUY (g)</TableHead>
                    <TableHead className="text-right">BUY Value (฿)</TableHead>
                    <TableHead className="text-right">SELL (g)</TableHead>
                    <TableHead className="text-right">SELL Value (฿)</TableHead>
                    <TableHead className="text-right">P&amp;L (฿)</TableHead>
                    <TableHead className="text-right">Closing Stock (g)</TableHead>
                    <TableHead className="text-right">Stock Value (฿)</TableHead>
                    <TableHead className="text-right">WAC (฿/g)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.months.map((m) => (
                    <TableRow key={m.month}>
                      <TableCell className="font-medium">
                        {MONTH_NAMES[m.month - 1]}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.buyQty > 0 ? grams(m.buyQty) : "-"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.buyValue > 0 ? thb(m.buyValue) : "-"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.sellQty > 0 ? grams(m.sellQty) : "-"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.sellValue > 0 ? thb(m.sellValue) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {m.sellQty > 0 ? (
                          <PnlCell value={m.profitLoss} />
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {grams(m.closingStockGrams)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {thb(m.closingStockValue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {rate(m.closingWac)}
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Totals row */}
                  <TableRow className="border-t-2 font-bold">
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {grams(data.totals.buyQty)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {thb(data.totals.buyValue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {grams(data.totals.sellQty)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {thb(data.totals.sellValue)}
                    </TableCell>
                    <TableCell className="text-right">
                      <PnlCell value={data.totals.profitLoss} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {grams(data.yearEndStock.stockGrams)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {thb(data.yearEndStock.stockValueThb)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {rate(data.yearEndStock.wac)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Profit formula */}
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Full-Year Profit Formula (CA View)
              </h3>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <SummaryCard
                  label="Total SELL Revenue"
                  value={thb(data.totals.sellValue)}
                />
                <SummaryCard
                  label="Total BUY Cost"
                  value={thb(data.totals.buyValue)}
                />
                <SummaryCard
                  label="Net P&L for Year"
                  value={thb(data.totals.profitLoss)}
                  variant={data.totals.profitLoss >= 0 ? "profit" : "loss"}
                />
                <SummaryCard
                  label="Year-end WAC"
                  value={`฿ ${rate(data.yearEndStock.wac)}/g`}
                  sub={`${grams(data.yearEndStock.stockGrams)} g`}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = "overall" | "client" | "annual";

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "overall", label: "Overall Monthly", icon: Calendar },
  { id: "client", label: "Client-wise", icon: Users },
  { id: "annual", label: "Annual Summary", icon: Download },
];

export default function StatementsPage() {
  const { isAdmin, loading: authLoading } = useAppUser();
  const [activeTab, setActiveTab] = useState<Tab>("overall");

  if (!authLoading && !isAdmin) {
    return (
      <PageWrapper title="Statements" description="">
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-6 text-center text-sm text-destructive">
          This page is for administrators only.
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper
      title="Statements"
      description="Generate monthly, client-wise, and annual financial statements for export."
    >
      {/* Tab nav */}
      <div className="mb-6 flex gap-1 rounded-lg border bg-muted/40 p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
              activeTab === id
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "overall" && <OverallTab />}
      {activeTab === "client" && <ClientTab />}
      {activeTab === "annual" && <AnnualTab />}

      {/* Print-only styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-statement,
          .print-statement * {
            visibility: visible !important;
          }
          .print-statement {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            padding: 20px;
            background: white;
            color: black;
          }
          @page {
            margin: 15mm;
          }
        }
      `}</style>
    </PageWrapper>
  );
}
