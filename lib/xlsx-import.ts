/**
 * Browser-safe Excel import parsing library.
 * Ported from scripts/migrate.ts — no Node.js APIs used.
 */

import * as XLSX from "xlsx";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TxType = "BUY" | "SELL";

export type RowStatus = "valid" | "warning" | "error" | "duplicate";

export interface ParsedRow {
  /** 1-based Excel row number */
  sourceRow: number;
  dateIso: string;
  clientName: string;
  type: TxType;
  invoiceNumber: string;
  weightGrams: number;
  ratePerGram: number;
  amountThb: number;
  sheetBalanceGrams: number | null;

  status: RowStatus;
  /** Human-readable issues for this row (may be errors or warnings) */
  issues: string[];
  /** True if rate/amount was derived from the other field */
  derived: boolean;
  /** True if this row's invoice_number already exists in the DB */
  isDuplicate: boolean;
}

export interface ParseError {
  sourceRow: number;
  message: string;
}

export interface ParseResult {
  sheetNames: string[];
  rows: ParsedRow[];
  parseErrors: ParseError[];
  openingBalanceGrams: number | null;
}

// ─── Internal helpers (mirrors migrate.ts) ────────────────────────────────────

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.trim().replace(/,/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toStringOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rawCell(ws: any, addr: string): { t: unknown; v: unknown; w: unknown; f: unknown } | null {
  const c = ws?.[addr];
  if (!c) return null;
  return { t: c.t ?? null, v: c.v ?? null, w: c.w ?? null, f: c.f ?? null };
}

function isFormulaUncached(
  cell: { t: unknown; v: unknown; w: unknown; f: unknown } | null
): boolean {
  if (!cell) return false;
  return Boolean(cell.f) && (cell.v === null || cell.v === undefined);
}

/** Returns a YYYY-MM-DD string from an Excel cell value (serial number). */
function parseExcelDate(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    const dc = XLSX.SSF.parse_date_code(v);
    if (!dc) return null;
    return `${dc.y}-${String(dc.m).padStart(2, "0")}-${String(dc.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${dy}`;
}

export function normalizeClientName(raw: string): string {
  const trimmed = raw.trim();
  const overrides: Record<string, string> = {
    "Gold jewelry": "Gold Jewelry",
    KAA: "Kaa",
    LUME: "Lume",
    ROyal: "Royal",
    royal: "Royal",
    "Raja's": "Rajas",
  };
  const overridden = overrides[trimmed] ?? trimmed;
  return overridden
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function synthInvoice(dateIso: string, row: number, type: TxType): string {
  return `MIG${dateIso.replace(/-/g, "")}R${row}${type}`;
}

function roundDiv(num: number, den: number): number {
  return Math.round(num / den);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a raw ArrayBuffer of an .xlsx file and return all parsed rows plus
 * any row-level parse errors. Does NOT query the DB (duplicate checking is
 * separate).
 */
export function parseWorkbook(
  buffer: ArrayBuffer,
  sheetName?: string
): ParseResult {
  // IMPORTANT: no cellDates — serial numbers are timezone-safe via SSF.parse_date_code
  const wb = XLSX.read(buffer, { type: "array" });

  const sheetNames = wb.SheetNames;
  const resolvedSheet = sheetName ?? sheetNames[0] ?? "";
  const ws = wb.Sheets[resolvedSheet];

  if (!ws) {
    return {
      sheetNames,
      rows: [],
      parseErrors: [{ sourceRow: 0, message: `Sheet "${resolvedSheet}" not found.` }],
      openingBalanceGrams: null,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getCell = (addr: string): unknown => ((ws as any)[addr] as { v?: unknown } | undefined)?.v;

  const openingBalanceGrams = toNumber(getCell("G3"));

  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");
  const START_ROW = 4;

  const rows: ParsedRow[] = [];
  const parseErrors: ParseError[] = [];

  // Track invoice numbers within this file for intra-file duplicate detection.
  const invoiceCount = new Map<string, number>();
  const invoiceRows = new Map<string, number[]>();

  for (let r = START_ROW; r <= range.e.r + 1; r++) {
    const dateIso = parseExcelDate(getCell(`A${r}`));
    const rawName = toStringOrNull(getCell(`B${r}`));

    // Empty row — skip silently.
    if (!dateIso && !rawName) continue;

    const rowIssues: string[] = [];
    let hasError = false;

    if (!dateIso) {
      parseErrors.push({ sourceRow: r, message: "Missing or invalid date (column A)" });
      hasError = true;
    }
    if (!rawName) {
      parseErrors.push({ sourceRow: r, message: "Missing client name (column B)" });
      hasError = true;
    }
    if (hasError) continue;

    const clientName = normalizeClientName(rawName!);
    const buyWeight = toNumber(getCell(`E${r}`));
    const sellWeight = toNumber(getCell(`F${r}`));
    const sheetBal = toNumber(getCell(`G${r}`));
    const sheetBalanceGrams = sheetBal;

    // Must have at least one of BUY or SELL weight on this row.
    if ((buyWeight === null || buyWeight === 0) && (sellWeight === null || sellWeight === 0)) {
      parseErrors.push({
        sourceRow: r,
        message: "Row has neither BUY weight (E) nor SELL weight (F)",
      });
      continue;
    }

    const processTransaction = (
      txType: TxType,
      weight: number,
      rateColRaw: string,
      amtColRaw: string,
      invoiceColPrimary: string,
      invoiceColFallback: string,
      isLastOnRow: boolean
    ): ParsedRow | null => {
      const issues: string[] = [];
      let hasRowError = false;

      if (weight <= 0) {
        issues.push(`${txType} weight must be > 0 (got ${weight})`);
        hasRowError = true;
      }

      const rawRate = rawCell(ws, rateColRaw);
      const rawAmt = rawCell(ws, amtColRaw);
      const rateVal = toNumber(getCell(rateColRaw));
      const amtVal = toNumber(getCell(amtColRaw));

      if (isFormulaUncached(rawRate)) {
        issues.push(`${txType} rate cell (${rateColRaw}) has an uncached formula — open and save the Excel file to cache values`);
        hasRowError = true;
      }
      if (isFormulaUncached(rawAmt)) {
        issues.push(`${txType} amount cell (${amtColRaw}) has an uncached formula — open and save the Excel file to cache values`);
        hasRowError = true;
      }

      if (hasRowError) {
        parseErrors.push({ sourceRow: r, message: issues.join("; ") });
        return null;
      }

      let finalRate = rateVal;
      let finalAmt = amtVal;
      let derived = false;

      if (finalRate === null && finalAmt !== null && weight > 0) {
        finalRate = finalAmt / weight;
        derived = true;
        issues.push(`Rate derived from amount ÷ weight`);
      }
      if (finalAmt === null && finalRate !== null && weight > 0) {
        finalAmt = finalRate * weight;
        derived = true;
        issues.push(`Amount derived from rate × weight`);
      }

      if (finalRate === null) {
        issues.push(`Missing ${txType} rate per gram (${rateColRaw}) — cannot derive without amount`);
        hasRowError = true;
      }
      if (finalAmt === null) {
        issues.push(`Missing ${txType} amount THB (${amtColRaw}) — cannot derive without rate`);
        hasRowError = true;
      }

      if (finalRate !== null && finalRate <= 0) {
        issues.push(`${txType} rate must be > 0 (got ${finalRate})`);
        hasRowError = true;
      }

      if (hasRowError) {
        parseErrors.push({ sourceRow: r, message: issues.join("; ") });
        return null;
      }

      const invoicePrimary = toStringOrNull(getCell(invoiceColPrimary));
      const invoiceFallback = toStringOrNull(getCell(invoiceColFallback));
      const invoiceNumber =
        invoicePrimary ?? invoiceFallback ?? synthInvoice(dateIso!, r, txType);

      // Track intra-file duplicates.
      invoiceCount.set(invoiceNumber, (invoiceCount.get(invoiceNumber) ?? 0) + 1);
      if (!invoiceRows.has(invoiceNumber)) invoiceRows.set(invoiceNumber, []);
      invoiceRows.get(invoiceNumber)!.push(r);

      // Cross-check amount vs rate × weight (warn if > 1 THB difference).
      const computed = roundDiv(finalRate! * weight * 100, 1) / 100;
      const diff = Math.abs(computed - finalAmt!);
      if (diff > 1) {
        issues.push(
          `Amount (${finalAmt!.toFixed(2)}) differs from rate×weight (${computed.toFixed(2)}) by ${diff.toFixed(2)} THB`
        );
      }

      return {
        sourceRow: r,
        dateIso: dateIso!,
        clientName,
        type: txType,
        invoiceNumber,
        weightGrams: weight,
        ratePerGram: finalRate!,
        amountThb: finalAmt!,
        sheetBalanceGrams: isLastOnRow ? sheetBalanceGrams : null,
        status: hasRowError ? "error" : issues.length > 0 ? "warning" : "valid",
        issues,
        derived,
        isDuplicate: false, // filled later
      };
    };

    const hasBuy = buyWeight !== null && buyWeight !== 0;
    const hasSell = sellWeight !== null && sellWeight !== 0;

    if (hasBuy) {
      const row = processTransaction(
        "BUY",
        buyWeight!,
        `J${r}`, `K${r}`,
        `C${r}`, `D${r}`,
        !hasSell
      );
      if (row) rows.push(row);
    }

    if (hasSell) {
      const row = processTransaction(
        "SELL",
        sellWeight!,
        `M${r}`, `N${r}`,
        `D${r}`, `C${r}`,
        true
      );
      if (row) rows.push(row);
    }
  }

  // Mark intra-file duplicates (same invoice_number appears more than once).
  for (const row of rows) {
    const count = invoiceCount.get(row.invoiceNumber) ?? 1;
    if (count > 1) {
      row.issues.push(
        `Invoice "${row.invoiceNumber}" appears ${count} times in this file (rows ${invoiceRows.get(row.invoiceNumber)!.join(", ")})`
      );
      row.status = "error";
    }
  }

  return { sheetNames, rows, parseErrors, openingBalanceGrams };
}

/**
 * Compute the running balance across the parsed rows (starting from an opening
 * balance) and add a warning to any row where the sheet's G column disagrees.
 */
export function annotateRunningBalance(
  rows: ParsedRow[],
  openingBalanceGrams: number
): void {
  let running = openingBalanceGrams;
  for (const row of rows) {
    running = row.type === "BUY" ? running + row.weightGrams : running - row.weightGrams;
    if (row.sheetBalanceGrams !== null) {
      const diff = Math.abs(running - row.sheetBalanceGrams);
      if (diff > 0.001) {
        row.issues.push(
          `Running balance mismatch: computed ${running.toFixed(3)} g vs sheet ${row.sheetBalanceGrams.toFixed(3)} g`
        );
        if (row.status === "valid") row.status = "warning";
      }
    }
  }
}

/**
 * Given the parsed rows and a set of invoice_numbers already in the DB,
 * mark each row's isDuplicate flag and update its status.
 */
export function markDuplicates(rows: ParsedRow[], existingInvoices: Set<string>): void {
  for (const row of rows) {
    if (existingInvoices.has(row.invoiceNumber)) {
      row.isDuplicate = true;
      if (row.status === "valid" || row.status === "warning") {
        row.status = "duplicate";
      }
    }
  }
}

/** Build a CSV string of all errored/warned rows for download. */
export function buildErrorReport(rows: ParsedRow[], parseErrors: ParseError[]): string {
  const lines: string[] = [
    ["Row", "Type", "Date", "Client", "Invoice", "Status", "Issues"].join(","),
  ];

  for (const e of parseErrors) {
    lines.push([e.sourceRow, "", "", "", "", "parse-error", JSON.stringify(e.message)].join(","));
  }

  for (const r of rows.filter((r) => r.status !== "valid")) {
    lines.push(
      [
        r.sourceRow,
        r.type,
        r.dateIso,
        `"${r.clientName}"`,
        r.invoiceNumber,
        r.status,
        `"${r.issues.join(" | ")}"`,
      ].join(",")
    );
  }

  return lines.join("\n");
}
