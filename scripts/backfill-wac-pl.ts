/**
 * One-time backfill: persist WAC P/L for all existing transactions.
 *
 * Usage (requires SUPABASE_SERVICE_ROLE_KEY or authenticated session):
 *   npx tsx scripts/backfill-wac-pl.ts
 */
import { createClient } from "@supabase/supabase-js";

import { persistWacRecalculation } from "../lib/wac-persist";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, { db: { schema: "gls" } });

async function main() {
  console.log("Backfilling WAC P/L from opening balance…");
  try {
    const result = await persistWacRecalculation(supabase as never, {
      fromDate: "1970-01-01",
    });
    console.log(
      `Done: ${result.sellUpdates} SELL rows updated, ${result.updatedCount} total rows touched, current WAC = ${result.currentWac}`
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("cost_of_sale") || msg.includes("schema cache")) {
      console.error(
        "WAC columns are missing. Run scripts/add-transaction-wac-columns.sql in Supabase SQL Editor first."
      );
    }
    throw e;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
