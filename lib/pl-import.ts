/**
 * P/L adjustment workbook parser and profit calculations.
 * Expected sheet layout matches `pl adjustment.xlsx` — "Transaction Log" sheet.
 */

import * as XLSX from "xlsx";

export type PlTxType = "BUY" | "SELL" | "CASH";

export interface PlRow {
  id: string;
  sourceRow: number;
  type: PlTxType;
  month: string;
  dateDisplay: string;
  dateIso: string | null;
  invoice: string;
  customer: string;
  weightGrams: number;
  ratePerGram: number;
  valueThb: number;
  /** Weighted average buy rate (WAC) at this transaction */
  avgBuyRate: number | null;
  costOfSale: number | null;
  /** Per-transaction profit (SELL/CASH only) */
  profit: number | null;
  runningStockGrams: number | null;
  note: string;
  /** User-added row (not from Excel row number) */
  isManual?: boolean;
}

export interface PlOpeningInputs {
  openingStockGrams: number;
  openingAvgBuyRate: number;
}

export interface PlDateRange {
  from: string;
  to: string;
}

export interface PlSummary {
  openingStockGrams: number;
  openingAvgBuyRate: number;
  openingStockValue: number;
  totalSalesThb: number;
  totalPurchasesThb: number;
  endingStockGrams: number;
  endingAvgBuyRate: number;
  endingStockValue: number;
  /** (opening stock value + purchases) − ending stock value */
  costOfGoodsSold: number;
  /** Total sale − COGS */
  overallProfit: number;
  /** Sum of per-transaction profit on SELL/CASH rows */
  transactionProfitSum: number;
  sellCount: number;
  buyCount: number;
  dateFrom: string | null;
  dateTo: string | null;
}

export interface ParsePlResult {
  sheetNames: string[];
  sheetUsed: string;
  rows: PlRow[];
  summary: PlSummary;
  inferredOpening: PlOpeningInputs;
}

export type PlRowInput = Pick<
  PlRow,
  | "type"
  | "dateIso"
  | "invoice"
  | "customer"
  | "weightGrams"
  | "ratePerGram"
  | "valueThb"
  | "note"
>;

function toNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v === null || v === undefined) return 0;
  const cleaned = String(v).trim().replace(/,/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function toStringOrEmpty(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

export function createPlRowId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `pl-${crypto.randomUUID()}`;
  }
  return `pl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Buddhist era dates like 06/01/2568 → 2025-01-06 */
export function parsePlDate(raw: unknown): { display: string; iso: string | null } {
  const display = toStringOrEmpty(raw);
  if (!display) return { display: "", iso: null };

  if (/^\d{4}-\d{2}-\d{2}$/.test(display)) {
    return { display, iso: display };
  }

  const slash = display.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, dd, mm, yearStr] = slash;
    let year = Number(yearStr);
    if (year > 2400) year -= 543;
    const iso = `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    return { display, iso };
  }

  const d = new Date(display);
  if (!Number.isNaN(d.getTime())) {
    const iso = d.toISOString().slice(0, 10);
    return { display, iso };
  }

  return { display, iso: null };
}

function normalizeType(raw: string): PlTxType | null {
  const t = raw.toUpperCase();
  if (t.includes("CASH")) return "CASH";
  if (t.includes("SELL")) return "SELL";
  if (t.includes("BUY")) return "BUY";
  return null;
}

function isSaleType(type: PlTxType): boolean {
  return type === "SELL" || type === "CASH";
}

export function sortPlRows(rows: PlRow[]): PlRow[] {
  return [...rows].sort((a, b) => {
    const da = a.dateIso ?? "9999-12-31";
    const db = b.dateIso ?? "9999-12-31";
    if (da !== db) return da.localeCompare(db);
    if (a.sourceRow !== b.sourceRow) return a.sourceRow - b.sourceRow;
    return a.id.localeCompare(b.id);
  });
}

export function rowInDateRange(row: PlRow, range: PlDateRange): boolean {
  if (!row.dateIso) return false;
  return row.dateIso >= range.from && row.dateIso <= range.to;
}

/**
 * Per-transaction profit on a sale:
 * Profit = sale value − (weight × average buy rate)
 */
