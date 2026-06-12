/**
 * Apply WAC column migration + backfill in one step.
 *
 * Requires SUPABASE_DB_URL in .env.local (Database → Connection string → URI).
 *   npm run wac:setup
 */
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { applyWacColumnMigration } from "../lib/wac-migrate";
import { checkWacColumnsAvailable } from "../lib/wac-columns";
import { persistWacRecalculation } from "../lib/wac-persist";
import { resolveSupabaseDbUrl } from "../lib/supabase-db-url";

function loadEnv() {
  const cwd = process.cwd();
  for (const file of [".env.local", ".env"]) {
    const p = path.join(cwd, file);
    if (fs.existsSync(p)) dotenv.config({ path: p });
  }
}

async function main() {
  loadEnv();

  const dbUrl = resolveSupabaseDbUrl();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key, { db: { schema: "gls" } });
  let hasColumns = await checkWacColumnsAvailable(supabase as never);

  if (!hasColumns) {
    if (!dbUrl) {
      console.error(
        "WAC columns missing. Add SUPABASE_DB_URL or SUPABASE_DB_PASSWORD to .env.local, or run scripts/add-transaction-wac-columns.sql in Supabase SQL Editor."
      );
      process.exit(2);
    }
    console.log("Applying migration…");
    await applyWacColumnMigration(dbUrl);
    hasColumns = await checkWacColumnsAvailable(supabase as never);
    if (!hasColumns) {
      console.error("Migration applied but columns still not visible. Retry in a few seconds.");
      process.exit(1);
    }
    console.log("Migration OK.");
  } else {
    console.log("WAC columns already present.");
  }

  console.log("Backfilling WAC P/L…");
  const result = await persistWacRecalculation(supabase as never, {
    fromDate: "1970-01-01",
  });
  console.log(
    `Done: ${result.sellUpdates} SELL rows updated, current WAC = ${result.currentWac}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
