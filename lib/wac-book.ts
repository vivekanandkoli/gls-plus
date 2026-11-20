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

/**
 * Owner "closing rate" for a (book, year), if one has been applied.
 * NULL means value closing stock at WAC (the default). When set, the book's
 * declared profit uses the period method: sales − (opening + purchases −
 * closingWeight × closingRate).
 */
export type ClosingConfig = { rate: number | null; auto: boolean };

/** Stored closing-rate config for a (book, year): the fixed rate and auto flag. */
export async function fetchClosingConfig(
  supabase: Client,
  book: Book,
  year: number
): Promise<ClosingConfig> {
  const parse = (data: { closing_rate?: unknown; closing_rate_auto?: unknown } | null): ClosingConfig => {
    const v = data?.closing_rate;
    const rate = v == null || !Number.isFinite(Number(v)) ? null : Number(v);
    return { rate, auto: Boolean(data?.closing_rate_auto) };
  };
  // Prefer both columns; if closing_rate_auto doesn't exist yet (migration not
  // run), fall back to reading just closing_rate so an applied rate still works.
  try {
    const both = await supabase
      .from("opening_balances")
      .select("closing_rate,closing_rate_auto")
      .eq("book", book)
      .eq("year", year)
      .maybeSingle();
    if (!both.error) return parse(both.data);

    const only = await supabase
      .from("opening_balances")
      .select("closing_rate")
      .eq("book", book)
      .eq("year", year)
      .maybeSingle();
    if (!only.error) return parse(only.data);
    return { rate: null, auto: false };
  } catch {
    return { rate: null, auto: false };
  }
}

/** Rate (THB/g) of the latest approved SELL in a (book, year), or null. */
export async function fetchLatestSellRate(
  supabase: Client,
  book: Book,
  year: number
): Promise<number | null> {
  const { data, error } = await supabase
    .from("transactions")
    .select("rate_per_gram")
    .eq("book", book)
    .eq("type", "SELL")
    .eq("status", "approved")
    .gte("date", `${year}-01-01`)
    .lte("date", `${year}-12-31`)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  const v = data?.rate_per_gram;
  return v == null || !Number.isFinite(Number(v)) ? null : Number(v);
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
  // Only approved adjustments affect the stock figure (pending ones await admin review).
  let q = supabase
    .from("stock_adjustments")
    .select("delta_gm")
    .eq("book", book)
    .eq("status", "approved");
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
  /** WAC-derived stock plus manual adjustments - the counted-vault figure. */
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
  /** Effective owner closing rate for this book/year, or null (then WAC is used). */
  ownerClosingRate: number | null;
  /** True when the closing rate follows the latest sell rate automatically. */
  ownerClosingRateAuto: boolean;
  /** Latest approved SELL rate in this book/year (the auto source), or null. */
  latestSellRate: number | null;
  /**
   * Declared/period profit = sales − (opening + purchases − closingWeight ×
   * ownerClosingRate). Null when no closing rate is applied. When set, this is
   * the profit the dashboard should show for the book.
   */
  periodProfit: number | null;
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
  const config = await fetchClosingConfig(supabase, book, year);
  const latestSellRate = await fetchLatestSellRate(supabase, book, year);

  // Effective closing rate: when auto, follow the latest sell rate (fall back
  // to the stored rate if there are no sells yet); otherwise the fixed rate.
  const ownerClosingRate =
    config.rate == null
      ? null
      : config.auto
        ? (latestSellRate ?? config.rate)
        : config.rate;

  // Period/declared profit (only when a closing rate has been applied):
  // sales − (opening value + purchases − closing stock × closing rate).
  const periodProfit =
    ownerClosingRate != null
      ? roundCurrency(
          roundCurrency(sellValue) -
            (roundCurrency(opening.stockValueThb) +
              roundCurrency(buyValue) -
              roundCurrency(state.stockGm * ownerClosingRate))
        )
      : null;

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
    ownerClosingRate: ownerClosingRate != null ? roundWac(ownerClosingRate) : null,
    ownerClosingRateAuto: config.rate != null && config.auto,
    latestSellRate: latestSellRate != null ? roundWac(latestSellRate) : null,
    periodProfit,
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
