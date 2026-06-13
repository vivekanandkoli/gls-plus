import { getSupabaseClient } from "@/lib/supabase";
import {
  getCurrentWacState,
  recalculateWacPl,
  roundCurrency,
  roundWac,
  sortWacTransactions,
  type WacTx,
} from "@/lib/wac-ledger";

export function rawToWacTx(row: {
  id: string;
  date: string;
  type: "BUY" | "SELL";
  weight_grams: number | null;
  rate_per_gram: number | null;
  amount_thb: number | null;
  created_at?: string | null;
}): WacTx {
  const weightGrams = row.weight_grams ?? 0;
  const ratePerGram = row.rate_per_gram ?? 0;
  const amountThb =
    row.amount_thb != null && row.amount_thb > 0
      ? row.amount_thb
      : weightGrams > 0 && ratePerGram > 0
        ? weightGrams * ratePerGram
        : 0;

  return {
    id: row.id,
    date: row.date,
    createdAt: row.created_at ?? undefined,
    type: row.type,
    weightGrams,
    ratePerGram,
    amountThb,
  };
}

type WacRawRow = Parameters<typeof rawToWacTx>[0];

type OrderChain = {
  order: (col: string, opts: { ascending: boolean }) => OrderChain;
  range: (
    from: number,
    to: number
  ) => PromiseLike<{
    data: WacRawRow[] | null;
    error: { message: string } | null;
  }>;
};

export type WacSupabaseClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => OrderChain;
      order: (col: string, opts: { ascending: boolean }) => OrderChain;
    };
  };
};

const WAC_SELECT = "id,date,type,weight_grams,rate_per_gram,amount_thb,status,created_at,transaction_mode";

/** Fetch approved transactions in chronological order for WAC calculation.
 *
 * @param opts.approvedOnly  default true — only approved transactions
 * @param opts.officialOnly  default false — when true, excludes cash transactions
 *                           (use for official WAC / CA statements)
 */
export async function fetchAllTransactionsForWacWithClient(
  supabase: WacSupabaseClient,
  opts?: { approvedOnly?: boolean; officialOnly?: boolean }
): Promise<WacTx[]> {
  const approvedOnly = opts?.approvedOnly !== false;
  const officialOnly = opts?.officialOnly === true;
  const all: WacTx[] = [];
  const batchSize = 1000;
  let offset = 0;

  for (;;) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase.from("transactions").select(WAC_SELECT);

    if (approvedOnly || officialOnly) {
      q = q.eq("status", "approved");
    }
    if (officialOnly) {
      q = q.neq("transaction_mode", "cash");
    }

    q = q
      .order("date", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    const { data, error } = await q.range(offset, offset + batchSize - 1);

    if (error) throw error;

    const batch = (data ?? []) as Parameters<typeof rawToWacTx>[0][];
    for (const row of batch) {
      all.push(rawToWacTx(row));
    }
    if (batch.length < batchSize) break;
    offset += batchSize;
  }

  return all;
}

/** Client-side: fetch approved transactions for WAC (legacy transactions table). */
export async function fetchAllTransactionsForWac(): Promise<WacTx[]> {
  return fetchAllTransactionsForWacWithClient(getSupabaseClient() as WacSupabaseClient);
}

// ── Deals-based WAC ─────────────────────────────────────────────────────────

type DealWacRow = {
  id: number;
  date: string;
  weight_gm: number;
  buy_rate: number;
  sell_rate: number;
  created_at: string;
};

/**
 * Fetch approved, non-cash deals and expand each into a BUY + SELL WacTx pair.
 * The BUY is always processed before the SELL (id suffix ensures ordering).
 * WAC filter: is_cash = false AND status = 'approved'.
 */
export async function fetchDealsForWac(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<WacTx[]> {
  const all: WacTx[] = [];
  const batchSize = 1000;
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("deals")
      .select("id,date,weight_gm,buy_rate,sell_rate,created_at")
      .eq("status", "approved")
      .eq("is_cash", false)
      .order("date", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (error) throw new Error(error.message);

    for (const row of (data ?? []) as DealWacRow[]) {
      const w = Number(row.weight_gm) || 0;
      const buyAmount = roundCurrency(w * Number(row.buy_rate));
      const sellAmount = roundCurrency(w * Number(row.sell_rate));

      // BUY first (createdAt with 'B' suffix sorts before 'S')
      all.push({
        id: `deal-${row.id}-buy`,
        date: row.date,
        createdAt: `${row.created_at}-B`,
        type: "BUY",
        weightGrams: w,
        ratePerGram: Number(row.buy_rate),
        amountThb: buyAmount,
      });

      // SELL second
      all.push({
        id: `deal-${row.id}-sell`,
        date: row.date,
        createdAt: `${row.created_at}-S`,
        type: "SELL",
        weightGrams: w,
        ratePerGram: Number(row.sell_rate),
        amountThb: sellAmount,
      });
    }

    if ((data ?? []).length < batchSize) break;
    offset += batchSize;
  }

  return all;
}

/**
 * Compute WAC P&L for approved non-cash deals and return updates keyed by deal ID.
 * Returns: Map<dealId, { wacAtSale, costOfSale, wacProfitLoss }>
 */
export async function computeDealsWacPl(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<Map<number, { wacAtSale: number; costOfSale: number; wacProfitLoss: number }>> {
  const txs = await fetchDealsForWac(supabase);
  const sorted = sortWacTransactions(txs);
  const plMap = recalculateWacPl(sorted);
  const result = new Map<number, { wacAtSale: number; costOfSale: number; wacProfitLoss: number }>();

  for (const tx of sorted) {
    if (!tx.id.startsWith("deal-") || !tx.id.endsWith("-sell")) continue;
    const dealId = parseInt(tx.id.split("-")[1], 10);
    const pl = plMap.get(tx.id);
    if (!pl || pl.wacAtSale == null) continue;
    result.set(dealId, {
      wacAtSale: pl.wacAtSale,
      costOfSale: pl.costOfSale ?? 0,
      wacProfitLoss: pl.profitLoss ?? 0,
    });
  }

  return result;
}

/**
 * Client-side: get current WAC state from the deals table.
 */
export async function getCurrentWacFromDeals(): Promise<{
  wac: number;
  stockGm: number;
  stockValueThb: number;
}> {
  const supabase = getSupabaseClient();
  const txs = await fetchDealsForWac(supabase as any);
  return getCurrentWacState(txs);
}

/** Preview P/L for a pending SELL using current approved WAC chain. */
export function previewSellPl(
  approvedTxs: WacTx[],
  sell: { weightGrams: number; amountThb: number }
): { wacAtSale: number; costOfSale: number; profitLoss: number } | null {
  if (sell.weightGrams <= 0) return null;
  const state = getCurrentWacState(approvedTxs);
  const wacAtSale = roundWac(state.wac);
  const costOfSale = roundCurrency(sell.weightGrams * wacAtSale);
  const profitLoss = roundCurrency(sell.amountThb - costOfSale);
  return { wacAtSale, costOfSale, profitLoss };
}
