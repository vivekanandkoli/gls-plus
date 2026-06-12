import {
  getCurrentWacState,
  recalculateWacPl,
  sortWacTransactions,
  type WacTx,
} from "@/lib/wac-ledger";
import { fetchAllTransactionsForWacWithClient, type WacSupabaseClient } from "@/lib/wac-fetch";

export interface WacRecalcParams {
  fromDate: string;
  fromId?: string;
}

export interface WacRowUpdate {
  id: string;
  wac_at_sale: number | null;
  cost_of_sale: number | null;
  profit_loss: number | null;
  pl_percent: number | null;
}

/** True when tx is at or after the recalc anchor (date ASC, id ASC). */
export function isChronologicallyOnOrAfter(
  tx: WacTx,
  fromDate: string,
  fromId?: string
): boolean {
  if (tx.date > fromDate) return true;
  if (tx.date < fromDate) return false;
  if (fromId) return tx.id >= fromId;
  return true;
}

/** Earliest recalc anchor when a transaction date may move. */
export function wacRecalcFromDate(oldDate: string, newDate: string): string {
  return oldDate <= newDate ? oldDate : newDate;
}

export function buildWacRowUpdates(
  transactions: WacTx[],
  fromDate: string,
  fromId?: string
): WacRowUpdate[] {
  const sorted = sortWacTransactions(transactions);
  const plMap = recalculateWacPl(transactions);
  const updates: WacRowUpdate[] = [];

  for (const tx of sorted) {
    if (!isChronologicallyOnOrAfter(tx, fromDate, fromId)) continue;

    const pl = plMap.get(tx.id);
    if (!pl) continue;

    if (tx.type === "SELL" && pl.wacAtSale != null) {
      updates.push({
        id: tx.id,
        wac_at_sale: pl.wacAtSale,
        cost_of_sale: pl.costOfSale,
        profit_loss: pl.profitLoss,
        pl_percent: pl.plPercent,
      });
    } else {
      updates.push({
        id: tx.id,
        wac_at_sale: null,
        cost_of_sale: null,
        profit_loss: null,
        pl_percent: null,
      });
    }
  }

  return updates;
}

const UPDATE_CHUNK = 50;

export async function persistWacRecalculation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  params: WacRecalcParams
): Promise<{ updatedCount: number; currentWac: number; sellUpdates: number }> {
  const txs = await fetchAllTransactionsForWacWithClient(supabase as WacSupabaseClient);
  const updates = buildWacRowUpdates(txs, params.fromDate, params.fromId);

  for (let i = 0; i < updates.length; i += UPDATE_CHUNK) {
    const chunk = updates.slice(i, i + UPDATE_CHUNK);
    const results = await Promise.all(
      chunk.map((row) =>
        supabase
          .from("transactions")
          .update({
            wac_at_sale: row.wac_at_sale,
            cost_of_sale: row.cost_of_sale,
            profit_loss: row.profit_loss,
          })
          .eq("id", row.id)
      )
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);
  }

  const state = getCurrentWacState(txs);
  const sellUpdates = updates.filter((u) => u.wac_at_sale != null).length;

  return {
    updatedCount: updates.length,
    sellUpdates,
    currentWac: state.wac,
  };
}
