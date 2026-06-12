/**
 * Shared utilities for monthly statement generation.
 *
 * Walks all approved transactions through the WAC ledger, building per-transaction
 * P&L + running stock. The API routes slice this result for the requested period.
 */

import {
  OPENING_STOCK_GM,
  OPENING_STOCK_VALUE_THB,
  OPENING_WAC,
  roundCurrency,
  roundWac,
} from "./wac-ledger";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RawTxForStatement = {
  id: string;
  date: string;
  created_at: string;
  type: "BUY" | "SELL";
  invoice_number: string | null;
  weight_grams: number | null;
  rate_per_gram: number | null;
  amount_thb: number | null;
  /** 'official' | 'cash' — cash transactions are excluded from CA statements. */
  transaction_mode?: string | null;
  /** Pre-computed DB column (optional). */
  wac_at_sale?: number | null;
  cost_of_sale?: number | null;
  profit_loss?: number | null;
  pl_percent?: number | null;
  client: { name: string } | { name: string }[] | null;
  client_id?: string | null;
};

export type LedgerEntry = {
  wacAtSale: number | null;
  costOfSale: number | null;
  profitLoss: number | null;
  plPercent: number | null;
  /** Stock balance (grams) AFTER this transaction. */
  stockAfterGrams: number;
  /** Stock value (THB) AFTER this transaction. */
  stockAfterValue: number;
  /** WAC AFTER this transaction. */
  wacAfter: number;
};

export type InventoryState = {
  stockGrams: number;
  stockValueThb: number;
  wac: number;
};

export type StatementRow = {
  id: string;
  date: string;
  invoiceNumber: string | null;
  clientName: string;
  clientId: string | null;
  type: "BUY" | "SELL";
  weightGrams: number;
  ratePerGram: number;
  amountThb: number;
  wacAtSale: number | null;
  costOfSale: number | null;
  profitLoss: number | null;
  plPercent: number | null;
  runningStockGrams: number;
};

export type MonthSummary = {
  totalBuyQty: number;
  totalBuyValue: number;
  totalSellQty: number;
  totalSellValue: number;
  totalProfitLoss: number;
  grossMarginPct: number | null;
  closingStockGrams: number;
  closingStockValue: number;
  closingWac: number;
};

export type MonthlyStatementPayload = {
  year: number;
  month: number;
  generatedAt: string;
  opening: InventoryState;
  rows: StatementRow[];
  summary: MonthSummary;
};

export type ClientStatementPayload = {
  clientId: string;
  clientName: string;
  from: string;
  to: string;
  generatedAt: string;
  rows: StatementRow[];
  summary: {
    totalBuyQty: number;
    totalBuyValue: number;
    totalSellQty: number;
    totalSellValue: number;
    totalValue: number;
    avgRate: number | null;
    totalProfitLoss: number;
    /** Outstanding buy weight (unpaid BUYs are not tracked here — all txs are approved). */
  };
};

export type AnnualMonthRow = {
  month: number;          // 1–12
  buyQty: number;
  buyValue: number;
  sellQty: number;
  sellValue: number;
  profitLoss: number;
  closingStockGrams: number;
  closingStockValue: number;
  closingWac: number;
};

export type AnnualSummaryPayload = {
  year: number;
  generatedAt: string;
  months: AnnualMonthRow[];
  totals: {
    buyQty: number;
    buyValue: number;
    sellQty: number;
    sellValue: number;
    profitLoss: number;
  };
  yearEndStock: InventoryState;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getClientName(client: RawTxForStatement["client"]): string {
  if (!client) return "-";
  if (Array.isArray(client)) return client[0]?.name ?? "-";
  return (client as { name: string }).name ?? "-";
}

function sortRaw(txs: RawTxForStatement[]): RawTxForStatement[] {
  return [...txs].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.created_at !== b.created_at)
      return a.created_at.localeCompare(b.created_at);
    return a.id.localeCompare(b.id);
  });
}

// ─── Core WAC Walk ────────────────────────────────────────────────────────────

/**
 * Processes ALL transactions through the WAC ledger in chronological order.
 * Returns a Map<txId, LedgerEntry> with computed values and running state.
 *
 * If a transaction has pre-computed DB WAC columns, they are used for P&L
 * display (to stay consistent with transaction list). Running stock is always
 * computed from scratch for accuracy.
 */
