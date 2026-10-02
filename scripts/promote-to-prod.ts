/**
 * Promote the LOCAL two-ledger dataset into a target project (production).
 * Assumes the target ALREADY has the new schema (run baseline_gls_schema.sql +
 * rls-production.sql there first). Copies data only; never runs DDL.
 *
 *   SRC_URL=http://127.0.0.1:54321 SRC_KEY=<local service key> \
 *   DST_URL=https://<ref>.supabase.co DST_KEY=<prod service key> \
 *   [PROD_ADMIN_ID=1] npx tsx scripts/promote-to-prod.ts
 *
 * Copies clients, settings, opening_balances, invoice_counters, transactions,
 * stock_adjustments (ids preserved so self-refs stay valid). Skips users
 * (real prod accounts are created separately) and activity_log (fresh audit).
 * created_by/approved_by/adjusted_by are set to PROD_ADMIN_ID (or null).
 */
const SRC_URL = process.env.SRC_URL!, SRC_KEY = process.env.SRC_KEY!;
const DST_URL = process.env.DST_URL!, DST_KEY = process.env.DST_KEY!;
const ADMIN = process.env.PROD_ADMIN_ID ? Number(process.env.PROD_ADMIN_ID) : null;
if (!SRC_URL || !SRC_KEY || !DST_URL || !DST_KEY) { console.error("Set SRC_URL/SRC_KEY/DST_URL/DST_KEY"); process.exit(1); }

const h = (k: string) => ({ apikey: k, Authorization: "Bearer " + k, "Accept-Profile": "gls", "Content-Profile": "gls", "Content-Type": "application/json" });

async function fetchAll(table: string): Promise<Record<string, unknown>[]> {
  let out: Record<string, unknown>[] = [], from = 0; const step = 1000;
  for (;;) {
    const r = await fetch(`${SRC_URL}/rest/v1/${table}?select=*`, { headers: { ...h(SRC_KEY), Range: `${from}-${from + step - 1}` } });
    if (!r.ok) throw new Error(`read ${table}: ${r.status} ${await r.text()}`);
    const rows = await r.json(); if (!rows.length) break;
    out = out.concat(rows); if (rows.length < step) break; from += step;
  }
  return out;
}
async function insert(table: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const r = await fetch(`${DST_URL}/rest/v1/${table}`, { method: "POST", headers: { ...h(DST_KEY), Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(batch) });
    if (!r.ok) throw new Error(`write ${table} batch ${i}: ${r.status} ${await r.text()}`);
  }
}

(async () => {
  // Order respects FKs: clients before transactions.
  for (const t of ["clients", "settings", "opening_balances", "invoice_counters"]) {
    const rows = await fetchAll(t); await insert(t, rows); console.log(`${t}: ${rows.length}`);
  }
  const txns = (await fetchAll("transactions")).map((t) => ({ ...t, created_by: ADMIN, approved_by: (t as { status?: string }).status === "approved" ? ADMIN : null }));
  await insert("transactions", txns); console.log(`transactions: ${txns.length}`);
  const adj = (await fetchAll("stock_adjustments")).map((a) => ({ ...a, adjusted_by: ADMIN }));
  await insert("stock_adjustments", adj); console.log(`stock_adjustments: ${adj.length}`);
  console.log("PROMOTION COMPLETE. (users + activity_log intentionally skipped.)");
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
