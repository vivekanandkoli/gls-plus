"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  FileSpreadsheet,
  Loader2,
  Pencil,
  Plus,
  TrendingDown,
  TrendingUp,
  UploadCloud,
} from "lucide-react";

import { PlTransactionDialog } from "@/components/manage-pl/PlTransactionDialog";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Badge } from "@/components/ui/badge";
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
import {
  buildPlRowFromInput,
  computePlSummary,
  isoToday,
  parsePlWorkbook,
  plPresetRange,
  recalculatePlLedger,
  rowInDateRange,
  type PlDateRange,
  type PlRow,
  type PlRowInput,
  type PlSummary,
} from "@/lib/pl-import";
import { cn, formatCurrency } from "@/lib/utils";

const THB = ["THB", "th-TH"] as const;
const DEFAULT_SHEET = "Transaction Log";

type TypeFilter = "all" | "SELL" | "CASH" | "BUY";
type PeriodPreset = "all" | "this_month" | "this_year" | "custom";

function fmtThb(n: number) {
  return formatCurrency(n, THB[0], THB[1]);
}

function TypeBadge({ type }: { type: PlRow["type"] }) {
  if (type === "BUY") {
    return (
      <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
        BUY
      </Badge>
    );
  }
  if (type === "CASH") {
    return (
      <Badge className="border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">
        CASH
      </Badge>
    );
  }
  return (
    <Badge className="border-blue-200 bg-blue-100 text-blue-800 hover:bg-blue-100">
      SELL
    </Badge>
  );
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
  variant?: "profit" | "loss" | "neutral";
}) {
  const border =
    variant === "profit"
      ? "border-l-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/20"
      : variant === "loss"
        ? "border-l-rose-500 bg-rose-50/60 dark:bg-rose-950/20"
        : "border-l-slate-400 bg-muted/40";

  return (
    <Card className={cn("border-l-4", border)}>
      <CardHeader className="pb-1 pt-4">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="text-xl font-bold tabular-nums">{value}</div>
        {sub ? (
          <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function ManagePlPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState(DEFAULT_SHEET);
  const [rawBuffer, setRawBuffer] = useState<ArrayBuffer | null>(null);
  const [rows, setRows] = useState<PlRow[]>([]);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("this_year");
  const [dateFrom, setDateFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [dateTo, setDateTo] = useState(isoToday());
  const [openingStockGrams, setOpeningStockGrams] = useState("");
  const [openingAvgBuyRate, setOpeningAvgBuyRate] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add");
  const [editingRow, setEditingRow] = useState<PlRow | null>(null);

  const openingInputs = useMemo(() => {
    const grams = Number(openingStockGrams);
    const rate = Number(openingAvgBuyRate);
    return {
      openingStockGrams: Number.isFinite(grams) ? grams : 0,
      openingAvgBuyRate: Number.isFinite(rate) ? rate : 0,
    };
  }, [openingStockGrams, openingAvgBuyRate]);

  const dateRange: PlDateRange | null = useMemo(
    () => plPresetRange(periodPreset, dateFrom, dateTo),
    [periodPreset, dateFrom, dateTo]
  );

  const ledgerRows = useMemo(
    () => recalculatePlLedger(rows, openingInputs),
    [rows, openingInputs]
  );

  const summary: PlSummary | null = useMemo(() => {
    if (ledgerRows.length === 0) return null;
    return computePlSummary(ledgerRows, openingInputs, dateRange);
  }, [ledgerRows, openingInputs, dateRange]);

  const filteredRows = useMemo(() => {
    let list = ledgerRows;
    if (dateRange) {
      list = list.filter((r) => rowInDateRange(r, dateRange));
    }
    if (typeFilter === "SELL") return list.filter((r) => r.type === "SELL");
    if (typeFilter === "CASH") return list.filter((r) => r.type === "CASH");
    if (typeFilter === "BUY") return list.filter((r) => r.type === "BUY");
    return list;
  }, [ledgerRows, dateRange, typeFilter]);

  const applyWorkbook = useCallback((buffer: ArrayBuffer, sheet: string) => {
    const result = parsePlWorkbook(buffer, sheet);
    setRows(result.rows);
    setSheetNames(result.sheetNames);
    setSelectedSheet(result.sheetUsed);
    setOpeningStockGrams(String(result.inferredOpening.openingStockGrams));
    setOpeningAvgBuyRate(String(result.inferredOpening.openingAvgBuyRate));
    setParseError(null);
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setParsing(true);
      setParseError(null);
      try {
        const buffer = await file.arrayBuffer();
        setRawBuffer(buffer);
        setFileName(file.name);
        applyWorkbook(buffer, selectedSheet);
      } catch (e) {
        setParseError(
          e instanceof Error ? e.message : "Failed to parse workbook"
        );
        setRows([]);
      } finally {
        setParsing(false);
      }
    },
    [applyWorkbook, selectedSheet]
  );

  const onSheetChange = (sheet: string) => {
    setSelectedSheet(sheet);
    if (rawBuffer) {
      try {
        applyWorkbook(rawBuffer, sheet);
      } catch (e) {
        setParseError(
          e instanceof Error ? e.message : "Failed to parse sheet"
        );
      }
    }
  };

  const handleSaveTransaction = (input: PlRowInput, existing: PlRow | null) => {
    const built = buildPlRowFromInput(input, existing ?? undefined);
    setRows((prev) => {
      if (existing) {
        return prev.map((r) => (r.id === existing.id ? built : r));
      }
      return [...prev, built];
    });
  };

  const handleDeleteTransaction = (row: PlRow) => {
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  };

  const openAddDialog = () => {
    setDialogMode("add");
    setEditingRow(null);
    setDialogOpen(true);
  };

  const openEditDialog = (row: PlRow) => {
    setDialogMode("edit");
    setEditingRow(row);
    setDialogOpen(true);
  };

  const profitVariant = (n: number) => (n >= 0 ? "profit" : "loss");

  const periodLabel =
    periodPreset === "all"
      ? "All time"
      : periodPreset === "this_month"
        ? "This month"
        : periodPreset === "this_year"
          ? "This year"
          : `${dateFrom} → ${dateTo}`;

  return (
    <PageWrapper
      title="Manage P/L"
      description="Import, filter, edit, and add transactions - profit updates automatically."
    >
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="h-4 w-4" />
            Import workbook
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ")
                fileInputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) void handleFile(file);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 transition-colors",
              isDragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/40"
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            {parsing ? (
              <Loader2 className="mb-2 h-8 w-8 animate-spin text-muted-foreground" />
            ) : (
              <UploadCloud className="mb-2 h-8 w-8 text-muted-foreground" />
            )}
            <p className="text-sm font-medium">
              Drop your P/L sheet here or click to browse
            </p>
            {fileName ? (
              <p className="mt-3 text-xs text-primary">{fileName}</p>
            ) : null}
          </div>

          {sheetNames.length > 1 ? (
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">
                Sheet
              </div>
              <Select value={selectedSheet} onValueChange={onSheetChange}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sheetNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {parseError ? (
            <p className="text-sm text-destructive">{parseError}</p>
          ) : null}
        </CardContent>
      </Card>

      {summary ? (
        <>
          <div className="no-print mb-6 flex flex-wrap items-end gap-3">
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">
                Period
              </div>
              <Select
                value={periodPreset}
                onValueChange={(v) => setPeriodPreset(v as PeriodPreset)}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All time</SelectItem>
                  <SelectItem value="this_year">This year</SelectItem>
                  <SelectItem value="this_month">This month</SelectItem>
                  <SelectItem value="custom">Custom range</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {periodPreset === "custom" ? (
              <>
                <div>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">
                    From
                  </div>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-[160px]"
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">
                    To
                  </div>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-[160px]"
                  />
                </div>
              </>
            ) : null}
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">
                Type
              </div>
              <Select
                value={typeFilter}
                onValueChange={(v) => setTypeFilter(v as TypeFilter)}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="SELL">SELL only</SelectItem>
                  <SelectItem value="CASH">CASH only</SelectItem>
                  <SelectItem value="BUY">BUY only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="button" onClick={openAddDialog}>
              <Plus className="mr-1 h-4 w-4" />
              Add transaction
            </Button>
          </div>

          <p className="mb-4 text-xs text-muted-foreground">
            Showing profit for <span className="font-medium">{periodLabel}</span>
            {" · "}
            {filteredRows.length} transaction
            {filteredRows.length === 1 ? "" : "s"} in table
          </p>

          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Opening stock (start of period)
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Stock weight (g)
                </label>
                <Input
                  type="number"
                  step="0.001"
                  value={openingStockGrams}
                  onChange={(e) => setOpeningStockGrams(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Average buy rate (฿/g)
                </label>
                <Input
                  type="number"
                  step="0.0001"
                  value={openingAvgBuyRate}
                  onChange={(e) => setOpeningAvgBuyRate(e.target.value)}
                />
              </div>
              <div className="flex items-end sm:col-span-2">
                <p className="text-sm text-muted-foreground">
                  Period opening value →{" "}
                  <span className="font-semibold text-foreground">
                    {fmtThb(summary.openingStockValue)}
                  </span>
                  {dateRange ? (
                    <span className="block text-xs">
                      ({summary.openingStockGrams.toFixed(3)} g @{" "}
                      {summary.openingAvgBuyRate.toFixed(4)} ฿/g)
                    </span>
                  ) : null}
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Total sales"
              value={fmtThb(summary.totalSalesThb)}
              sub={`${summary.sellCount} SELL/CASH in period`}
            />
            <KpiCard
              label="Total purchases"
              value={fmtThb(summary.totalPurchasesThb)}
              sub={`${summary.buyCount} BUY in period`}
            />
            <KpiCard
              label="Ending stock value"
              value={fmtThb(summary.endingStockValue)}
              sub={`${summary.endingStockGrams.toFixed(3)} g × ${summary.endingAvgBuyRate.toFixed(4)} ฿/g`}
            />
            <KpiCard
              label="Cost of goods sold"
              value={fmtThb(summary.costOfGoodsSold)}
              sub="(Opening + Purchases) − Ending stock"
            />
          </div>

          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <KpiCard
              label="Overall profit"
              value={fmtThb(summary.overallProfit)}
              sub="Sales − COGS for selected period"
              variant={profitVariant(summary.overallProfit)}
            />
            <KpiCard
              label="Sum of transaction profit"
              value={fmtThb(summary.transactionProfitSum)}
              sub="Σ per SELL/CASH in selected period"
              variant={profitVariant(summary.transactionProfitSum)}
            />
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">
                Transactions ({filteredRows.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead className="text-right">Weight (g)</TableHead>
                    <TableHead className="text-right">Value (฿)</TableHead>
                    <TableHead className="text-right">Avg buy (฿/g)</TableHead>
                    <TableHead className="text-right">Cost (฿)</TableHead>
                    <TableHead className="text-right">Profit (฿)</TableHead>
                    <TableHead className="text-right">Stock (g)</TableHead>
                    <TableHead className="w-[52px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={10}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        No transactions match the current filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {r.dateIso ?? r.dateDisplay}
                          {r.isManual ? (
                            <Badge
                              variant="outline"
                              className="ml-1 text-[10px]"
                            >
                              new
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <TypeBadge type={r.type} />
                        </TableCell>
                        <TableCell className="max-w-[120px] truncate text-xs">
                          {r.invoice || "-"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.weightGrams.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtThb(r.valueThb)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {r.avgBuyRate !== null
                            ? r.avgBuyRate.toFixed(4)
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {r.costOfSale !== null ? fmtThb(r.costOfSale) : "-"}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums font-medium",
                            r.profit === null
                              ? "text-muted-foreground"
                              : r.profit >= 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400"
                          )}
                        >
                          {r.profit !== null ? (
                            <span className="inline-flex items-center justify-end gap-1">
                              {r.profit >= 0 ? (
                                <TrendingUp className="h-3 w-3" />
                              ) : (
                                <TrendingDown className="h-3 w-3" />
                              )}
                              {fmtThb(r.profit)}
                            </span>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {r.runningStockGrams !== null
                            ? r.runningStockGrams.toFixed(3)
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openEditDialog(r)}
                            aria-label="Edit transaction"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}

      <PlTransactionDialog
        open={dialogOpen}
        mode={dialogMode}
        row={editingRow}
        onOpenChange={setDialogOpen}
        onSave={handleSaveTransaction}
        onDelete={handleDeleteTransaction}
      />
    </PageWrapper>
  );
}
