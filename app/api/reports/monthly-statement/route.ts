import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import {
  buildLedger,
  buildStatementRows,
  computeMonthSummary,
  monthBounds,
  stateBeforeDate,
  type MonthlyStatementPayload,
  type RawTxForStatement,
} from "@/lib/statement-utils";

const SELECT = `
  id, date, created_at, type, invoice_number, weight_grams, rate_per_gram,
  amount_thb, book, wac_at_sale, cost_of_sale, profit_loss, client_id,
  client:clients(name)
`.replace(/\s+/g, " ").trim();

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const year = parseInt(url.searchParams.get("year") ?? "");
  const month = parseInt(url.searchParams.get("month") ?? "");

  if (!year || isNaN(year) || !month || month < 1 || month > 12) {
    return NextResponse.json(
      { error: "Provide valid year and month (1–12)" },
      { status: 400 }
    );
  }

  const { firstDay, lastDay } = monthBounds(year, month);

  try {
    const supabase = createSupabaseServiceClient() as any;

    // Fetch OFFICIAL approved transactions only - cash excluded from CA statements
    const { data: all, error } = await supabase
      .from("transactions")
      .select(SELECT)
      .eq("status", "approved")
      .eq("book", "official")
      .order("date", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);

    const allTxs = (all ?? []) as RawTxForStatement[];

    // Opening state = inventory state before first day of the month
    const opening = stateBeforeDate(allTxs, firstDay);

    // Filter to transactions within the month
    const monthTxs = allTxs.filter(
      (t) => t.date >= firstDay && t.date <= lastDay
    );

    // Build full ledger for opening + month transactions to get running stock
    const txsUpToEndOfMonth = allTxs.filter((t) => t.date <= lastDay);
    const ledger = buildLedger(txsUpToEndOfMonth);

    const rows = buildStatementRows(monthTxs, ledger);

    // Closing state = state after last transaction of the month
    const closingEntry =
      rows.length > 0 ? (() => {
        const lastRow = rows[rows.length - 1];
        const e = ledger.get(lastRow.id);
        return e
          ? { stockGrams: e.stockAfterGrams, stockValueThb: e.stockAfterValue, wac: e.wacAfter }
          : opening;
      })() : opening;

    const summary = computeMonthSummary(rows, closingEntry);

    const payload: MonthlyStatementPayload = {
      year,
      month,
      generatedAt: new Date().toISOString(),
      opening,
      rows,
      summary,
    };

    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to build statement";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
