/**
 * One-off importer: add the transactions missing from the app that are present
 * in the owner's spreadsheet (Oct2026.xlsx, "stock 2026" sheet).
 *
 * Idempotent: only inserts rows whose invoice_number isn't already in the DB.
 * After inserting it recomputes the official-book WAC for the affected years.
 *
 * Run (against PRODUCTION):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/import-oct2026.ts "/path/to/Oct2026.xlsx"
 *
 * Defaults applied: book=official, status=approved, payment_mode=bank,
 * vat_percent=null, created_by/approved_by = first active admin.
 */
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import { persistBookWac, yearOf } from "../lib/wac-book";

const FILE = process.argv[2] || "/Users/vivek/Downloads/Oct2026.xlsx";
const SHEET = "stock 2026";
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Owner-provided fixes for rows that have a blank invoice in the sheet.
const BLANK_INVOICE_FIXES: Record<string, string> = {
  // date|name|type  ->  invoice number
  "2026-09-25|Prosper|BUY": "I-LC260017",
};

const sb = createClient(url, key, {
  db: { schema: "gls" },
  auth: { persistSession: false },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, "").replace(/[()]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function toIso(d: unknown): string | null {
  const m = String(d ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

type Tx = {
  date: string; name: string; type: "BUY" | "SELL";
  invoice: string; weight: number; rate: number; amount: number;
};

function parseExcel(): Tx[] {
  const wb = XLSX.readFile(FILE);
  const ws = wb.Sheets[SHEET];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: false });
  const out: Tx[] = [];
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i] as string[];
    const date = toIso(r[1]);
    const name = String(r[2] ?? "").trim();
    if (!date || !name) continue;
    const buyW = num(r[5]);
    const sellW = num(r[6]);
    const fix = (type: "BUY" | "SELL", inv: string) =>
      inv || BLANK_INVOICE_FIXES[`${date}|${name}|${type}`] || "";
    if (buyW && buyW > 0) {
      const invoice = fix("BUY", String(r[3] ?? "").trim());
      const rate = num(r[10]); const amount = num(r[11]);
      if (invoice && rate && amount) out.push({ date, name, type: "BUY", invoice, weight: buyW, rate, amount });
    }
    if (sellW && sellW > 0) {
      const invoice = fix("SELL", String(r[4] ?? "").trim());
      const rate = num(r[13]); const amount = num(r[14]);
      if (invoice && rate && amount) out.push({ date, name, type: "SELL", invoice, weight: sellW, rate, amount });
    }
  }
  return out;
}

async function main() {
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");

  const all = parseExcel();
  console.log(`Parsed ${all.length} transactions from the sheet.`);

  // Existing invoice numbers in the DB.
  const dbInv = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("transactions").select("invoice_number").range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) if (r.invoice_number) dbInv.add(String(r.invoice_number).trim());
    if (data.length < 1000) break;
  }

  const missing = all.filter((t) => !dbInv.has(t.invoice));
  console.log(`Missing from DB: ${missing.length}`);
  if (missing.length === 0) { console.log("Nothing to add."); return; }

  const DRY = process.env.DRY_RUN === "1";
  if (DRY) {
    const { data: cr } = await sb.from("clients").select("name");
    const have = new Set((cr ?? []).map((c: { name: string }) => c.name.trim().toLowerCase()));
    const newClients = [...new Set(missing.map((t) => t.name))].filter((n) => !have.has(n.toLowerCase()));
    console.log(`\n[DRY RUN] would create clients: ${JSON.stringify(newClients)}`);
    console.log(`[DRY RUN] would insert ${missing.length} transactions:`);
    for (const t of missing.sort((a, b) => a.date.localeCompare(b.date))) {
      console.log(`  ${t.date} ${t.type.padEnd(4)} ${t.invoice.padEnd(13)} ${t.name.padEnd(14)} ${t.weight}g @ ${t.rate} = ${t.amount.toLocaleString()}`);
    }
    return;
  }

  // Admin for created_by / approved_by.
  const { data: admins } = await sb.from("users")
    .select("id").eq("role", "admin").eq("is_active", true).order("id").limit(1);
  const adminId = admins?.[0]?.id ?? null;
  if (!adminId) throw new Error("No active admin user found");

  // Client name -> id (create any that are missing).
  const { data: clientRows } = await sb.from("clients").select("id,name");
  const byName = new Map<string, string>();
  for (const c of clientRows ?? []) byName.set(String(c.name).trim().toLowerCase(), c.id);

  const neededNames = [...new Set(missing.map((t) => t.name))];
  for (const name of neededNames) {
    if (!byName.has(name.toLowerCase())) {
      const { data, error } = await sb.from("clients").insert({ name }).select("id").single();
      if (error) throw new Error(`Create client ${name}: ${error.message}`);
      byName.set(name.toLowerCase(), data.id);
      console.log(`Created client: ${name}`);
    }
  }

  const nowIso = new Date().toISOString();
  const rows = missing.map((t) => ({
    book: "official",
    type: t.type,
    date: t.date,
    client_id: byName.get(t.name.toLowerCase()) ?? null,
    weight_grams: t.weight,
    rate_per_gram: t.rate,
    amount_thb: t.amount,
    payment_mode: "bank",
    vat_percent: null,
    invoice_number: t.invoice,
    status: "approved",
    created_by: adminId,
    approved_by: adminId,
    approved_at: nowIso,
  }));

  // Insert in chunks.
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const { error } = await sb.from("transactions").insert(chunk);
    if (error) throw new Error(`Insert chunk ${i}: ${error.message}`);
    inserted += chunk.length;
  }
  console.log(`Inserted ${inserted} transactions.`);

  // Recompute WAC per affected official year.
  const years = [...new Set(missing.map((t) => yearOf(t.date)))];
  for (const y of years) {
    const n = await persistBookWac(sb, "official", y);
    console.log(`Recomputed WAC for official ${y}: ${n} rows.`);
  }
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
