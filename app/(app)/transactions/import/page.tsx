"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
  UploadCloud,
  XCircle,
} from "lucide-react";
import * as XLSX from "xlsx";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
import { cn } from "@/lib/utils";
import {
  annotateRunningBalance,
  buildErrorReport,
  markDuplicates,
  parseWorkbook,
  type ParsedRow,
  type ParseError,
} from "@/lib/xlsx-import";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_SHEET = "Stock 2025";
const BATCH_SIZE = 50;

type Step = 1 | 2 | 3 | 4;
type FilterTab = "all" | "errors" | "warnings" | "duplicates" | "valid";
type DupeAction = "skip" | "overwrite";
type InvalidAction = "skip" | "abort";

// ─── Status helpers ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ParsedRow["status"] }) {
  switch (status) {
    case "valid":
      return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">Valid</Badge>;
    case "warning":
      return <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">Warning</Badge>;
    case "error":
      return <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">Error</Badge>;
    case "duplicate":
      return <Badge className="bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100">Duplicate</Badge>;
  }
}

function SummaryCard({
  icon: Icon,
  label,
  count,
  color,
}: {
  icon: React.ElementType;
  label: string;
  count: number;
  color: string;
}) {
  return (
    <Card className="flex-1 min-w-[120px]">
      <CardContent className="pt-4 pb-3">
        <div className={cn("flex items-center gap-2 mb-1", color)}>
          <Icon className="h-4 w-4" />
          <span className="text-xs font-medium">{label}</span>
        </div>
        <div className="text-2xl font-bold">{count}</div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function ImportPage() {
  const router = useRouter();

  // ── Step 1: file upload state ────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(1);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rawBuffer, setRawBuffer] = useState<ArrayBuffer | null>(null);
  const [allSheetNames, setAllSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>(DEFAULT_SHEET);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // ── Step 2: validation state ────────────────────────────────────────────────
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parseErrors, setParseErrors] = useState<ParseError[]>([]);
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [checkingDupes, setCheckingDupes] = useState(false);

  // ── Step 3: import options ───────────────────────────────────────────────────
  const [dupeAction, setDupeAction] = useState<DupeAction>("skip");
  const [invalidAction, setInvalidAction] = useState<InvalidAction>("skip");
  const [openingBalance, setOpeningBalance] = useState<number>(0);
  const [currentSystemBalance, setCurrentSystemBalance] = useState<number | null>(null);
  const [useFileOpeningBalance, setUseFileOpeningBalance] = useState(false);

  // ── Step 4: import progress ─────────────────────────────────────────────────
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [importDone, setImportDone] = useState(false);
  const [importStats, setImportStats] = useState({
    inserted: 0,
    skippedInvalid: 0,
    skippedDupe: 0,
    overwritten: 0,
    failed: 0,
    failedRows: [] as { row: number; error: string }[],
  });

  // ─── Derived counts ──────────────────────────────────────────────────────────
  const errorCount = rows.filter((r) => r.status === "error").length + parseErrors.length;
  const warningCount = rows.filter((r) => r.status === "warning").length;
  const dupeCount = rows.filter((r) => r.isDuplicate).length;
  const validCount = rows.filter((r) => r.status === "valid").length;

  const filteredRows = rows.filter((r) => {
    if (filterTab === "all") return true;
    if (filterTab === "errors") return r.status === "error";
    if (filterTab === "warnings") return r.status === "warning";
    if (filterTab === "duplicates") return r.isDuplicate;
    if (filterTab === "valid") return r.status === "valid";
    return true;
  });

  const willImportCount = rows.filter((r) => {
    if (r.status === "error" && invalidAction === "abort") return false;
    if (r.status === "error") return false; // errors are always skipped
    if (r.isDuplicate && dupeAction === "skip") return false;
    return true;
  }).length;

  // ─── File handling ────────────────────────────────────────────────────────────

  const loadFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      setParseError("Only .xlsx / .xls files are supported.");
      return;
    }
    setFileName(file.name);
    setParseError(null);
    setParsing(true);
    try {
      const buffer = await file.arrayBuffer();
      // Peek at sheet names without full parse.
      const wb = XLSX.read(buffer, { type: "array", bookSheets: true });
      const sheets = wb.SheetNames;
      setAllSheetNames(sheets);
      setRawBuffer(buffer);
      const preferred = sheets.includes(DEFAULT_SHEET) ? DEFAULT_SHEET : (sheets[0] ?? "");
      setSelectedSheet(preferred);
    } catch (e) {
      setParseError(String(e));
    } finally {
      setParsing(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) void loadFile(file);
    },
    [loadFile]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void loadFile(file);
    },
    [loadFile]
  );

  // ─── Parse + validate + duplicate check ──────────────────────────────────────

  const runValidation = useCallback(async () => {
    if (!rawBuffer) return;
    setParsing(true);
    setParseError(null);
    try {
      const result = parseWorkbook(rawBuffer, selectedSheet);
      if (result.parseErrors.length > 0 && result.rows.length === 0) {
        setParseError(result.parseErrors[0]?.message ?? "Unknown parse error");
        return;
      }
      if (result.openingBalanceGrams !== null) {
        annotateRunningBalance(result.rows, result.openingBalanceGrams);
      }

      // Query DB for existing invoice numbers + current ledger balance.
      setCheckingDupes(true);
      try {
        const supabase = getSupabaseClient() as any;
        const [{ data, error }, { data: lastLedger }] = await Promise.all([
          supabase.from("transactions").select("invoice_number"),
          supabase
            .from("stock_ledger")
            .select("balance_grams")
            .order("recorded_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        if (error) throw error;
        const existing = new Set<string>(
          ((data ?? []) as { invoice_number: string }[]).map((r) => r.invoice_number)
        );
        markDuplicates(result.rows, existing);
        const sysBalance = typeof lastLedger?.balance_grams === "number" ? lastLedger.balance_grams : null;
        setCurrentSystemBalance(sysBalance);
        setOpeningBalance(result.openingBalanceGrams ?? 0);
        setUseFileOpeningBalance(false);
      } finally {
        setCheckingDupes(false);
      }

      setRows(result.rows);
      setParseErrors(result.parseErrors);
      setStep(2);
      setFilterTab(
        result.parseErrors.length > 0 || result.rows.some((r) => r.status === "error")
          ? "errors"
          : "all"
      );
    } catch (e) {
      setParseError(String(e));
    } finally {
      setParsing(false);
    }
  }, [rawBuffer, selectedSheet]);

  // ─── Download error report ────────────────────────────────────────────────────

  const downloadErrorReport = useCallback(() => {
    const csv = buildErrorReport(rows, parseErrors);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `import-errors-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rows, parseErrors]);

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  function subtractOneDay(iso: string): string {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }

  // ─── Import ───────────────────────────────────────────────────────────────────

  const runImport = useCallback(async () => {
    const toImport = rows.filter((r) => {
      if (r.status === "error") return false;
      if (r.isDuplicate && dupeAction === "skip") return false;
      return true;
    });

    if (invalidAction === "abort" && errorCount > 0) {
      return; // shouldn't reach here — button disabled
    }

    setImportTotal(toImport.length);
    setImportProgress(0);
    setImportDone(false);
    setImportStats({ inserted: 0, skippedInvalid: 0, skippedDupe: 0, overwritten: 0, failed: 0, failedRows: [] });
    setStep(4);

    const supabase = getSupabaseClient() as any;

    // Cache client id lookups.
    const clientCache = new Map<string, string>();
    async function getOrCreateClientId(name: string): Promise<string> {
      if (clientCache.has(name)) return clientCache.get(name)!;
      const { data: found } = await supabase
        .from("clients")
        .select("id")
        .eq("name", name)
        .limit(1)
        .maybeSingle();
      if (found?.id) { clientCache.set(name, found.id); return found.id; }
      const { data: created, error } = await supabase
        .from("clients")
        .insert({ name })
        .select("id")
        .single();
      if (error) throw error;
      clientCache.set(name, created.id);
      return created.id;
    }

    // Determine starting balance — insert opening entry when DB is empty.
    const ledgerIsEmpty = currentSystemBalance === null;
    let runningBalance: number;

    if (ledgerIsEmpty && openingBalance > 0) {
      const openingDate = subtractOneDay(toImport[0]?.dateIso ?? todayIso());
      await supabase.from("stock_ledger").insert({
        transaction_id: null,
        balance_grams: openingBalance,
        recorded_at: openingDate,
      });
      runningBalance = openingBalance;
    } else {
      runningBalance = useFileOpeningBalance ? openingBalance : (currentSystemBalance ?? 0);
    }

    let inserted = 0;
    let skippedDupe = 0;
    let overwritten = 0;
    let failed = 0;
    const failedRows: { row: number; error: string }[] = [];

    for (let i = 0; i < toImport.length; i += BATCH_SIZE) {
      const batch = toImport.slice(i, i + BATCH_SIZE);

      for (const row of batch) {
        try {
          const clientId = await getOrCreateClientId(row.clientName);
          const delta = row.type === "BUY" ? row.weightGrams : -row.weightGrams;
          runningBalance += delta;

          if (row.isDuplicate && dupeAction === "overwrite") {
            // Upsert on invoice_number.
            const { data: existing } = await supabase
              .from("transactions")
              .select("id")
              .eq("invoice_number", row.invoiceNumber)
              .maybeSingle();

            if (existing?.id) {
              await supabase
                .from("transactions")
                .update({
                  date: row.dateIso,
                  client_id: clientId,
                  type: row.type,
                  weight_grams: row.weightGrams,
                  rate_per_gram: row.ratePerGram,
                  amount_thb: row.amountThb,
                  vat_percent: 0,
                })
                .eq("id", existing.id);
              // Update ledger entry.
              await supabase
                .from("stock_ledger")
                .update({ balance_grams: runningBalance, recorded_at: row.dateIso })
                .eq("transaction_id", existing.id);
              overwritten++;
            } else {
              // Doesn't actually exist — treat as fresh insert.
              const { data: tx, error: txErr } = await supabase
                .from("transactions")
                .insert({
                  date: row.dateIso,
                  client_id: clientId,
                  type: row.type,
                  invoice_number: row.invoiceNumber,
                  weight_grams: row.weightGrams,
                  rate_per_gram: row.ratePerGram,
                  amount_thb: row.amountThb,
                  vat_percent: 0,
                })
                .select("id")
                .single();
              if (txErr) throw txErr;
              await supabase.from("stock_ledger").insert({
                transaction_id: tx.id,
                balance_grams: runningBalance,
                recorded_at: row.dateIso,
              });
              inserted++;
            }
          } else {
            // Fresh insert.
            const { data: tx, error: txErr } = await supabase
              .from("transactions")
              .insert({
                date: row.dateIso,
                client_id: clientId,
                type: row.type,
                invoice_number: row.invoiceNumber,
                weight_grams: row.weightGrams,
                rate_per_gram: row.ratePerGram,
                amount_thb: row.amountThb,
                vat_percent: 0,
              })
              .select("id")
              .single();
            if (txErr) throw txErr;
            await supabase.from("stock_ledger").insert({
              transaction_id: tx.id,
              balance_grams: runningBalance,
              recorded_at: row.dateIso,
            });
            inserted++;
          }
        } catch (e: unknown) {
          failed++;
          failedRows.push({ row: row.sourceRow, error: String(e) });
          // Revert balance delta on failure.
          runningBalance -= row.type === "BUY" ? row.weightGrams : -row.weightGrams;
        }
      }

      setImportProgress(Math.round(((i + batch.length) / toImport.length) * 100));
      setImportStats({
        inserted,
        skippedInvalid: rows.filter((r) => r.status === "error").length,
        skippedDupe,
        overwritten,
        failed,
        failedRows,
      });
      // Yield to UI.
      await new Promise((r) => setTimeout(r, 0));
    }

    setImportStats({
      inserted,
      skippedInvalid: rows.filter((r) => r.status === "error").length,
      skippedDupe: dupeAction === "skip" ? dupeCount : 0,
      overwritten,
      failed,
      failedRows,
    });
    setImportProgress(100);
    setImportDone(true);
  }, [rows, dupeAction, invalidAction, errorCount, dupeCount, openingBalance, currentSystemBalance, useFileOpeningBalance]);

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <PageWrapper
      title="Import Excel"
      description="Upload a spreadsheet to bulk-create transactions. Review the preview before committing."
    >
      {/* Step breadcrumb */}
      <div className="mb-6 flex items-center gap-1 text-sm text-muted-foreground">
        {(["Upload", "Validate", "Options", "Import"] as const).map((label, idx) => {
          const s = (idx + 1) as Step;
          return (
            <span key={label} className="flex items-center gap-1">
              {idx > 0 && <ChevronRight className="h-3.5 w-3.5" />}
              <span
                className={cn(
                  "font-medium",
                  step === s ? "text-foreground" : step > s ? "text-primary" : ""
                )}
              >
                {s}. {label}
              </span>
            </span>
          );
        })}
      </div>

      {/* ────────── STEP 1: Upload ────────── */}
      {step === 1 && (
        <div className="space-y-5">
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-14 transition-colors",
              isDragging
                ? "border-primary bg-primary/5"
                : "border-border bg-card hover:border-primary/50 hover:bg-muted/30"
            )}
          >
            <div className="rounded-full bg-muted p-5">
              <UploadCloud className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-foreground">
                {fileName ? fileName : "Drop your Excel file here"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                or click to browse &nbsp;·&nbsp; .xlsx / .xls
              </p>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileChange}
          />

          <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
            <span>
              <strong>Importing multiple years?</strong> Upload one file per year, starting from the oldest year.
              Each year&apos;s closing balance automatically becomes the next year&apos;s opening balance.
            </span>
          </div>

          {parseError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {parseError}
            </div>
          )}

          {rawBuffer && (
            <Card>
              <CardContent className="pt-4 pb-4 space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  <span className="font-medium">{fileName}</span>
                </div>
                {allSheetNames.length > 1 && (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">Sheet:</span>
                    <Select value={selectedSheet} onValueChange={setSelectedSheet}>
                      <SelectTrigger className="w-52">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {allSheetNames.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button
                  onClick={() => void runValidation()}
                  disabled={parsing || checkingDupes}
                  className="w-full"
                >
                  {parsing || checkingDupes ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {checkingDupes ? "Checking for duplicates…" : "Parsing…"}
                    </>
                  ) : (
                    "Validate & Preview"
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-start">
            <Button variant="ghost" asChild>
              <Link href="/transactions">Cancel</Link>
            </Button>
          </div>
        </div>
      )}

      {/* ────────── STEP 2: Validate & Preview ────────── */}
      {step === 2 && (
        <div className="space-y-5">
          {/* Summary cards */}
          <div className="flex flex-wrap gap-3">
            <SummaryCard icon={CheckCircle2} label="Valid" count={validCount} color="text-emerald-600" />
            <SummaryCard icon={AlertTriangle} label="Warnings" count={warningCount} color="text-amber-600" />
            <SummaryCard icon={XCircle} label="Errors" count={errorCount} color="text-red-600" />
            <SummaryCard icon={Info} label="Duplicates" count={dupeCount} color="text-blue-600" />
          </div>

          {errorCount > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>{errorCount} row{errorCount !== 1 ? "s" : ""}</strong> have errors and will be skipped during import.
                {" "}Download the error report to fix them in your Excel file.
              </span>
            </div>
          )}

          {dupeCount > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>{dupeCount} record{dupeCount !== 1 ? "s" : ""}</strong> already exist in the system with the same invoice number.
                You can choose to skip or overwrite them in the next step.
              </span>
            </div>
          )}

          {/* Filter tabs */}
          <div className="flex gap-1 border-b">
            {(["all", "errors", "warnings", "duplicates", "valid"] as FilterTab[]).map((tab) => {
              const labels: Record<FilterTab, string> = {
                all: `All (${rows.length})`,
                errors: `Errors (${errorCount})`,
                warnings: `Warnings (${warningCount})`,
                duplicates: `Duplicates (${dupeCount})`,
                valid: `Valid (${validCount})`,
              };
              return (
                <button
                  key={tab}
                  onClick={() => setFilterTab(tab)}
                  className={cn(
                    "px-3 py-2 text-sm font-medium transition-colors",
                    filterTab === tab
                      ? "border-b-2 border-primary text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {labels[tab]}
                </button>
              );
            })}
          </div>

          {/* Preview table */}
          <div className="rounded-lg border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Row</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="w-[110px]">Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="w-[80px]">Type</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead className="text-right">Weight (g)</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Amount (THB)</TableHead>
                  <TableHead>Issues</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      No rows match this filter.
                    </TableCell>
                  </TableRow>
                )}
                {filteredRows.map((r) => (
                  <TableRow
                    key={`${r.sourceRow}-${r.type}`}
                    className={cn(
                      r.status === "error" && "bg-red-50/50",
                      r.status === "warning" && "bg-amber-50/50",
                      r.isDuplicate && r.status !== "error" && "bg-blue-50/50"
                    )}
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.sourceRow}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell className="font-medium">{r.dateIso}</TableCell>
                    <TableCell>{r.clientName}</TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          "font-mono",
                          r.type === "BUY"
                            ? "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                            : "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100"
                        )}
                      >
                        {r.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.invoiceNumber}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.weightGrams.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.ratePerGram.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.amountThb.toLocaleString()}</TableCell>
                    <TableCell className="max-w-[260px]">
                      {r.issues.length > 0 && (
                        <ul className="text-xs space-y-0.5">
                          {r.issues.map((issue, i) => (
                            <li key={i} className="text-muted-foreground">{issue}</li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                  </TableRow>
                ))}

                {/* Parse error rows (no full row data) */}
                {filterTab === "all" || filterTab === "errors"
                  ? parseErrors.map((e) => (
                    <TableRow key={`pe-${e.sourceRow}`} className="bg-red-50/50">
                      <TableCell className="font-mono text-xs text-muted-foreground">{e.sourceRow}</TableCell>
                      <TableCell><Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">Error</Badge></TableCell>
                      <TableCell colSpan={7} className="text-xs text-red-600">{e.message}</TableCell>
                      <TableCell />
                    </TableRow>
                  ))
                  : null}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {(errorCount > 0 || warningCount > 0) && (
                <Button variant="outline" size="sm" onClick={downloadErrorReport}>
                  <Download className="mr-2 h-3.5 w-3.5" />
                  Download Error Report
                </Button>
              )}
              <Button variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
            </div>
            <Button
              onClick={() => setStep(3)}
              disabled={validCount === 0 && dupeCount === 0}
            >
              Continue to Options
            </Button>
          </div>
        </div>
      )}

      {/* ────────── STEP 3: Import Options ────────── */}
      {step === 3 && (
        <div className="space-y-5 max-w-xl">

          {/* Opening Balance panel */}
          {currentSystemBalance === null ? (
            /* State A — fresh import, DB is empty */
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Opening Balance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  The database is empty. This value will be written as the starting balance before the first transaction.
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(parseFloat(e.target.value) || 0)}
                    className="w-44 rounded-md border border-input bg-background px-3 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <span className="text-sm text-muted-foreground">grams</span>
                </div>
              </CardContent>
            </Card>
          ) : Math.abs(openingBalance - currentSystemBalance) < 0.005 ? (
            /* State B — continuation, G3 matches system balance */
            <Card className="border-emerald-200 bg-emerald-50/50">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <div>
                    <div className="text-sm font-semibold text-emerald-800">Balance continuity confirmed</div>
                    <div className="mt-1 text-xs text-emerald-700">
                      File opening (G3): <strong>{openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} g</strong>
                      {" = "}
                      System closing: <strong>{currentSystemBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} g</strong>
                    </div>
                    <div className="mt-0.5 text-xs text-emerald-700">Import will continue from current system balance.</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            /* State C — continuation, G3 does NOT match system balance */
            <Card className="border-amber-300 bg-amber-50/50">
              <CardContent className="pt-4 pb-4 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div>
                    <div className="text-sm font-semibold text-amber-800">Balance mismatch detected</div>
                    <div className="mt-1 text-xs text-amber-700">
                      File opening (G3): <strong>{openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} g</strong>
                      {" ≠ "}
                      System closing: <strong>{currentSystemBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} g</strong>
                    </div>
                    <p className="mt-1 text-xs text-amber-700">
                      This may mean the file is out of order, covers a gap year, or has a discrepancy.
                      The import will use the <strong>system balance ({currentSystemBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} g)</strong> as the starting point.
                      Proceed only if you are sure.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setUseFileOpeningBalance((v) => !v)}
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                    useFileOpeningBalance
                      ? "border-amber-400 bg-amber-100 text-amber-800 font-medium"
                      : "border-border text-muted-foreground hover:bg-muted/40"
                  )}
                >
                  {useFileOpeningBalance
                    ? `✓ Using file value (${openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} g) instead`
                    : `Override and use file value (${openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} g) instead`}
                </button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">How to handle invalid rows?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(["skip", "abort"] as InvalidAction[]).map((opt) => (
                <label
                  key={opt}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                    invalidAction === opt ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"
                  )}
                >
                  <input
                    type="radio"
                    className="mt-0.5"
                    checked={invalidAction === opt}
                    onChange={() => setInvalidAction(opt)}
                  />
                  <div>
                    <div className="text-sm font-medium">
                      {opt === "skip" ? "Skip invalid rows (recommended)" : "Abort entire import if any errors"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {opt === "skip"
                        ? `Import ${validCount + (dupeAction === "skip" ? 0 : dupeCount)} valid rows; skip ${errorCount} error row${errorCount !== 1 ? "s" : ""}`
                        : errorCount > 0
                        ? `Will NOT import — ${errorCount} error${errorCount !== 1 ? "s" : ""} must be fixed first`
                        : "No errors detected — import will proceed normally"}
                    </div>
                  </div>
                </label>
              ))}
            </CardContent>
          </Card>

          {dupeCount > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  How to handle {dupeCount} duplicate{dupeCount !== 1 ? "s" : ""}?
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(["skip", "overwrite"] as DupeAction[]).map((opt) => (
                  <label
                    key={opt}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                      dupeAction === opt ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"
                    )}
                  >
                    <input
                      type="radio"
                      className="mt-0.5"
                      checked={dupeAction === opt}
                      onChange={() => setDupeAction(opt)}
                    />
                    <div>
                      <div className="text-sm font-medium">
                        {opt === "skip" ? "Skip duplicates (recommended)" : "Overwrite existing records"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {opt === "skip"
                          ? "Rows already in the system will be ignored"
                          : "Existing transactions will be updated with values from this file"}
                      </div>
                    </div>
                  </label>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Summary */}
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-4 pb-4">
              <div className="text-sm font-medium text-foreground">
                Import summary
              </div>
              <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                <div>Will import: <strong className="text-foreground">{willImportCount} record{willImportCount !== 1 ? "s" : ""}</strong></div>
                {errorCount > 0 && (
                  <div>Skip (errors): <strong className="text-red-600">{errorCount}</strong></div>
                )}
                {dupeCount > 0 && dupeAction === "skip" && (
                  <div>Skip (duplicates): <strong className="text-blue-600">{dupeCount}</strong></div>
                )}
                {dupeCount > 0 && dupeAction === "overwrite" && (
                  <div>Overwrite: <strong className="text-amber-600">{dupeCount}</strong></div>
                )}
              </div>
            </CardContent>
          </Card>

          {invalidAction === "abort" && errorCount > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              Import is blocked: fix {errorCount} error{errorCount !== 1 ? "s" : ""} and re-upload the file.
            </div>
          )}

          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
            <Button
              onClick={() => void runImport()}
              disabled={invalidAction === "abort" && errorCount > 0 || willImportCount === 0}
            >
              Start Import ({willImportCount} records)
            </Button>
          </div>
        </div>
      )}

      {/* ────────── STEP 4: Import Progress + Results ────────── */}
      {step === 4 && (
        <div className="space-y-6 max-w-xl">
          {!importDone && (
            <Card>
              <CardContent className="pt-6 pb-6 space-y-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="font-medium">Importing records…</span>
                </div>
                <Progress value={importProgress} className="h-3" />
                <div className="text-sm text-muted-foreground text-right">
                  {Math.round((importProgress / 100) * importTotal)} / {importTotal}
                </div>
              </CardContent>
            </Card>
          )}

          {importDone && (
            <>
              <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                <div>
                  <div className="font-semibold text-emerald-800">Import complete</div>
                  <div className="text-sm text-emerald-700">
                    {importStats.inserted} inserted
                    {importStats.overwritten > 0 ? ` · ${importStats.overwritten} overwritten` : ""}
                    {importStats.skippedInvalid > 0 ? ` · ${importStats.skippedInvalid} skipped (errors)` : ""}
                    {importStats.skippedDupe > 0 ? ` · ${importStats.skippedDupe} skipped (duplicates)` : ""}
                    {importStats.failed > 0 ? ` · ${importStats.failed} failed` : ""}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <SummaryCard icon={CheckCircle2} label="Inserted" count={importStats.inserted} color="text-emerald-600" />
                {importStats.overwritten > 0 && (
                  <SummaryCard icon={Info} label="Overwritten" count={importStats.overwritten} color="text-amber-600" />
                )}
                {importStats.skippedInvalid > 0 && (
                  <SummaryCard icon={XCircle} label="Skipped (errors)" count={importStats.skippedInvalid} color="text-red-600" />
                )}
                {importStats.skippedDupe > 0 && (
                  <SummaryCard icon={Info} label="Skipped (dupes)" count={importStats.skippedDupe} color="text-blue-600" />
                )}
                {importStats.failed > 0 && (
                  <SummaryCard icon={XCircle} label="Failed" count={importStats.failed} color="text-red-600" />
                )}
              </div>

              {importStats.failedRows.length > 0 && (
                <Card className="border-red-200">
                  <CardHeader>
                    <CardTitle className="text-sm text-red-700">Failed rows</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded border bg-muted p-3 text-xs font-mono space-y-1 max-h-48 overflow-y-auto">
                      {importStats.failedRows.map((f) => (
                        <div key={f.row}>Row {f.row}: {f.error}</div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex gap-3">
                <Button asChild>
                  <Link href="/transactions">View Transactions</Link>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep(1);
                    setRows([]);
                    setParseErrors([]);
                    setFileName(null);
                    setRawBuffer(null);
                    setImportDone(false);
                    setImportProgress(0);
                  }}
                >
                  Import another file
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </PageWrapper>
  );
}