export function computeTransactionProfit(
  type: PlTxType,
  weightGrams: number,
  valueThb: number,
  avgBuyRate: number | null
): number | null {
  if (!isSaleType(type)) return null;
  if (weightGrams <= 0 || avgBuyRate === null || avgBuyRate <= 0) return null;
  return valueThb - weightGrams * avgBuyRate;
}

function monthFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { month: "short" });
}

export function buildPlRowFromInput(
  input: PlRowInput,
  existing?: PlRow
): PlRow {
  const dateIso = input.dateIso;
  const weightGrams = input.weightGrams;
  const ratePerGram =
    input.ratePerGram > 0
      ? input.ratePerGram
      : weightGrams > 0
        ? input.valueThb / weightGrams
        : 0;
  const valueThb =
    input.valueThb > 0
      ? input.valueThb
      : weightGrams > 0 && ratePerGram > 0
        ? weightGrams * ratePerGram
        : 0;

  return {
    id: existing?.id ?? createPlRowId(),
    sourceRow: existing?.sourceRow ?? 0,
    type: input.type,
    month: dateIso ? monthFromIso(dateIso) : existing?.month ?? "",
    dateDisplay: dateIso ?? existing?.dateDisplay ?? "",
    dateIso,
    invoice: input.invoice.trim(),
    customer: input.customer.trim(),
    weightGrams,
    ratePerGram,
    valueThb,
    avgBuyRate: null,
    costOfSale: null,
    profit: null,
    runningStockGrams: null,
    note: input.note.trim(),
    isManual: existing?.isManual ?? !existing,
  };
}

interface StockState {
  stockGrams: number;
  avgBuyRate: number;
}

function applyRowToStock(state: StockState, row: PlRow): StockState {
  if (row.type === "BUY") {
    const buyValue = row.valueThb;
    const newStock = state.stockGrams + row.weightGrams;
    const newWac =
      newStock > 0
        ? (state.stockGrams * state.avgBuyRate + buyValue) / newStock
        : state.avgBuyRate;
    return { stockGrams: newStock, avgBuyRate: newWac };
  }

  if (isSaleType(row.type)) {
    return {
      stockGrams: Math.max(0, state.stockGrams - row.weightGrams),
      avgBuyRate: state.avgBuyRate,
    };
  }

  return state;
}

/** Walk rows in order and return stock/WAC after each step. */
function walkLedger(
  rows: PlRow[],
  opening: PlOpeningInputs
): StockState[] {
  const sorted = sortPlRows(rows);
  const states: StockState[] = [];
  let state: StockState = {
    stockGrams: opening.openingStockGrams,
    avgBuyRate: opening.openingAvgBuyRate,
  };

  for (const row of sorted) {
    if (row.type === "BUY") {
      const buyValue = row.valueThb;
      const newStock = state.stockGrams + row.weightGrams;
      const newWac =
        newStock > 0
          ? (state.stockGrams * state.avgBuyRate + buyValue) / newStock
          : state.avgBuyRate;
      state = { stockGrams: newStock, avgBuyRate: newWac };
    } else if (isSaleType(row.type)) {
      state = {
        stockGrams: Math.max(0, state.stockGrams - row.weightGrams),
        avgBuyRate: state.avgBuyRate,
      };
    }
    states.push({ ...state });
  }

  return states;
}

/** Recompute WAC, running stock, cost, and profit for every row. */
export function recalculatePlLedger(
  rows: PlRow[],
  opening: PlOpeningInputs
): PlRow[] {
  const sorted = sortPlRows(rows);
  let stock = opening.openingStockGrams;
  let wac = opening.openingAvgBuyRate;

  return sorted.map((row) => {
    const next = { ...row };

    if (row.type === "BUY") {
      const newStock = stock + row.weightGrams;
      if (newStock > 0 && row.weightGrams > 0) {
        wac = (stock * wac + row.valueThb) / newStock;
      }
      stock = newStock;
      next.avgBuyRate = wac;
      next.costOfSale = null;
      next.profit = null;
      next.runningStockGrams = stock;
      return next;
    }

    if (isSaleType(row.type)) {
      const saleWac = wac;
      next.avgBuyRate = saleWac;
      const cost = row.weightGrams * saleWac;
      next.costOfSale = cost;
      next.profit = row.valueThb - cost;
      stock = Math.max(0, stock - row.weightGrams);
      next.runningStockGrams = stock;
      return next;
    }

    return next;
  });
}

