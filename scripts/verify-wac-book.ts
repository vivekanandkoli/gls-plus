/**
 * Ad-hoc verification for the per-book WAC engine (lib/wac-book.ts).
 * Seeds opening balances + a few approved transactions in EACH book, then
 * asserts each ledger computes its own WAC/stock independently.
 * Run: npx tsx scripts/verify-wac-book.ts   (uses .env.local → local Supabase)
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"] });
import { createClient } from "@supabase/supabase-js";
import { computeBookState } from "../lib/wac-book";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const YEAR = new Date().getUTCFullYear();

const supabase = createClient(url, key, {
  db: { schema: "gls" },
  auth: { persistSession: false },
});

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
  console.log("  ✓ " + msg);
}

async function main() {
  // Clean slate for the test rows.
  await supabase.from("transactions").delete().eq("notes", "wac-book-test");
  await supabase.from("opening_balances").delete().eq("year", YEAR);

  // Opening: unofficial starts with 100g @ 2000 (=200,000); official empty.
  await supabase.from("opening_balances").insert([
    { year: YEAR, book: "unofficial", opening_stock_gm: 100, opening_wac: 2000, opening_stock_value_thb: 200000 },
    { year: YEAR, book: "official", opening_stock_gm: 0, opening_wac: 0, opening_stock_value_thb: 0 },
  ]);

  const d = `${YEAR}-03-01`;
  const mk = (book: string, type: string, w: number, rate: number, pm: string) => ({
    book, date: d, type, client_id: null,
    weight_grams: w, rate_per_gram: rate, amount_thb: w * rate,
    payment_mode: pm, status: "approved", notes: "wac-book-test",
  });

  // Unofficial (cash): buy 100g @ 3000 → stock 200g, value 200000+300000=500000, WAC 2500.
  await supabase.from("transactions").insert(mk("unofficial", "BUY", 100, 3000, "cash"));
  // Official (bank): buy 50g @ 4000 → stock 50g, WAC 4000. Independent of unofficial.
  await supabase.from("transactions").insert(mk("official", "BUY", 50, 4000, "bank"));

  const unof = await computeBookState(supabase, "unofficial", YEAR);
  const off = await computeBookState(supabase, "official", YEAR);

  console.log("UNOFFICIAL:", unof);
  assert(Math.abs(unof.stockGm - 200) < 1e-6, "unofficial stock = 200g");
  assert(Math.abs(unof.wac - 2500) < 1e-4, "unofficial WAC = 2500 (blended opening+buy)");

  console.log("OFFICIAL:", off);
  assert(Math.abs(off.stockGm - 50) < 1e-6, "official stock = 50g (independent)");
  assert(Math.abs(off.wac - 4000) < 1e-4, "official WAC = 4000 (independent)");

  // Cleanup.
  await supabase.from("transactions").delete().eq("notes", "wac-book-test");
  await supabase.from("opening_balances").delete().eq("year", YEAR);
  console.log("\nAll per-book WAC assertions passed. ✔");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
