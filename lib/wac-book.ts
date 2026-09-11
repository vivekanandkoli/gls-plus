/**
 * Per-book WAC / stock engine for the two-ledger model.
 *
 * Each book (official | unofficial) is an INDEPENDENT ledger: it runs its own
 * WAC chain from its own per-year opening balance (`opening_balances`), over its
 * own approved transactions. The books are never combined. Physical stock adds
 * manual `stock_adjustments` on top of the WAC-derived stock.
 */

import type { Book } from "@/lib/rbac";
import {
  getCurrentWacState,
  recalculateWacPl,
  roundCurrency,
  roundWac,
  type OpeningBalance,
  type WacInventoryState,
  type WacPlEntry,
  type WacTx,
  ZERO_OPENING,
} from "@/lib/wac-ledger";

// Minimal structural client type (works with the service or SSR client).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

/** The year a WAC chain is anchored to. */
export function yearOf(dateOrIso: string | Date): number {
  const d = typeof dateOrIso === "string" ? new Date(dateOrIso) : dateOrIso;
  return d.getUTCFullYear();
}

/** Opening balance for a (book, year); ZERO if none configured yet. */
export async function fetchOpeningBalance(
  supabase: Client,
  book: Book,
  year: number
): Promise<OpeningBalance> {
  const { data, error } = await supabase
    .from("opening_balances")
    .select("opening_stock_gm,opening_wac,opening_stock_value_thb")
    .eq("book", book)
    .eq("year", year)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return ZERO_OPENING;
  return {
    stockGm: Number(data.opening_stock_gm) || 0,
    stockValueThb: Number(data.opening_stock_value_thb) || 0,
    wac: Number(data.opening_wac) || 0,
  };
}

const BOOK_SELECT = "id,date,type,weight_grams,rate_per_gram,amount_thb,status,created_at";