function resolveOpening(
  rows: PlRow[],
  opening?: Partial<PlOpeningInputs>
): PlOpeningInputs {
  const inferred = inferOpeningFromRows(rows);
  return {
    openingStockGrams: opening?.openingStockGrams ?? inferred.openingStockGrams,
    openingAvgBuyRate: opening?.openingAvgBuyRate ?? inferred.openingAvgBuyRate,
  };
}

function stockStateBeforeDate(
  rows: PlRow[],
  opening: PlOpeningInputs,
  beforeIso: string
): StockState {
  const sorted = sortPlRows(rows).filter(
    (r) => r.dateIso && r.dateIso < beforeIso
  );
  let state: StockState = {
    stockGrams: opening.openingStockGrams,
    avgBuyRate: opening.openingAvgBuyRate,
  };
  for (const row of sorted) {
    state = applyRowToStock(state, row);
  }
  return state;
}

function stockStateThroughDate(
  rows: PlRow[],
  opening: PlOpeningInputs,
  throughIso: string
): StockState {
  const sorted = sortPlRows(rows).filter(
    (r) => r.dateIso && r.dateIso <= throughIso
  );
  let state: StockState = {
    stockGrams: opening.openingStockGrams,
    avgBuyRate: opening.openingAvgBuyRate,
  };
  for (const row of sorted) {
    state = applyRowToStock(state, row);
  }
  return state;
}

function inferOpeningFromRows(rows: PlRow[]): PlOpeningInputs {
  if (rows.length === 0) {
    return { openingStockGrams: 0, openingAvgBuyRate: 0 };
  }

  const first = sortPlRows(rows)[0];
  const w = first.weightGrams;
  const running = first.runningStockGrams ?? 0;
  const wac = first.avgBuyRate ?? 0;

  if (isSaleType(first.type)) {
    return {
      openingStockGrams: running + w,
      openingAvgBuyRate: wac,
    };
  }

  if (first.type === "BUY") {
    return {
      openingStockGrams: Math.max(0, running - w),
      openingAvgBuyRate: wac,
    };
  }

  return { openingStockGrams: running, openingAvgBuyRate: wac };
}

/**
 * Overall profit:
 * Total sales − ((opening stock value + total purchases) − ending stock value)
 * Ending stock value = ending weight × ending average buy rate
 */
export function computePlSummary(
  rows: PlRow[],
  opening?: Partial<PlOpeningInputs>,
  dateRange?: PlDateRange | null
): PlSummary {
  const baseOpening = resolveOpening(rows, opening);
  const ledger = recalculatePlLedger(rows, baseOpening);

  let scopedRows = ledger;
  let periodOpening = baseOpening;
  let endingState: StockState = walkLedger(ledger, baseOpening).at(-1) ?? {
    stockGrams: baseOpening.openingStockGrams,
    avgBuyRate: baseOpening.openingAvgBuyRate,
  };

  if (dateRange) {
    scopedRows = ledger.filter((r) => rowInDateRange(r, dateRange));
    const beforeStart = stockStateBeforeDate(ledger, baseOpening, dateRange.from);
    const hasEarlierRows = ledger.some(
      (r) => r.dateIso && r.dateIso < dateRange.from
    );
    periodOpening = hasEarlierRows
      ? {
          openingStockGrams: beforeStart.stockGrams,
          openingAvgBuyRate: beforeStart.avgBuyRate,
        }
      : baseOpening;
    endingState = stockStateThroughDate(ledger, baseOpening, dateRange.to);
  }

  const openingStockGrams = periodOpening.openingStockGrams;
  const openingAvgBuyRate = periodOpening.openingAvgBuyRate;
  const openingStockValue = openingStockGrams * openingAvgBuyRate;

  let totalSalesThb = 0;
  let totalPurchasesThb = 0;
  let transactionProfitSum = 0;
  let sellCount = 0;
  let buyCount = 0;

  for (const row of scopedRows) {
    if (isSaleType(row.type)) {
      totalSalesThb += row.valueThb;
      sellCount += 1;
      if (row.profit !== null) transactionProfitSum += row.profit;
    } else if (row.type === "BUY") {
      totalPurchasesThb += row.valueThb;
      buyCount += 1;
    }
  }

  const endingStockGrams = endingState.stockGrams;
  const endingAvgBuyRate = endingState.avgBuyRate;
  const endingStockValue = endingStockGrams * endingAvgBuyRate;

  const costOfGoodsSold =
    openingStockValue + totalPurchasesThb - endingStockValue;
  const overallProfit = totalSalesThb - costOfGoodsSold;

  return {
    openingStockGrams,
    openingAvgBuyRate,
    openingStockValue,
    totalSalesThb,
    totalPurchasesThb,
    endingStockGrams,
    endingAvgBuyRate,
    endingStockValue,
    costOfGoodsSold,
    overallProfit,
    transactionProfitSum,
    sellCount,
    buyCount,
    dateFrom: dateRange?.from ?? null,
    dateTo: dateRange?.to ?? null,
  };
}

