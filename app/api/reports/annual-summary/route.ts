import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import {
  buildLedger,
  buildStatementRows,
  computeMonthSummary,
  monthBounds,
  stateBeforeDate,
  type AnnualSummaryPayload,
  type AnnualMonthRow,
  type RawTxForStatement,
} from "@/lib/statement-utils";
import { roundCurrency } from "@/lib/wac-ledger";

const SELECT = `
  id, date, created_at, type, invoice_number, weight_grams, rate_per_gram,
  amount_thb, transaction_mode, wac_at_sale, cost_of_sale, profit_loss, pl_percent, client_id,
  client:clients(name)
`.replace(/\s+/g, " ").trim();

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const year = parseInt(url.searchParams.get("year") ?? "");

  if (!year || isNaN(year) || year < 2000 || year > 2100) {
    return NextResponse.json(
      { error: "Provide a valid year" },
      { status: 400 }
    );
  }

  try {
    const supabase = createSupabaseServiceClient() as any;

    const yearEnd = `${year}-12-31`;

    // Fetch OFFICIAL approved transactions up to (and including) end of year.
    // Cash excluded — statements are for CA/official use only.
    // Pre-year transactions are needed to compute correct WAC context for January.
    const { data: all, error } = await supabase
      .from("transactions")
      .select(SELECT)
      .eq("status", "approved")
      .neq("transaction_mode", "cash")
      .lte("date", yearEnd)
      .order("date", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);

    const allTxs = (all ?? []) as RawTxForStatement[];

    // Build full ledger for all transactions up to year end
    const ledger = buildLedger(allTxs);

    const months: AnnualMonthRow[] = [];

    for (let m = 1; m <= 12; m++) {
      const { firstDay, lastDay } = monthBounds(year, m);
      const monthTxs = allTxs.filter(
        (t) => t.date >= firstDay && t.date <= lastDay
      );
      const rows = buildStatementRows(monthTxs, ledger);

      // Closing state for this month
      let closingState = stateBeforeDate(allTxs, firstDay);
      if (rows.length > 0) {
        const lastRow = rows[rows.length - 1];
        const e = ledger.get(lastRow.id);
        if (e) {
          closingState = {
            stockGrams: e.stockAfterGrams,
            stockValueThb: e.stockAfterValue,
            wac: e.wacAfter,
          };
        }
      }

      const summary = computeMonthSummary(rows, closingState);

      months.push({
        month: m,
        buyQty: summary.totalBuyQty,
        buyValue: summary.totalBuyValue,
        sellQty: summary.totalSellQty,
        sellValue: summary.totalSellValue,
        profitLoss: summary.totalProfitLoss,
        closingStockGrams: summary.closingStockGrams,
        closingStockValue: summary.closingStockValue,
        closingWac: summary.closingWac,
      });
    }

    // Year totals
    const totals = months.reduce(
      (acc, m) => ({
        buyQty: acc.buyQty + m.buyQty,
        buyValue: acc.buyValue + m.buyValue,
        sellQty: acc.sellQty + m.sellQty,
        sellValue: acc.sellValue + m.sellValue,
        profitLoss: acc.profitLoss + m.profitLoss,
      }),
      { buyQty: 0, buyValue: 0, sellQty: 0, sellValue: 0, profitLoss: 0 }
    );

    // Year-end state
    const lastMonth = months[11];
    const yearEndStock = {
      stockGrams: lastMonth.closingStockGrams,
      stockValueThb: lastMonth.closingStockValue,
      wac: lastMonth.closingWac,
    };

    const payload: AnnualSummaryPayload = {
      year,
      generatedAt: new Date().toISOString(),
      months,
      totals: {
        buyQty: roundCurrency(totals.buyQty),
        buyValue: roundCurrency(totals.buyValue),
        sellQty: roundCurrency(totals.sellQty),
        sellValue: roundCurrency(totals.sellValue),
        profitLoss: roundCurrency(totals.profitLoss),
      },
      yearEndStock,
    };

    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to build annual summary";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