/** Approved transactions for one book, in WAC chain order. Optionally scoped to a year. */
export async function fetchBookTransactions(
  supabase: Client,
  book: Book,
  opts?: { approvedOnly?: boolean; year?: number }
): Promise<WacTx[]> {
  const approvedOnly = opts?.approvedOnly !== false;
  const all: WacTx[] = [];
  const batchSize = 1000;
  let offset = 0;

  for (;;) {
    let q = supabase.from("transactions").select(BOOK_SELECT).eq("book", book);
    if (approvedOnly) q = q.eq("status", "approved");
    if (opts?.year != null) {
      q = q.gte("date", `${opts.year}-01-01`).lte("date", `${opts.year}-12-31`);
    }
    q = q
      .order("date", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    const { data, error } = await q.range(offset, offset + batchSize - 1);
    if (error) throw new Error(error.message);

    const batch = (data ?? []) as Array<{
      id: string;
      date: string;
      type: "BUY" | "SELL";
      weight_grams: number | null;
      rate_per_gram: number | null;
      amount_thb: number | null;
      created_at?: string | null;
    }>;
    for (const row of batch) {
      const weightGrams = Number(row.weight_grams) || 0;
      const ratePerGram = Number(row.rate_per_gram) || 0;
      const amountThb =
        row.amount_thb != null && Number(row.amount_thb) > 0
          ? Number(row.amount_thb)
          : weightGrams * ratePerGram;
      all.push({
        id: row.id,
        date: row.date,
        createdAt: row.created_at ?? undefined,
        type: row.type,
        weightGrams,
        ratePerGram,
        amountThb,
      });
    }
    if (batch.length < batchSize) break;
    offset += batchSize;
  }

  return all;
}

/** Net manual stock adjustment (grams) for a (book, year). */
export async function fetchStockAdjustmentTotal(
  supabase: Client,
  book: Book,
  year?: number
): Promise<number> {
  let q = supabase.from("stock_adjustments").select("delta_gm").eq("book", book);
  if (year != null) {
    q = q.gte("date", `${year}-01-01`).lte("date", `${year}-12-31`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).reduce(
    (sum: number, r: { delta_gm: number | null }) => sum + (Number(r.delta_gm) || 0),
    0
  );
}

export interface BookState extends WacInventoryState {
  book: Book;
  year: number;
  /** WAC-derived stock plus manual adjustments — the counted-vault figure. */
  physicalStockGm: number;
  adjustmentGm: number;
}

/** Current live WAC + stock for one book/year (opening + approved txns + adjustments). */
export async function computeBookState(
  supabase: Client,
  book: Book,
  year: number = new Date().getUTCFullYear()
): Promise<BookState> {
  const opening = await fetchOpeningBalance(supabase, book, year);
  const txs = await fetchBookTransactions(supabase, book, { approvedOnly: true, year });
  const state = getCurrentWacState(txs, opening);
  const adjustmentGm = await fetchStockAdjustmentTotal(supabase, book, year);
  return {
    book,
    year,
    ...state,
    adjustmentGm: roundCurrency(adjustmentGm),
    physicalStockGm: roundCurrency(state.stockGm + adjustmentGm),
  };
}

/** WAC P&L per transaction id for one book/year (used to persist on approval). */
export async function computeBookPl(
  supabase: Client,
  book: Book,
  year: number
): Promise<Map<string, WacPlEntry>> {
  const opening = await fetchOpeningBalance(supabase, book, year);
  const txs = await fetchBookTransactions(supabase, book, { approvedOnly: true, year });
  return recalculateWacPl(txs, opening);
}

export interface BookSummary extends BookState {
  buyWeight: number;
  sellWeight: number;
  buyValue: number;
  sellValue: number;
  txnCount: number;
  /** Sum of WAC profit/loss over approved SELLs (this book/year). */
  profit: number;
}

/** Full dashboard summary for one book/year: stock, WAC, buy/sell totals, profit. */
export async function computeBookSummary(
  supabase: Client,
  book: Book,
  year: number = new Date().getUTCFullYear()
): Promise<BookSummary> {
  const opening = await fetchOpeningBalance(supabase, book, year);
  const txs = await fetchBookTransactions(supabase, book, { approvedOnly: true, year });
  const state = getCurrentWacState(txs, opening);
  const pl = recalculateWacPl(txs, opening);

  let buyWeight = 0, sellWeight = 0, buyValue = 0, sellValue = 0, profit = 0;
  for (const t of txs) {
    if (t.type === "BUY") {
      buyWeight += t.weightGrams;
      buyValue += t.amountThb;
    } else {
      sellWeight += t.weightGrams;
      sellValue += t.amountThb;
      const p = pl.get(t.id);
      if (p?.profitLoss != null) profit += p.profitLoss;
    }
  }
  const adjustmentGm = await fetchStockAdjustmentTotal(supabase, book, year);
  return {
    book,
    year,
    ...state,
    adjustmentGm: roundCurrency(adjustmentGm),
    physicalStockGm: roundCurrency(state.stockGm + adjustmentGm),
    buyWeight: roundCurrency(buyWeight),
    sellWeight: roundCurrency(sellWeight),
    buyValue: roundCurrency(buyValue),
    sellValue: roundCurrency(sellValue),
    txnCount: txs.length,
    profit: roundCurrency(profit),
  };
}

/**
 * Persist WAC results (wac_at_sale / cost_of_sale / profit_loss) onto the
 * approved SELL rows of one book/year. BUY rows are cleared to null.
 * Returns the number of rows updated.
 */
export async function persistBookWac(
  supabase: Client,
  book: Book,
  year: number
): Promise<number> {
  const pl = await computeBookPl(supabase, book, year);
  const txs = await fetchBookTransactions(supabase, book, { approvedOnly: true, year });
  let updated = 0;
  const chunkSize = 50;
  for (let i = 0; i < txs.length; i += chunkSize) {
    const chunk = txs.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map((t) => {
        const p = pl.get(t.id);
        const payload =
          t.type === "SELL" && p?.wacAtSale != null
            ? { wac_at_sale: p.wacAtSale, cost_of_sale: p.costOfSale, profit_loss: p.profitLoss }
            : { wac_at_sale: null, cost_of_sale: null, profit_loss: null };
        updated++;
        return supabase.from("transactions").update(payload).eq("id", t.id);
      })
    );
  }
  return updated;
}

/** Preview P/L for a hypothetical SELL against a book's current WAC. */
export function previewBookSellPl(
  wac: number,
  weightGrams: number,
  amountThb: number
): { wacAtSale: number; costOfSale: number; profitLoss: number } {
  const wacAtSale = roundWac(wac);
  const costOfSale = roundCurrency(weightGrams * wacAtSale);
  return { wacAtSale, costOfSale, profitLoss: roundCurrency(amountThb - costOfSale) };
}