function enrichRow(sourceRow: number, cells: unknown[]): PlRow | null {
  const typeRaw = toStringOrEmpty(cells[0]);
  const type = normalizeType(typeRaw);
  if (!type) return null;

  const { display: dateDisplay, iso: dateIso } = parsePlDate(cells[2]);
  const weightGrams = toNumber(cells[5]);
  const ratePerGram = toNumber(cells[6]);
  const valueThb = toNumber(cells[7]);
  const avgBuyRateRaw = toNumber(cells[8]);
  const avgBuyRate = avgBuyRateRaw > 0 ? avgBuyRateRaw : null;
  const costFromSheet = toNumber(cells[9]);
  const profitFromSheet = toNumber(cells[10]);
  const runningRaw = toNumber(cells[11]);

  const costOfSale =
    isSaleType(type) && weightGrams > 0 && avgBuyRate !== null
      ? costFromSheet > 0
        ? costFromSheet
        : weightGrams * avgBuyRate
      : null;

  const profit =
    isSaleType(type) && weightGrams > 0 && avgBuyRate !== null
      ? profitFromSheet !== 0
        ? profitFromSheet
        : computeTransactionProfit(type, weightGrams, valueThb, avgBuyRate)
      : null;

  return {
    id: createPlRowId(),
    sourceRow,
    type,
    month: toStringOrEmpty(cells[1]),
    dateDisplay,
    dateIso,
    invoice: toStringOrEmpty(cells[3]),
    customer: toStringOrEmpty(cells[4]),
    weightGrams,
    ratePerGram,
    valueThb,
    avgBuyRate,
    costOfSale,
    profit,
    runningStockGrams: runningRaw > 0 ? runningRaw : null,
    note: toStringOrEmpty(cells[12]),
    isManual: false,
  };
}

export function parsePlWorkbook(
  buffer: ArrayBuffer,
  preferredSheet?: string
): ParsePlResult {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetNames = wb.SheetNames;
  const sheetUsed =
    (preferredSheet && sheetNames.includes(preferredSheet)
      ? preferredSheet
      : sheetNames.find((n) => /transaction\s*log/i.test(n))) ??
    sheetNames[0];

  const ws = wb.Sheets[sheetUsed];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: "",
  });

  const parsed: PlRow[] = [];
  for (let i = 0; i < grid.length; i++) {
    const cells = grid[i];
    if (!Array.isArray(cells) || cells.length === 0) continue;
    if (i < 3) continue;
    const row = enrichRow(i + 1, cells);
    if (row && (row.weightGrams > 0 || row.valueThb > 0)) {
      parsed.push(row);
    }
  }

  const inferredOpening = inferOpeningFromRows(parsed);
  const rows = recalculatePlLedger(parsed, inferredOpening);
  const summary = computePlSummary(rows, inferredOpening);

  return { sheetNames, sheetUsed, rows, summary, inferredOpening };
}

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function plPresetRange(
  preset: "all" | "this_month" | "this_year" | "custom",
  customFrom: string,
  customTo: string
): PlDateRange | null {
  const now = new Date();
  const today = isoToday();

  if (preset === "all") return null;
  if (preset === "custom") {
    return { from: customFrom, to: customTo };
  }
  if (preset === "this_month") {
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    return { from, to: today };
  }
  const from = `${now.getFullYear()}-01-01`;
  return { from, to: today };
}
