import { NextResponse } from "next/server";

import { fetchAllTransactionsForWacWithClient } from "@/lib/wac-fetch";
import { getCurrentWacState, OPENING_WAC } from "@/lib/wac-ledger";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

export async function GET() {
  try {
    const supabase = createSupabaseServiceClient();
    const txs = await fetchAllTransactionsForWacWithClient(supabase as never);
    const state = txs.length > 0 ? getCurrentWacState(txs) : { wac: OPENING_WAC };
    return NextResponse.json({ currentWac: state.wac });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load current WAC";
    return NextResponse.json({ error: message, currentWac: OPENING_WAC }, { status: 500 });
  }
}
