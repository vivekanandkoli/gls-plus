import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const FILE = "GLS_PLUS_Stock_2025-1.xlsx";
const SHEET = "Stock 2025";

// CRITICAL CONSTANTS
const OPENING_BALANCE_GRAMS = 2331.33;

// Expected totals from sheet Row 2 (use exact integer math for verification).
const EXPECTED = {
  buyWeightMg: 73158.16 * 1000, // E2
  sellWeightMg: 73077.542 * 1000, // F2
  finalBalanceMg: 2411.948 * 1000, // G2
  buyThbSatang: 259_313_070.1 * 100, // K2
  sellThbSatang: 258_216_513.8 * 100, // N2
  buyTxCount: 93,
  sellTxCount: 384,
  totalTxCount: 477,
} as const;

type TxType = "BUY" | "SELL";
type NormalizedTx = {
  sourceRow: number; // Excel row number
  dateIso: string;
  clientName: string; // normalized
  type: TxType;
  invoiceNumber: string;
  weightMg: number; // integer milligrams
  rateSatangPerGram: number; // integer satang/gram
  amountSatang: number; // integer satang
  sheetRunningBalanceMg: number | null; // from column G for verification only
};

function loadEnv() {
  const cwd = process.cwd();
  const envLocal = path.join(cwd, ".env.local");
  const env = path.join(cwd, ".env");
  if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal });
  else if (fs.existsSync(env)) dotenv.config({ path: env });
}

