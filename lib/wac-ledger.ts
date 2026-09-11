/**
 * Weighted Average Cost (WAC) inventory ledger for Supabase transactions.
 * Processes all transactions in chronological order from an opening balance.
 *
 * Two-ledger model: each `book` (official | unofficial) runs its OWN WAC chain
 * from its OWN per-year opening balance (see `opening_balances`). The engine here
 * is book-agnostic — pass the relevant opening balance and the transactions for
 * that book. The legacy single-ledger constants below are kept only as a default
 * for not-yet-migrated callers.
 */

/** @deprecated legacy single-ledger opening; two-ledger uses opening_balances per (year, book). */
export const OPENING_STOCK_GM = 2331.33;
/** @deprecated legacy single-ledger opening. */
export const OPENING_STOCK_VALUE_THB = 6665493.2;
/** @deprecated legacy single-ledger opening. */
export const OPENING_WAC = 2859.09;

/** Opening inventory position a WAC chain starts from (per year, per book). */
export interface OpeningBalance {
  stockGm: number;
  stockValueThb: number;
  wac: number;
}

/** A fresh book with no opening position. */
export const ZERO_OPENING: OpeningBalance = { stockGm: 0, stockValueThb: 0, wac: 0 };

/** Legacy single-ledger opening, used as the default for un-migrated callers. */
export const LEGACY_OPENING: OpeningBalance = {
  stockGm: OPENING_STOCK_GM,
  stockValueThb: OPENING_STOCK_VALUE_THB,
  wac: OPENING_WAC,
};

export type WacTxType = "BUY" | "SELL";

export interface WacTx {
  id: string;
  date: string;
  /** ISO timestamp used for same-date ordering: approve in created_at ASC order. */
  createdAt?: string;
  type: WacTxType;
  weightGrams: number;
  ratePerGram: number;
  amountThb: number;
}

export interface WacPlEntry {
  /** WAC at moment of sale (4 dp); null for BUY */
  wacAtSale: number | null;
  costOfSale: number | null;
  profitLoss: number | null;
  /** (profitLoss / costOfSale) × 100, 2 dp; null for BUY or zero cost */
  plPercent: number | null;
  insufficientStock: boolean;
}

export interface WacInventoryState {
  stockGm: number;
  stockValueThb: number;
  wac: number;
}

export function roundCurrency(n: number): number {
  return Math.round(n * 100) / 100;
}

export function roundWac(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function sortWacTransactions(transactions: WacTx[]): WacTx[] {
  return [...transactions].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    // Same date: use created_at to approve in submission order, then id as fallback.
    if (a.createdAt && b.createdAt && a.createdAt !== b.createdAt) {
      return a.createdAt.localeCompare(b.createdAt);
    }
    return a.id.localeCompare(b.id);
  });
}

/** Walk the full chain and return P&L per transaction id. */
export function recalculateWacPl(
  transactions: WacTx[],
  opening: OpeningBalance = LEGACY_OPENING
): Map<string, WacPlEntry> {
  const sorted = sortWacTransactions(transactions);
  const map = new Map<string, WacPlEntry>();

  let stockGm = opening.stockGm;
  let stockValue = opening.stockValueThb;
  let wac = opening.wac;

  for (const tx of sorted) {
    const weight = tx.weightGrams;
    if (weight <= 0) {
      map.set(tx.id, {
        wacAtSale: null,
        costOfSale: null,
        profitLoss: null,
        plPercent: null,
        insufficientStock: false,
      });
      continue;
    }

    if (tx.type === "BUY") {
      const buyValue = roundCurrency(weight * tx.ratePerGram);
      stockValue = roundCurrency(stockValue + buyValue);
      stockGm += weight;
      if (stockGm > 0) {
        wac = roundWac(stockValue / stockGm);
      }
      map.set(tx.id, {
        wacAtSale: null,
        costOfSale: null,
        profitLoss: null,
        plPercent: null,
        insufficientStock: false,
      });
      continue;
    }

    const wacAtSale = wac;
    const costOfSale = roundCurrency(weight * wacAtSale);
    const amount = roundCurrency(tx.amountThb);
    const profitLoss = roundCurrency(amount - costOfSale);
    const plPercent = costOfSale > 0 ? roundCurrency((profitLoss / costOfSale) * 100) : null;

    stockGm -= weight;
    stockValue = roundCurrency(stockValue - costOfSale);
    const insufficientStock = stockGm <= 0;
    if (stockGm > 0) {
      wac = roundWac(stockValue / stockGm);
    }

    map.set(tx.id, {
      wacAtSale: roundWac(wacAtSale),
      costOfSale,
      profitLoss,
      plPercent,
      insufficientStock,
    });
  }

  return map;
}

/** Inventory state after processing all transactions (for SELL preview on create). */
export function getCurrentWacState(
  transactions: WacTx[],
  opening: OpeningBalance = LEGACY_OPENING
): WacInventoryState {
  const sorted = sortWacTransactions(transactions);

  let stockGm = opening.stockGm;
  let stockValue = opening.stockValueThb;
  let wac = opening.wac;

  for (const tx of sorted) {
    const weight = tx.weightGrams;
    if (weight <= 0) continue;

    if (tx.type === "BUY") {
      const buyValue = roundCurrency(weight * tx.ratePerGram);
      stockValue = roundCurrency(stockValue + buyValue);
      stockGm += weight;
      if (stockGm > 0) wac = roundWac(stockValue / stockGm);
    } else {
      const costOfSale = roundCurrency(weight * wac);
      stockGm -= weight;
      stockValue = roundCurrency(stockValue - costOfSale);
      if (stockGm > 0) wac = roundWac(stockValue / stockGm);
    }
  }

  return { stockGm, stockValueThb: stockValue, wac };
}

/** Preview profit/loss for a hypothetical SELL at the given WAC. */
export function previewSellPl(
  weightGrams: number,
  amountThb: number,
  wac: number
): { costOfSale: number; profitLoss: number } {
  const costOfSale = roundCurrency(weightGrams * wac);
  const profitLoss = roundCurrency(amountThb - costOfSale);
  return { costOfSale, profitLoss };
}

export function formatWacRate(wac: number): string {
  return roundWac(wac).toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}
