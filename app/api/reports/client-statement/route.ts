import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import {
  buildLedger,
  buildStatementRows,
  getClientName,
  type ClientStatementPayload,
  type RawTxForStatement,
} from "@/lib/statement-utils";
import { roundCurrency as rc } from "@/lib/wac-ledger";

const SELECT = `
  id, date, created_at, type, invoice_number, weight_grams, rate_per_gram,
  amount_thb, book, wac_at_sale, cost_of_sale, profit_loss, client_id,
  client:clients(name)
`.replace(/\s+/g, " ").trim();

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!clientId || !from || !to) {
    return NextResponse.json(
      { error: "Provide clientId, from, and to" },
      { status: 400 }
    );
  }

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

    // Build full ledger up to the end of the range
    const upToEnd = allTxs.filter((t) => t.date <= to);
    const ledger = buildLedger(upToEnd);

    // Filter to client + date range
    const clientTxs = allTxs.filter(
      (t) => t.client_id === clientId && t.date >= from && t.date <= to
    );

    const rows = buildStatementRows(clientTxs, ledger);

    // Derive client name from first matching transaction
    const firstTx = allTxs.find((t) => t.client_id === clientId);
    const clientName = firstTx ? getClientName(firstTx.client) : clientId;

    // Summary
    let totalBuyQty = 0, totalBuyValue = 0;
    let totalSellQty = 0, totalSellValue = 0;
    let totalProfitLoss = 0;
    let totalWeight = 0, totalValue = 0;

    for (const r of rows) {
      totalWeight += r.weightGrams;
      totalValue += r.amountThb;
      if (r.type === "BUY") {
        totalBuyQty += r.weightGrams;
        totalBuyValue += r.amountThb;
      } else {
        totalSellQty += r.weightGrams;
        totalSellValue += r.amountThb;
        totalProfitLoss += r.profitLoss ?? 0;
      }
    }

    const avgRate =
      totalWeight > 0 ? rc(totalValue / totalWeight) : null;

    const payload: ClientStatementPayload = {
      clientId,
      clientName,
      from,
      to,
      generatedAt: new Date().toISOString(),
      rows,
      summary: {
        totalBuyQty: rc(totalBuyQty),
        totalBuyValue: rc(totalBuyValue),
        totalSellQty: rc(totalSellQty),
        totalSellValue: rc(totalSellValue),
        totalValue: rc(totalValue),
        avgRate,
        totalProfitLoss: rc(totalProfitLoss),
      },
    };

    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to build client statement";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
