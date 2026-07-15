/**
 * One-off dev helper: copy data from the OLD cloud project into the LOCAL
 * two-ledger schema so the dashboard has something to show.
 *
 *   CLOUD_URL=https://<ref>.supabase.co CLOUD_KEY=<service_role> \
 *     npx tsx scripts/copy-cloud-to-local.ts
 *
 * Reads cloud (non-destructive); writes only to local. Mapping:
 *   transaction_mode 'cash' → book 'unofficial' (cash-only, off-book)
 *   transaction_mode else   → book 'official'
 * created_by/approved_by are repointed to the local admin; per-book WAC is
 * recomputed at the end.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { recalcBookWac } from "@/lib/book-wac";

async function main() {
  const cloudUrl = process.env.CLOUD_URL;
  const cloudKey = process.env.CLOUD_KEY;
  if (!cloudUrl || !cloudKey) throw new Error("Set CLOUD_URL and CLOUD_KEY env vars");

  const cloud = createClient(cloudUrl, cloudKey, { db: { schema: "gls" } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const local = createSupabaseServiceClient() as any;

  // 0. Relax the unique client-name index on the live local DB (real data has
  //    case-variant duplicate names).
  const sql = postgres("postgresql://postgres:postgres@127.0.0.1:54322/postgres");
  await sql`drop index if exists gls.clients_name_key`;
  await sql`create index if not exists clients_name_key on gls.clients (lower(name))`;
  await sql.end();

  // 1. Clients (preserve ids so transaction FKs line up).
  const { data: clients, error: cErr } = await cloud
    .from("clients")
    .select("id,name,phone,email,created_at");
  if (cErr) throw new Error(`cloud clients: ${cErr.message}`);
  if (clients?.length) {
    const { error } = await local.from("clients").upsert(clients, { onConflict: "id" });
    if (error) throw new Error(`local clients: ${error.message}`);
  }
  console.log(`clients copied: ${clients?.length ?? 0}`);

  // 2. Local admin id for created_by/approved_by.
  const { data: admin } = await local.from("users").select("id").eq("role", "admin").limit(1).maybeSingle();
  const adminId: number | null = admin?.id ?? null;

  // 3. Transactions.
  const { data: txns, error: tErr } = await cloud
    .from("transactions")
    .select("id,client_id,date,type,invoice_number,weight_grams,rate_per_gram,amount_thb,vat_percent,notes,status,transaction_mode,created_at");
  if (tErr) throw new Error(`cloud transactions: ${tErr.message}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapped = (txns ?? []).map((t: any) => {
    const book = t.transaction_mode === "cash" ? "unofficial" : "official";
    const status = t.status ?? "approved";
    return {
      id: t.id,
      book,
      date: t.date,
      type: t.type,
      client_id: t.client_id ?? null,
      weight_grams: Number(t.weight_grams) || 0,
      rate_per_gram: Number(t.rate_per_gram) || 0,
      amount_thb: Number(t.amount_thb) || 0,
      payment_mode: book === "unofficial" ? "cash" : "bank",
      vat_percent: book === "official" ? t.vat_percent ?? null : null,
      invoice_number: t.invoice_number ?? null,
      notes: t.notes ?? null,
      status,
      created_by: adminId,
      approved_by: status === "approved" ? adminId : null,
      approved_at: status === "approved" ? t.created_at : null,
      created_at: t.created_at,
    };
  });

  // Insert in batches of 500.
  for (let i = 0; i < mapped.length; i += 500) {
    const batch = mapped.slice(i, i + 500);
    const { error } = await local.from("transactions").upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`local transactions batch ${i}: ${error.message}`);
  }
  console.log(`transactions copied: ${mapped.length}`);

  // 4. Opening balances — give the official book the legacy opening so stock is
  //    realistic; unofficial starts empty.
  const year = new Date().getFullYear();
  const { error: obErr } = await local.from("opening_balances").upsert(
    [
      { year, book: "official", opening_stock_gm: 2331.33, opening_wac: 2859.09, opening_stock_value_thb: 6665493.2 },
      { year, book: "unofficial", opening_stock_gm: 0, opening_wac: 0, opening_stock_value_thb: 0 },
    ],
    { onConflict: "year,book" }
  );
  if (obErr) throw new Error(`opening_balances: ${obErr.message}`);

  // 5. Recompute per-book WAC / P&L.
  await recalcBookWac(local, "official");
  await recalcBookWac(local, "unofficial");
  console.log("WAC recomputed for both books. Done.");
}

main().then(() => process.exit(0)).catch((e) => { console.error("FAIL:", e); process.exit(1); });