export function buildLedger(txs: RawTxForStatement[]): Map<string, LedgerEntry> {
  const sorted = sortRaw(txs);
  const map = new Map<string, LedgerEntry>();

  let stockGm = OPENING_STOCK_GM;
  let stockValue = OPENING_STOCK_VALUE_THB;
  let wac = OPENING_WAC;

  for (const tx of sorted) {
    const weight = tx.weight_grams ?? 0;

    if (tx.type === "BUY") {
      const buyValue = roundCurrency(weight * (tx.rate_per_gram ?? 0));
      stockValue = roundCurrency(stockValue + buyValue);
      stockGm += weight;
      if (stockGm > 0) wac = roundWac(stockValue / stockGm);

      map.set(tx.id, {
        wacAtSale: null,
        costOfSale: null,
        profitLoss: null,
        plPercent: null,
        stockAfterGrams: stockGm,
        stockAfterValue: stockValue,
        wacAfter: wac,
      });
    } else {
      // SELL — prefer DB-computed values when present, else compute
      const wacAtSale =
        tx.wac_at_sale != null ? tx.wac_at_sale : wac;
      const costOfSale =
        tx.cost_of_sale != null
          ? tx.cost_of_sale
          : roundCurrency(weight * wac);
      const amount = roundCurrency(tx.amount_thb ?? 0);
      const profitLoss =
        tx.profit_loss != null
          ? tx.profit_loss
          : roundCurrency(amount - costOfSale);
      const plPercent =
        tx.pl_percent != null
          ? tx.pl_percent
          : costOfSale > 0
          ? roundCurrency((profitLoss / costOfSale) * 100)
          : null;

      // Update state using freshly-computed cost (ensures stock balance integrity)
      const freshCost = roundCurrency(weight * wac);
      stockGm -= weight;
      stockValue = roundCurrency(stockValue - freshCost);
      if (stockGm > 0) wac = roundWac(stockValue / stockGm);
      else if (stockGm <= 0) wac = wac; // keep last known wac

      map.set(tx.id, {
        wacAtSale: roundWac(wacAtSale),
        costOfSale,
        profitLoss,
        plPercent,
        stockAfterGrams: stockGm,
        stockAfterValue: stockValue,
        wacAfter: wac,
      });
    }
  }

  return map;
}

/**
 * Returns the inventory state immediately BEFORE the given date by walking
 * all transactions with date < cutoffDate.
 */
export function stateBeforeDate(
  txs: RawTxForStatement[],
  cutoffDateIso: string
): InventoryState {
  const before = txs.filter((t) => t.date < cutoffDateIso);
  const ledger = buildLedger(before);

  if (ledger.size === 0) {
    return {
      stockGrams: OPENING_STOCK_GM,
      stockValueThb: OPENING_STOCK_VALUE_THB,
      wac: OPENING_WAC,
    };
  }

  // Get state from last transaction in sorted order
  const sorted = sortRaw(before);
  const lastTx = sorted[sorted.length - 1];
  const entry = ledger.get(lastTx.id);
  if (!entry) {
    return {
      stockGrams: OPENING_STOCK_GM,
      stockValueThb: OPENING_STOCK_VALUE_THB,
      wac: OPENING_WAC,
    };
  }

  return {
    stockGrams: entry.stockAfterGrams,
    stockValueThb: entry.stockAfterValue,
    wac: entry.wacAfter,
  };
}

// ─── Build Statement Rows ─────────────────────────────────────────────────────

/** Converts raw DB rows + ledger entries into StatementRow for a given set of transactions. */
export function buildStatementRows(
  txs: RawTxForStatement[],
  ledger: Map<string, LedgerEntry>
): StatementRow[] {
  const sorted = sortRaw(txs);
  return sorted.map((tx) => {
    const entry = ledger.get(tx.id);
    return {
      id: tx.id,
      date: tx.date,
      invoiceNumber: tx.invoice_number,
      clientName: getClientName(tx.client),
      clientId: tx.client_id ?? null,
      type: tx.type,
      weightGrams: tx.weight_grams ?? 0,
      ratePerGram: tx.rate_per_gram ?? 0,
      amountThb: tx.amount_thb ?? 0,
      wacAtSale: entry?.wacAtSale ?? null,
      costOfSale: entry?.costOfSale ?? null,
      profitLoss: entry?.profitLoss ?? null,
      plPercent: entry?.plPercent ?? null,
      runningStockGrams: entry?.stockAfterGrams ?? 0,
    };
  });
}

// ─── Summaries ────────────────────────────────────────────────────────────────

export function computeMonthSummary(
  rows: StatementRow[],
  closingState: InventoryState
): MonthSummary {
  let totalBuyQty = 0;
  let totalBuyValue = 0;
  let totalSellQty = 0;
  let totalSellValue = 0;
  let totalProfitLoss = 0;

  for (const r of rows) {
    if (r.type === "BUY") {
      totalBuyQty += r.weightGrams;
      totalBuyValue += r.amountThb;
    } else {
      totalSellQty += r.weightGrams;
      totalSellValue += r.amountThb;
      totalProfitLoss += r.profitLoss ?? 0;
    }
  }

  const grossMarginPct =
    totalSellValue > 0
      ? roundCurrency((totalProfitLoss / totalSellValue) * 100)
      : null;

  return {
    totalBuyQty: roundCurrency(totalBuyQty),
    totalBuyValue: roundCurrency(totalBuyValue),
    totalSellQty: roundCurrency(totalSellQty),
    totalSellValue: roundCurrency(totalSellValue),
    totalProfitLoss: roundCurrency(totalProfitLoss),
    grossMarginPct,
    closingStockGrams: roundCurrency(closingState.stockGrams),
    closingStockValue: roundCurrency(closingState.stockValueThb),
    closingWac: closingState.wac,
  };
}

// ─── Month bounds helper ───────────────────────────────────────────────────────

export function monthBounds(
  year: number,
  month: number
): { firstDay: string; lastDay: string } {
  const mm = String(month).padStart(2, "0");
  const lastDate = new Date(year, month, 0).getDate();
  return {
    firstDay: `${year}-${mm}-01`,
    lastDay: `${year}-${mm}-${String(lastDate).padStart(2, "0")}`,
  };
}

/** Returns a human-readable month label like "January 2025". */
export function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
