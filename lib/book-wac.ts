/**
 * Per-book WAC: each book (official / unofficial) runs its own WAC chain from
 * its year-opening balance. Approving/creating/deleting an approved transaction
 * recomputes that book's chain and persists P/L on every SELL.
 */

import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { fetchOpeningBalance, type Book } from "@/lib/opening-balances";
import {
  recalculateWacPl,
  getCurrentWacState,
  type WacTx,
  type WacInventoryState,
} from "@/lib/wac-ledger";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

async function fetchApprovedBookTxns(
  supabase: ServiceClient,
  book: Book
): Promise<WacTx[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("transactions")
    .select("id,date,created_at,type,weight_grams,rate_per_gram,amount_thb")
    .eq("book", book)
    .eq("status", "approved");
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
  }));
}

/** Net manual stock adjustment (grams) for a book. */
export async function fetchAdjustmentsSum(supabase: ServiceClient, book: Book): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("stock_adjustments")
    .select("delta_gm")
    .eq("book", book);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).reduce((s: number, r: any) => s + (Number(r.delta_gm) || 0), 0);
}

/** Live WAC + stock for a book (used by dashboard + SELL preview). Includes
 *  manual stock adjustments (added at current WAC, so WAC is unchanged). */
export async function currentBookWac(
  supabase: ServiceClient,
  book: Book,
  year?: number
): Promise<WacInventoryState> {
  const opening = await fetchOpeningBalance(supabase, book, year);
  const txns = await fetchApprovedBookTxns(supabase, book);
  const state = getCurrentWacState(txns, opening);
  const adj = await fetchAdjustmentsSum(supabase, book);
  if (adj !== 0) {
    const stockGm = Math.round((state.stockGm + adj) * 1000) / 1000;
    return {
      stockGm,
      wac: state.wac,
      stockValueThb: Math.round((state.stockValueThb + adj * state.wac) * 100) / 100,
    };
  }
  return state;
}

/** Recompute the book's whole WAC chain and persist P/L on each row. */
export async function recalcBookWac(
  supabase: ServiceClient,
  book: Book,
  year?: number
): Promise<void> {
  const opening = await fetchOpeningBalance(supabase, book, year);
  const txns = await fetchApprovedBookTxns(supabase, book);
  if (txns.length === 0) return;
  const plMap = recalculateWacPl(txns, opening);
  await Promise.all(
    Array.from(plMap.entries()).map(([id, v]) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("transactions")
        .update({
          wac_at_sale: v.wacAtSale,
          cost_of_sale: v.costOfSale,
          profit_loss: v.profitLoss,
        })
        .eq("id", id)
    )
  );
}
