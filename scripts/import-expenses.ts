/**
 * One-off importer for the Expense Tracker ledger (Expennses.xlsx).
 * Columns: Date, Description, JOB ID, Received, Expense, Balance. The date
 * carries forward when blank; Balance is ignored (computed by the view).
 *
 * Guard: refuses to run if gls.expenses already has rows (set FORCE=1 to override).
 *
 * Run:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/import-expenses.ts "/path/to/Expennses.xlsx"
 */
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const FILE = process.argv[2] || "/Users/vivek/Downloads/Expennses.xlsx";
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function toIso(d: unknown): string | null {
  const s = String(d ?? "").trim();
  const m = s.match(/^(\d{1,2})[-/\s]([A-Za-z]{3,})[-/\s](\d{4})$/);
  if (!m) return null;
  const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
  if (!mon) return null;
  return `${m[3]}-${mon}-${m[1].padStart(2, "0")}`;
}
function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = createClient(url, key, { db: { schema: "gls" }, auth: { persistSession: false } }) as any;

async function main() {
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");

  const { count } = await sb.from("expenses").select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0 && process.env.FORCE !== "1") {
    console.log(`gls.expenses already has ${count} rows — aborting (set FORCE=1 to override).`);
    return;
  }

  const wb = XLSX.readFile(FILE);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: false });

  const out: { date: string; description: string; job_id: string | null; received: number; expense: number }[] = [];
  let lastDate: string | null = null;
  let running = 0; // computed balance, kept aligned to the sheet's Balance column
  let corrections = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] as string[];
    const iso = toIso(r[0]);
    if (iso) lastDate = iso;
    const description = String(r[1] ?? "").trim();
    const jobId = String(r[2] ?? "").trim();
    const received = num(r[3]);
    const expense = num(r[4]);
    const balRaw = r[5];
    const bal = balRaw === "" || balRaw == null ? null : num(balRaw);
    const hasTxn = description !== "" || received !== 0 || expense !== 0;

    if (!hasTxn && bal === null) continue; // fully empty row
    if (!lastDate) continue; // no date context yet

    if (hasTxn) {
      out.push({ date: lastDate, description, job_id: jobId || null, received, expense });
      running += received - expense;
    }
    // The sheet's Balance column is authoritative; where it was manually
    // overridden, record the difference as a labelled adjustment so the running
    // balance reconciles exactly.
    if (bal !== null && Math.abs(bal - running) > 0.5) {
      const jump = Math.round((bal - running) * 100) / 100;
      out.push({
        date: lastDate,
        description: "Balance adjustment (sheet reconciliation)",
        job_id: null,
        received: jump > 0 ? jump : 0,
        expense: jump < 0 ? -jump : 0,
      });
      running = bal;
      corrections++;
    }
  }

  console.log(`Parsed ${out.length} rows (incl. ${corrections} balance reconciliations). Final balance should be ${running}. Inserting…`);
  let inserted = 0;
  for (let i = 0; i < out.length; i += 500) {
    const chunk = out.slice(i, i + 500);
    const { error } = await sb.from("expenses").insert(chunk);
    if (error) throw new Error(`Insert chunk ${i}: ${error.message}`);
    inserted += chunk.length;
  }
  const { data: summary } = await sb.rpc("expense_summary");
  console.log(`Inserted ${inserted}. Summary:`, JSON.stringify(summary));
}

main().catch((e) => { console.error(e); process.exit(1); });
