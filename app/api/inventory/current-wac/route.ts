import { NextResponse } from "next/server";

import { fetchAllTransactionsForWacWithClient } from "@/lib/wac-fetch";
import { getCurrentWacState, OPENING_STOCK_GM, OPENING_WAC } from "@/lib/wac-ledger";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

/**
 * GET /api/inventory/current-wac
 * Returns both official and physical WAC and stock from approved transactions.
 *
 * official = only 'official' mode transactions (for CA / statements)
 * physical = all approved transactions (official + cash)
 *
 * Used by the SELL preview card on the transaction form.
 */
export async function GET() {
  try {
    const supabase = createSupabaseServiceClient();

    const [officialTxs, physicalTxs] = await Promise.all([
      fetchAllTransactionsForWacWithClient(supabase as never, { officialOnly: true }),
      fetchAllTransactionsForWacWithClient(supabase as never, { approvedOnly: true }),
    ]);

    const officialState =
      officialTxs.length > 0
        ? getCurrentWacState(officialTxs)
        : { wac: OPENING_WAC, stockGm: OPENING_STOCK_GM, stockValueThb: 0 };

    const physicalState =
      physicalTxs.length > 0
        ? getCurrentWacState(physicalTxs)
        : { wac: OPENING_WAC, stockGm: OPENING_STOCK_GM, stockValueThb: 0 };

    return NextResponse.json({
      // Legacy fields (backward compat with SELL preview)
      wac: officialState.wac,
      stock_gm: physicalState.stockGm,
      // Explicit split
      official_wac: officialState.wac,
      official_stock_gm: officialState.stockGm,
      physical_wac: physicalState.wac,
      physical_stock_gm: physicalState.stockGm,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load WAC";
    return NextResponse.json(
      {
        error: message,
        wac: OPENING_WAC,
        stock_gm: OPENING_STOCK_GM,
        official_wac: OPENING_WAC,
        official_stock_gm: OPENING_STOCK_GM,
        physical_wac: OPENING_WAC,
        physical_stock_gm: OPENING_STOCK_GM,
      },
      { status: 500 }
    );
  }
}
