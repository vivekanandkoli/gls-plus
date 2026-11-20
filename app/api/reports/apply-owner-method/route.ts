import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-server";
import { logAudit } from "@/lib/transaction-audit";
import type { Book } from "@/lib/rbac";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { computeBookSummary, persistBookWac } from "@/lib/wac-book";
import { roundCurrency, roundWac } from "@/lib/wac-ledger";

/**
 * POST /api/reports/apply-owner-method  (admin)
 * Body: { book, year, openingStockGm, openingStockValue, closingRate }
 *
 * Makes the owner/spreadsheet (period) method official for one (book, year):
 *  - sets the opening balance (value → WAC) and re-bases every transaction's
 *    WAC via persistBookWac;
 *  - stores the closing rate, so the book's declared profit switches to
 *    sales − (opening + purchases − closingWeight × closingRate).
 *
 * Per-sale WAC costs stay weighted-average (a single closing rate can't define
 * per-sale costs); only the book-level declared profit uses the closing rate.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await req.json().catch(() => ({}));
    const book: Book | null =
      body.book === "official" || body.book === "unofficial" ? body.book : null;
    const year = Number(body.year);
    const openingStockGm = Number(body.openingStockGm);
    const openingStockValue = Number(body.openingStockValue);
    const closingRate = Number(body.closingRate);

    if (!book) return NextResponse.json({ error: "book must be official or unofficial" }, { status: 400 });
    if (!Number.isInteger(year) || year < 2000 || year > 2100)
      return NextResponse.json({ error: "year is invalid" }, { status: 400 });
    if (!Number.isFinite(openingStockGm) || openingStockGm < 0)
      return NextResponse.json({ error: "opening stock (g) must be ≥ 0" }, { status: 400 });
    if (!Number.isFinite(openingStockValue) || openingStockValue < 0)
      return NextResponse.json({ error: "opening stock value must be ≥ 0" }, { status: 400 });
    if (!Number.isFinite(closingRate) || closingRate < 0)
      return NextResponse.json({ error: "closing rate must be ≥ 0" }, { status: 400 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;

    const { data: existing } = await sb
      .from("opening_balances")
      .select("opening_stock_gm,opening_wac,opening_stock_value_thb,closing_rate")
      .eq("year", year)
      .eq("book", book)
      .maybeSingle();

    const stockGm = roundCurrency(openingStockGm);
    const value = roundCurrency(openingStockValue);
    const wac = stockGm > 0 ? roundWac(value / stockGm) : 0;
    const rate = roundWac(closingRate);

    const { error: upErr } = await sb.from("opening_balances").upsert(
      {
        year,
        book,
        opening_stock_gm: stockGm,
        opening_wac: wac,
        opening_stock_value_thb: value,
        closing_rate: rate,
      },
      { onConflict: "year,book" }
    );
    if (upErr) throw new Error(upErr.message);

    // Re-base the whole year's WAC chain + per-sale profit for this book.
    await persistBookWac(sb, book, year);

    // Recompute the summary so the client can show the new declared profit.
    const summary = await computeBookSummary(sb, book, year);

    await logAudit({
      entityType: "owner_method",
      entityId: `${book}-${year}`,
      action: existing?.closing_rate != null ? "updated" : "applied",
      performedBy: (admin as { id: number }).id,
      oldValues: existing ?? null,
      newValues: {
        year,
        book,
        opening_stock_gm: stockGm,
        opening_wac: wac,
        opening_stock_value_thb: value,
        closing_rate: rate,
      },
    });

    return NextResponse.json({
      ok: true,
      book,
      year,
      opening: { stockGm, wac, valueThb: value },
      closingRate: rate,
      periodProfit: summary.periodProfit,
      wacProfit: summary.profit,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to apply owner method";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
