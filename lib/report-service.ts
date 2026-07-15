/**
 * Reporting for the two-ledger model.
 *   • Book statement — a period statement for one book (official = CA/tax-ready,
 *     unofficial = owner's actual), with opening/closing stock+WAC and per-row P/L.
 *   • Reconciliation — official vs unofficial side by side + variance (NOT a sum).
 */

import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { fetchOpeningBalance, type Book } from "@/lib/opening-balances";
import { roundCurrency, roundWac, sortWacTransactions, type WacTx } from "@/lib/wac-ledger";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

export interface LedgerEntry {
  id: string;
  date: string;
  type: "BUY" | "SELL";
  clientId: string | null;
  invoiceNumber: string | null;
  weightGm: number;
  ratePerGram: number;
  amountThb: number;
  wacAtSale: number | null;
  costOfSale: number | null;
  profitLoss: number | null;
  vatPercent: number | null;
  runningStockGm: number;
  wacAfter: number;
  stockValueAfter: number;
}

export interface InventoryState {
  stockGm: number;
  wac: number;
  stockValueThb: number;
}

export interface BookStatement {
  book: Book;
  from: string;
  to: string;
  opening: InventoryState;
  closing: InventoryState;
  rows: LedgerEntry[];
  totals: {
    buyGm: number;
    buyThb: number;
    sellGm: number;
    sellThb: number;
    realizedProfit: number;
    vatThb: number;
  };
}

async function fetchBookTxnsUpTo(
  supabase: ServiceClient,
  book: Book,
  to: string
): Promise<(WacTx & { clientId: string | null; invoiceNumber: string | null; vatPercent: number | null })[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("transactions")
    .select("id,date,created_at,type,client_id,invoice_number,weight_grams,rate_per_gram,amount_thb,vat_percent")
    .eq("book", book)
    .eq("status", "approved")
    .lte("date", to);
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id,
    date: r.date,
    createdAt: r.created_at,
    type: r.type,
    weightGrams: Number(r.weight_grams) || 0,
    ratePerGram: Number(r.rate_per_gram) || 0,
    amountThb: Number(r.amount_thb) || 0,
    clientId: r.client_id ?? null,
    invoiceNumber: r.invoice_number ?? null,
    vatPercent: r.vat_percent === null || r.vat_percent === undefined ? null : Number(r.vat_percent),
  }));
}

function computeLedger(
  txns: (WacTx & { clientId: string | null; invoiceNumber: string | null; vatPercent: number | null })[],
  opening: InventoryState
): LedgerEntry[] {
  const sorted = sortWacTransactions(txns) as typeof txns;
  let stockGm = opening.stockGm;
  let stockValue = opening.stockValueThb;
  let wac = opening.wac;
  const out: LedgerEntry[] = [];

  for (const tx of sorted) {
    let wacAtSale: number | null = null;
    let costOfSale: number | null = null;
    let profitLoss: number | null = null;

    if (tx.type === "BUY") {
      stockValue = roundCurrency(stockValue + roundCurrency(tx.weightGrams * tx.ratePerGram));
      stockGm += tx.weightGrams;
      if (stockGm > 0) wac = roundWac(stockValue / stockGm);
    } else {
      wacAtSale = roundWac(wac);
      costOfSale = roundCurrency(tx.weightGrams * wac);
      profitLoss = roundCurrency(tx.amountThb - costOfSale);
      stockGm -= tx.weightGrams;
      stockValue = roundCurrency(stockValue - costOfSale);
      if (stockGm > 0) wac = roundWac(stockValue / stockGm);
    }

    out.push({
      id: tx.id,
      date: tx.date,
      type: tx.type,
      clientId: tx.clientId,
      invoiceNumber: tx.invoiceNumber,
      weightGm: tx.weightGrams,
      ratePerGram: tx.ratePerGram,
      amountThb: tx.amountThb,
      wacAtSale,
      costOfSale,
      profitLoss,
      vatPercent: tx.vatPercent,
      runningStockGm: Math.round(stockGm * 1000) / 1000,
      wacAfter: roundWac(wac),
      stockValueAfter: stockValue,
    });
  }
  return out;
}

export async function buildBookStatement(
  book: Book,
  from: string,
  to: string
): Promise<BookStatement> {
  const supabase = createSupabaseServiceClient();
  // The chain runs continuously from the book's base opening (same one the
  // dashboard/WAC uses) — NOT the report's start year, which would restart the
  // chain from zero and corrupt WAC.
  const openingBal = await fetchOpeningBalance(supabase, book);
  const txns = await fetchBookTxnsUpTo(supabase, book, to);
  const ledger = computeLedger(txns, {
    stockGm: openingBal.stockGm,
    wac: openingBal.wac,
    stockValueThb: openingBal.stockValueThb,
  });

  // Opening state for the period = state after the last entry strictly before `from`.
  const before = ledger.filter((e) => e.date < from);
  const opening: InventoryState = before.length
    ? {
        stockGm: before[before.length - 1].runningStockGm,
        wac: before[before.length - 1].wacAfter,
        stockValueThb: before[before.length - 1].stockValueAfter,
      }
    : { stockGm: openingBal.stockGm, wac: openingBal.wac, stockValueThb: openingBal.stockValueThb };

  const rows = ledger.filter((e) => e.date >= from && e.date <= to);
  const last = ledger.length ? ledger[ledger.length - 1] : null;
  const closing: InventoryState = last
    ? { stockGm: last.runningStockGm, wac: last.wacAfter, stockValueThb: last.stockValueAfter }
    : opening;

  const totals = { buyGm: 0, buyThb: 0, sellGm: 0, sellThb: 0, realizedProfit: 0, vatThb: 0 };
  for (const r of rows) {
    if (r.type === "BUY") {
      totals.buyGm += r.weightGm;
      totals.buyThb += r.amountThb;
    } else {
      totals.sellGm += r.weightGm;
      totals.sellThb += r.amountThb;
      totals.realizedProfit += r.profitLoss ?? 0;
    }
    if (r.vatPercent) totals.vatThb += roundCurrency((r.amountThb * r.vatPercent) / 100);
  }
  totals.buyThb = roundCurrency(totals.buyThb);
  totals.sellThb = roundCurrency(totals.sellThb);
  totals.realizedProfit = roundCurrency(totals.realizedProfit);
  totals.vatThb = roundCurrency(totals.vatThb);

  return { book, from, to, opening, closing, rows, totals };
}

export interface Reconciliation {
  from: string;
  to: string;
  official: BookStatement["totals"] & { closingStockGm: number; closingWac: number };
  unofficial: BookStatement["totals"] & { closingStockGm: number; closingWac: number };
  variance: { buyThb: number; sellThb: number; realizedProfit: number };
}

export async function buildReconciliation(from: string, to: string): Promise<Reconciliation> {
  const [official, unofficial] = await Promise.all([
    buildBookStatement("official", from, to),
    buildBookStatement("unofficial", from, to),
  ]);
  const off = { ...official.totals, closingStockGm: official.closing.stockGm, closingWac: official.closing.wac };
  const un = { ...unofficial.totals, closingStockGm: unofficial.closing.stockGm, closingWac: unofficial.closing.wac };
  return {
    from,
    to,
    official: off,
    unofficial: un,
    // Variance = unofficial (reality) − official (declared).
    variance: {
      buyThb: roundCurrency(un.buyThb - off.buyThb),
      sellThb: roundCurrency(un.sellThb - off.sellThb),
      realizedProfit: roundCurrency(un.realizedProfit - off.realizedProfit),
    },
  };
}