function parseArgs(argv: string[]) {
  const args = new Set(argv);
  const getValue = (name: string) => {
    const idx = argv.findIndex((a) => a === name);
    if (idx === -1) return undefined;
    return argv[idx + 1];
  };
  return {
    dryRun: args.has("--dry-run") || args.has("-d"),
    audit: args.has("--audit") || args.has("--check"),
    wipe: args.has("--wipe"),
    file: getValue("--file") ?? FILE,
    sheet: getValue("--sheet") ?? SHEET,
  };
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.trim().replace(/,/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function rawCell(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ws: any,
  addr: string
): { t: unknown; v: unknown; w: unknown; f: unknown } | null {
  const c = ws?.[addr];
  if (!c) return null;
  return {
    t: c.t ?? null,
    v: c.v ?? null,
    w: c.w ?? null,
    f: c.f ?? null,
  };
}

function isFormulaUncached(
  cell: { t: unknown; v: unknown; w: unknown; f: unknown } | null
): boolean {
  if (!cell) return false;
  return Boolean(cell.f) && (cell.v === null || cell.v === undefined);
}

function toStringOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function mgFromGrams(g: number): number {
  return Math.round(g * 1000);
}
function satangFromThb(t: number): number {
  return Math.round(t * 100);
}
function satangPerGramFromRate(thbPerGram: number): number {
  return Math.round(thbPerGram * 100);
}

/** Local calendar Y-M-D; avoids UTC shift from `toISOString()`. */
function ymdFromLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseExcelDate(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return ymdFromLocalDate(v);
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    const dc = XLSX.SSF.parse_date_code(v);
    if (!dc) return null;
    const y = dc.y;
    const m = String(dc.m).padStart(2, "0");
    const d = String(dc.d).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return ymdFromLocalDate(d);
}

function normalizeClientName(raw: string): string {
  const trimmed = raw.trim();
  const overrides: Record<string, string> = {
    "Gold jewelry": "Gold Jewelry",
    KAA: "Kaa",
    LUME: "Lume",
    ROyal: "Royal",
    royal: "Royal",
    "Raja's": "Rajas",
  };
  const overridden = overrides[trimmed] ?? trimmed;
  // Title case (simple, consistent): split on whitespace, uppercase first letter.
  return overridden
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function getJwtRole(key: string): string {
  try {
    const parts = key.split(".");
    if (parts.length < 2) return "not-jwt";
    const json = Buffer.from(parts[1]!, "base64").toString("utf8");
    const payload = JSON.parse(json) as any;
    return typeof payload?.role === "string" ? payload.role : "missing";
  } catch {
    return "unparseable";
  }
}

function fmtMg(mg: number): string {
  const sign = mg < 0 ? "-" : "";
  const abs = Math.abs(mg);
  const grams = Math.floor(abs / 1000);
  const frac = String(abs % 1000).padStart(3, "0");
  return `${sign}${grams}.${frac} g`;
}

function fmtSatang(satang: number): string {
  const sign = satang < 0 ? "-" : "";
  const abs = Math.abs(satang);
  const thb = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}${thb.toLocaleString("en-US")}.${frac} THB`;
}

function synthInvoice(dateIso: string, row: number, type: TxType): string {
  // Deterministic fallback when the XLSX invoice cells are blank.
  return `MIG${dateIso.replace(/-/g, "")}R${row}${type}`;
}

type Issue = {
  row: number;
  message: string;
  cells?: Record<string, unknown>;
};

async function main() {
  loadEnv();
  const { dryRun, audit, wipe, file, sheet } = parseArgs(process.argv.slice(2));

  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY ??
    "";

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service role) in .env.local."
    );
  }

  const jwtRole = getJwtRole(supabaseKey);
  if (jwtRole !== "service_role") {
    throw new Error(
      `Migration requires a Supabase "service_role" JWT. Decoded role="${jwtRole}".`
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
    db: { schema: "gls" },
  });

  const filePath = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  if (!fs.existsSync(filePath)) throw new Error(`Excel file not found: ${filePath}`);

  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[sheet];
  if (!ws) {
    throw new Error(`Sheet "${sheet}" not found. Available: ${wb.SheetNames.join(", ")}`);
  }

  const getCell = (addr: string): unknown => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = (ws as any)[addr] as { v?: unknown } | undefined;
    return c?.v;
  };

  // Opening balance should be in G3; also enforce the constant.
  const openingFromSheet = toNumber(getCell("G3"));
  const openingFromSheetMg =
    openingFromSheet === null ? null : mgFromGrams(openingFromSheet);
  const openingMg = mgFromGrams(OPENING_BALANCE_GRAMS);
  if (openingFromSheetMg !== null && openingFromSheetMg !== openingMg) {
    throw new Error(
      `Opening balance mismatch: constant=${fmtMg(openingMg)} but sheet G3=${fmtMg(openingFromSheetMg)}`
    );
  }

  // Pull expected totals from row 2 (for verification display only; we still compare to EXPECTED constants).
  const sheetTotals = {
    buyWeightMg: (() => {
      const n = toNumber(getCell("E2"));
      return n === null ? null : mgFromGrams(n);
    })(),
    sellWeightMg: (() => {
      const n = toNumber(getCell("F2"));
      return n === null ? null : mgFromGrams(n);
    })(),
    finalBalanceMg: (() => {
      const n = toNumber(getCell("G2"));
      return n === null ? null : mgFromGrams(n);
    })(),
    buyThbSatang: (() => {
      const n = toNumber(getCell("K2"));
      return n === null ? null : satangFromThb(n);
    })(),
    sellThbSatang: (() => {
      const n = toNumber(getCell("N2"));
      return n === null ? null : satangFromThb(n);
    })(),
  };

  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");
  const START_ROW = 4;

  const txs: NormalizedTx[] = [];
  const issues: Issue[] = [];

  const roundDiv = (num: number, den: number) => Math.round(num / den);
  for (let r = START_ROW; r <= range.e.r + 1; r++) {
    const dateIso = parseExcelDate(getCell(`A${r}`));
    const rawName = toStringOrNull(getCell(`B${r}`));
    if (!dateIso && !rawName) continue;
    if (!dateIso) {
      issues.push({ row: r, message: "missing/invalid date (A)" });
      continue;
    }
    if (!rawName) {
      issues.push({ row: r, message: "missing client name (B)" });
      continue;
    }

    const clientName = normalizeClientName(rawName);
    const buyWeight = toNumber(getCell(`E${r}`));
    const sellWeight = toNumber(getCell(`F${r}`));
    const sheetBal = toNumber(getCell(`G${r}`));
    const sheetRunningBalanceMg = sheetBal === null ? null : mgFromGrams(sheetBal);

    if (buyWeight !== null && buyWeight !== 0) {
      const invoice =
        toStringOrNull(getCell(`C${r}`)) ?? toStringOrNull(getCell(`D${r}`));
      const finalInvoice =
        invoice ??
        (() => {
          const inv = synthInvoice(dateIso, r, "BUY");
          return inv;
        })();
      const weightMg = mgFromGrams(buyWeight);
      const rawJ = rawCell(ws as any, `J${r}`);
      const rawK = rawCell(ws as any, `K${r}`);
      const rateThbPerGram = toNumber(getCell(`J${r}`));
      const amountThb = toNumber(getCell(`K${r}`));
      const rateSatangPerGram =
        rateThbPerGram === null || isFormulaUncached(rawJ)
          ? null
          : satangPerGramFromRate(rateThbPerGram);
      const amountSatang =
        amountThb === null || isFormulaUncached(rawK) ? null : satangFromThb(amountThb);

      let finalRateSatangPerGram = rateSatangPerGram;
      let finalAmountSatang = amountSatang;
      if (finalRateSatangPerGram === null && finalAmountSatang !== null) {
        finalRateSatangPerGram = roundDiv(finalAmountSatang * 1000, weightMg);
      }
      if (finalAmountSatang === null && finalRateSatangPerGram !== null) {
        finalAmountSatang = roundDiv(finalRateSatangPerGram * weightMg, 1000);
      }
      if (finalRateSatangPerGram === null) {
        issues.push({
          row: r,
          message: "missing BUY rate per gram (J) and cannot derive (check cached formula values)",
          cells: { J: rawJ, K: rawK },
        });
        continue;
      }
      if (finalAmountSatang === null) {
        issues.push({
          row: r,
          message: "missing BUY amount THB (K) and cannot derive (check cached formula values)",
          cells: { J: rawJ, K: rawK },
        });
        continue;
      }
      txs.push({
        sourceRow: r,
        dateIso,
        clientName,
        type: "BUY",
        invoiceNumber: finalInvoice,
        weightMg,
        rateSatangPerGram: finalRateSatangPerGram,
        amountSatang: finalAmountSatang,
        // If this row also has a SELL, G reflects the net balance after both —
        // only validate against G after the last (SELL) transaction on this row.
        sheetRunningBalanceMg:
          sellWeight !== null && sellWeight !== 0 ? null : sheetRunningBalanceMg,
      });
    }

    if (sellWeight !== null && sellWeight !== 0) {
      const invoice =
        toStringOrNull(getCell(`D${r}`)) ?? toStringOrNull(getCell(`C${r}`));
      const rawM = rawCell(ws as any, `M${r}`);
      const rawN = rawCell(ws as any, `N${r}`);
      const rateThbPerGram = toNumber(getCell(`M${r}`));
      const amountThb = toNumber(getCell(`N${r}`));
      const finalInvoice =
        invoice ??
        (() => {
          const inv = synthInvoice(dateIso, r, "SELL");
          return inv;
        })();
      const weightMg = mgFromGrams(sellWeight);
      const rateSatangPerGram =
        rateThbPerGram === null || isFormulaUncached(rawM)
          ? null
          : satangPerGramFromRate(rateThbPerGram);
      const amountSatang =
        amountThb === null || isFormulaUncached(rawN) ? null : satangFromThb(amountThb);

      let finalRateSatangPerGram = rateSatangPerGram;
      let finalAmountSatang = amountSatang;
      if (finalRateSatangPerGram === null && finalAmountSatang !== null) {
        finalRateSatangPerGram = roundDiv(finalAmountSatang * 1000, weightMg);
      }
      if (finalAmountSatang === null && finalRateSatangPerGram !== null) {
        finalAmountSatang = roundDiv(finalRateSatangPerGram * weightMg, 1000);
      }

      if (finalRateSatangPerGram === null) {
        issues.push({
          row: r,
          message: "missing SELL rate per gram (M) and cannot derive (likely formula not cached)",
          cells: { M: rawM, N: rawN },
        });
        continue;
      }
      if (finalAmountSatang === null) {
        issues.push({
          row: r,
          message: "missing SELL amount THB (N) and cannot derive (likely formula not cached)",
          cells: { M: rawM, N: rawN },
        });
        continue;
      }
      txs.push({
        sourceRow: r,
        dateIso,
        clientName,
        type: "SELL",
        invoiceNumber: finalInvoice,
        weightMg,
        rateSatangPerGram: finalRateSatangPerGram,
        amountSatang: finalAmountSatang,
        sheetRunningBalanceMg,
      });
    }
  }

  if (audit) {
    const byMsg = new Map<string, number>();
    for (const it of issues) byMsg.set(it.message, (byMsg.get(it.message) ?? 0) + 1);
    console.log("=== XLSX Audit ===");
    console.log(`Parsed transactions: ${txs.length}`);
    console.log(`Issues: ${issues.length}`);
    for (const [msg, n] of [...byMsg.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`- ${n}× ${msg}`);
    }
    if (issues.length) {
      console.log("\nFirst 30 issues (row → problem):");
      for (const it of issues.slice(0, 30)) {
        console.log(`- Row ${it.row}: ${it.message}`);
      }
      process.exitCode = 1;
    } else {
      console.log("AUDIT PASSED");
    }
    return;
  }

  // If the XLSX itself contains duplicate invoice_numbers, abort early (DB has unique constraint).
  {
    const totalCounts = new Map<string, number>();
    for (const t of txs)
      totalCounts.set(t.invoiceNumber, (totalCounts.get(t.invoiceNumber) ?? 0) + 1);
    const dupInvoices = [...totalCounts.entries()].filter(([, n]) => n > 1);
    if (dupInvoices.length > 0) {
      // Deterministically disambiguate duplicates to satisfy DB unique constraint:
      // keep the first occurrence as-is; suffix later occurrences with row+type.
      const seen = new Map<string, number>();
      for (const t of txs) {
        const n = seen.get(t.invoiceNumber) ?? 0;
        seen.set(t.invoiceNumber, n + 1);
        if ((totalCounts.get(t.invoiceNumber) ?? 0) > 1 && n > 0) {
          t.invoiceNumber = `${t.invoiceNumber}__R${t.sourceRow}${t.type}`;
        }
      }
      console.warn(
        `XLSX contains ${dupInvoices.length} duplicate invoice_number values; auto-suffixed later occurrences to keep them unique.`
      );
      for (const [inv, n] of dupInvoices.slice(0, 20)) {
        console.warn(`- ${inv} (${n}×)`);
      }
    }
  }

  if (dryRun) {
    console.log(`[dry-run] showing first 10 transactions (no inserts)`);
    for (const t of txs.slice(0, 10)) {
      console.log(
        `${t.sourceRow} ${t.dateIso} ${t.type} client="${t.clientName}" invoice="${t.invoiceNumber}" weight=${fmtMg(t.weightMg)} rate=${fmtSatang(t.rateSatangPerGram)} amount=${fmtSatang(t.amountSatang)}`
      );
    }
    console.log(`[dry-run] total parsed transactions=${txs.length}`);
    return;
  }

  // Upsert clients by normalized name (cache to avoid repeated queries).
  const clientIdByName = new Map<string, string>();
  async function getOrCreateClientId(name: string): Promise<string> {
    const cached = clientIdByName.get(name);
    if (cached) return cached;
    const { data: found, error: findErr } = await supabase
      .from("clients")
      .select("id")
      .eq("name", name)
      .limit(1)
      .maybeSingle();
    if (findErr) throw findErr;
    if (found?.id) {
      const id = found.id as string;
      clientIdByName.set(name, id);
      return id;
    }
    const { data: created, error: insErr } = await supabase
      .from("clients")
      .insert({ name })
      .select("id")
      .single();
    if (insErr) throw insErr;
    const id = created?.id as string | undefined;
    if (!id) throw new Error(`Failed to create client "${name}"`);
    clientIdByName.set(name, id);
    return id;
  }

  let runningBalanceMg = openingMg;
  let buyWeightMg = 0;
  let sellWeightMg = 0;
  let buyThbSatang = 0;
  let sellThbSatang = 0;
  let buyTxCount = 0;
  let sellTxCount = 0;

  // Preflight: if DB already has any transactions, migration is not safe to re-run without cleanup/upsert semantics.
  try {
    const { count, error } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true });
    if (error) throw error;
    if ((count ?? 0) > 0) {
      if (!wipe) {
        throw new Error(
          `gls.transactions already has ${count} rows. Re-run with --wipe to delete existing gls.stock_ledger + gls.transactions before importing.`
        );
      }
    }
  } catch (e) {
    throw e;
  }

  if (wipe) {
    console.log("[wipe] deleting existing stock_ledger rows...");
    const { error: ledDelErr } = await supabase
      .from("stock_ledger")
      .delete()
      .not("transaction_id", "is", null);
    if (ledDelErr) throw ledDelErr;

    console.log("[wipe] deleting existing transactions rows...");
    const { error: txDelErr } = await supabase
      .from("transactions")
      .delete()
      .not("invoice_number", "is", null);
    if (txDelErr) throw txDelErr;
  }

  for (let i = 0; i < txs.length; i++) {
    const t = txs[i]!;
    const clientId = await getOrCreateClientId(t.clientName);

    const { data: insertedTx, error: txErr } = await supabase
      .from("transactions")
      .insert({
        date: t.dateIso,
        client_id: clientId,
        type: t.type,
        invoice_number: t.invoiceNumber,
        weight_grams: t.weightMg / 1000,
        rate_per_gram: t.rateSatangPerGram / 100,
        amount_thb: t.amountSatang / 100,
        vat_percent: 0,
      })
      .select("id")
      .single();
    if (txErr) {
      throw txErr;
    }
    const transactionId = insertedTx?.id as string | undefined;
    if (!transactionId) throw new Error(`Row ${t.sourceRow}: missing inserted transaction id`);

    runningBalanceMg =
      t.type === "BUY" ? runningBalanceMg + t.weightMg : runningBalanceMg - t.weightMg;

    const { error: ledErr } = await supabase.from("stock_ledger").insert({
      transaction_id: transactionId,
      balance_grams: runningBalanceMg / 1000,
      recorded_at: t.dateIso,
    });
    if (ledErr) throw ledErr;

    if (t.type === "BUY") {
      buyTxCount++;
      buyWeightMg += t.weightMg;
      buyThbSatang += t.amountSatang;
    } else {
      sellTxCount++;
      sellWeightMg += t.weightMg;
      sellThbSatang += t.amountSatang;
    }

    // Optional per-row sheet balance verification (only when present).
    if (t.sheetRunningBalanceMg !== null && t.sheetRunningBalanceMg !== runningBalanceMg) {
      throw new Error(
        `Row ${t.sourceRow}: running balance mismatch: computed=${fmtMg(runningBalanceMg)} sheet(G)=${fmtMg(t.sheetRunningBalanceMg)}`
      );
    }

    if ((i + 1) % 50 === 0) {
      console.log(`[progress] ${i + 1}/${txs.length} inserted`);
    }
  }

  const totals = {
    buyWeightMg,
    sellWeightMg,
    finalBalanceMg: runningBalanceMg,
    buyThbSatang,
    sellThbSatang,
    buyTxCount,
    sellTxCount,
    totalTxCount: buyTxCount + sellTxCount,
  };

  const mismatches: string[] = [];
  const check = (label: string, got: number, exp: number, fmt: (n: number) => string) => {
    if (got !== exp) mismatches.push(`${label}: got ${fmt(got)} expected ${fmt(exp)}`);
  };
  // Allow ±1 satang tolerance for THB totals (floating-point accumulation across 400+ rows)
  const checkThb = (label: string, got: number, exp: number) => {
    if (Math.abs(got - exp) > 1)
      mismatches.push(`${label}: got ${fmtSatang(got)} expected ${fmtSatang(exp)}`);
  };

  check("Total BUY weight", totals.buyWeightMg, EXPECTED.buyWeightMg, fmtMg);
  check("Total SELL weight", totals.sellWeightMg, EXPECTED.sellWeightMg, fmtMg);
  check("Final balance", totals.finalBalanceMg, EXPECTED.finalBalanceMg, fmtMg);
  checkThb("Total BUY THB", totals.buyThbSatang, EXPECTED.buyThbSatang);
  checkThb("Total SELL THB", totals.sellThbSatang, EXPECTED.sellThbSatang);
  if (totals.buyTxCount !== EXPECTED.buyTxCount)
    mismatches.push(`BUY transactions: got ${totals.buyTxCount} expected ${EXPECTED.buyTxCount}`);
  if (totals.sellTxCount !== EXPECTED.sellTxCount)
    mismatches.push(`SELL transactions: got ${totals.sellTxCount} expected ${EXPECTED.sellTxCount}`);
  if (totals.totalTxCount !== EXPECTED.totalTxCount)
    mismatches.push(`Total transactions: got ${totals.totalTxCount} expected ${EXPECTED.totalTxCount}`);

  console.log("=== Verification ===");
  console.log(`Opening balance: ${fmtMg(openingMg)} (G3)`);
  console.log(`Sheet totals (row 2):`, {
    buyWeight: sheetTotals.buyWeightMg === null ? null : fmtMg(sheetTotals.buyWeightMg),
    sellWeight: sheetTotals.sellWeightMg === null ? null : fmtMg(sheetTotals.sellWeightMg),
    finalBalance: sheetTotals.finalBalanceMg === null ? null : fmtMg(sheetTotals.finalBalanceMg),
    buyThb: sheetTotals.buyThbSatang === null ? null : fmtSatang(sheetTotals.buyThbSatang),
    sellThb: sheetTotals.sellThbSatang === null ? null : fmtSatang(sheetTotals.sellThbSatang),
  });
  console.log(`Computed totals:`, {
    buyWeight: fmtMg(totals.buyWeightMg),
    sellWeight: fmtMg(totals.sellWeightMg),
    finalBalance: fmtMg(totals.finalBalanceMg),
    buyThb: fmtSatang(totals.buyThbSatang),
    sellThb: fmtSatang(totals.sellThbSatang),
    buyTxCount: totals.buyTxCount,
    sellTxCount: totals.sellTxCount,
    totalTxCount: totals.totalTxCount,
  });

  if (mismatches.length > 0) {
    console.error("VERIFICATION FAILED");
    for (const m of mismatches) console.error(`- ${m}`);
    process.exitCode = 1;
    return;
  }

  console.log("MIGRATION SUCCESSFUL");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

