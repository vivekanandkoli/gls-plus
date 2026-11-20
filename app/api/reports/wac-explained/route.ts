import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import type { Book } from "@/lib/rbac";
import { fetchBookTransactions, fetchOpeningBalance } from "@/lib/wac-book";
import { getCurrentWacState, recalculateWacPl, roundCurrency, roundWac } from "@/lib/wac-ledger";

/**
 * GET /api/reports/wac-explained?year=YYYY&book=official|unofficial
 *
 * Returns every input and intermediate value behind the dashboard's WAC +
 * realized-profit figure, so the report page can show the full formula:
 *
 *   COGS (WAC)        = opening value + purchases(at cost) − closing value
 *   realized profit   = sales − COGS                (== Σ per-sale WAC profit)
 *   current WAC       = closing value ÷ closing weight
 *
 * The owner/period method (closing stock marked to a chosen rate) is computed
 * client-side from these same components, so the user can reconcile to a
 * spreadsheet by editing the opening value and closing rate.
 */
export async function GET(req: Request) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  try {
    const url = new URL(req.url);
    const now = new Date().getUTCFullYear();
    const year = Number(url.searchParams.get("year")) || now;
    const book: Book = url.searchParams.get("book") === "unofficial" ? "unofficial" : "official";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;

    const opening = await fetchOpeningBalance(sb, book, year);
    const txs = await fetchBookTransactions(sb, book, { approvedOnly: true, year });
    const closing = getCurrentWacState(txs, opening);
    const pl = recalculateWacPl(txs, opening);

    let buyWeight = 0;
    let buyValueAtCost = 0; // Σ(weight × rate) — the basis the WAC chain adds to stock
    let buyValueInvoiced = 0; // Σ(amount_thb) — what you actually paid on the invoices
    let sellWeight = 0;
    let sellValue = 0;
    let realizedProfit = 0;
    for (const t of txs) {
      if (t.type === "BUY") {
        buyWeight += t.weightGrams;
        buyValueAtCost += roundCurrency(t.weightGrams * t.ratePerGram);
        buyValueInvoiced += t.amountThb;
      } else {
        sellWeight += t.weightGrams;
        sellValue += t.amountThb;
        const p = pl.get(t.id);
        if (p?.profitLoss != null) realizedProfit += p.profitLoss;
      }
    }

    const openingValue = roundCurrency(opening.stockValueThb);
    const purchasesValue = roundCurrency(buyValueAtCost);
    const closingValue = roundCurrency(closing.stockValueThb);
    const salesValue = roundCurrency(sellValue);
    const cogsWac = roundCurrency(openingValue + purchasesValue - closingValue);

    // Years that actually have data, for the selector.
    const { data: yearRows } = await sb.from("transactions").select("date").eq("book", book);
    const years = Array.from(
      new Set<number>((yearRows ?? []).map((r: { date: string }) => new Date(r.date).getUTCFullYear()))
    ).sort((a: number, b: number) => b - a);

    return NextResponse.json({
      year,
      book,
      years: years.length ? years : [now],
      opening: {
        stockGm: roundCurrency(opening.stockGm),
        valueThb: openingValue,
        wac: roundWac(opening.wac),
      },
      purchases: {
        weightGm: roundCurrency(buyWeight),
        valueThb: purchasesValue,
        valueInvoicedThb: roundCurrency(buyValueInvoiced),
      },
      sales: {
        weightGm: roundCurrency(sellWeight),
        valueThb: salesValue,
      },
      closing: {
        stockGm: roundCurrency(closing.stockGm),
        wac: roundWac(closing.wac),
        valueThb: closingValue,
      },
      cogsWac,
      realizedProfit: roundCurrency(realizedProfit),
      txnCount: txs.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to compute WAC breakdown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
