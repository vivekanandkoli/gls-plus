/**
 * End-to-end check of the two-ledger transactions core against local Supabase.
 *   npx tsx scripts/verify-two-ledger.ts
 * Creates a few transactions, prints computed WAC/P&L, then cleans them up.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { createTransaction, deleteTransaction, type TxnRecord } from "@/lib/txn-service";
import { currentBookWac } from "@/lib/book-wac";
import type { AppUser } from "@/lib/rbac";

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createSupabaseServiceClient() as any;

  const { data: adminRow } = await supabase
    .from("users").select("*").eq("role", "admin").limit(1).maybeSingle();
  if (!adminRow) throw new Error("no admin user — run npm run seed:demo-users");
  const admin: AppUser = {
    id: adminRow.id, authId: adminRow.auth_id, email: adminRow.email,
    role: "admin", isActive: true, createdAt: adminRow.created_at,
  };

  const { data: client } = await supabase.from("clients").select("id,name").limit(1).maybeSingle();
  const clientId = client?.id ?? null;
  const date = "2026-07-06";
  const made: TxnRecord[] = [];

  const buy = await createTransaction(
    { book: "official", date, type: "BUY", clientId, weightGrams: 10, ratePerGram: 4000, paymentMode: "bank" },
    admin
  );
  made.push(buy);
  console.log(`BUY  ${buy.invoice_number}  status=${buy.status}`);

  const sell = await createTransaction(
    { book: "official", date, type: "SELL", clientId, weightGrams: 5, ratePerGram: 4300, paymentMode: "bank" },
    admin
  );
  made.push(sell);
  console.log(`SELL ${sell.invoice_number}  wac_at_sale=${sell.wac_at_sale}  cost=${sell.cost_of_sale}  profit=${sell.profit_loss}  (expect wac=4000 cost=20000 profit=1500)`);

  const state = await currentBookWac(supabase, "official");
  console.log(`official book → stock=${state.stockGm}g  wac=${state.wac}  value=${state.stockValueThb}  (expect stock=5 wac=4000)`);

  const ubuy = await createTransaction(
    { book: "unofficial", date, type: "BUY", clientId, weightGrams: 8, ratePerGram: 4100, paymentMode: "bank" },
    admin
  );
  made.push(ubuy);
  console.log(`UNOFFICIAL BUY ${ubuy.invoice_number}  payment_mode=${ubuy.payment_mode}  (expect PV-… and cash)`);

  // cleanup
  for (const t of made) await deleteTransaction(t.id, admin);
  console.log("cleaned up", made.length, "test rows");
}

main().then(() => process.exit(0)).catch((e) => { console.error("FAIL:", e); process.exit(1); });
