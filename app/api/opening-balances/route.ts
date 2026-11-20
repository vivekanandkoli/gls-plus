import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-server";
import { logAudit } from "@/lib/transaction-audit";
import type { Book } from "@/lib/rbac";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { persistBookWac } from "@/lib/wac-book";
import { roundCurrency, roundWac } from "@/lib/wac-ledger";

/**
 * Opening balances per (year, book): the inventory position each WAC chain
 * starts from. Editing one re-bases that whole year's weighted-average cost,
 * so a successful POST re-persists the book/year's WAC and profit.
 */

/** GET /api/opening-balances — all configured opening balances (admin). */
export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;
    const { data, error } = await sb
      .from("opening_balances")
      .select("year,book,opening_stock_gm,opening_wac,opening_stock_value_thb")
      .order("year", { ascending: false })
      .order("book", { ascending: true });
    if (error) throw new Error(error.message);
    return NextResponse.json({ rows: data ?? [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load opening balances";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/opening-balances
 * Body: { book, year, stockGm, wac } — opening stock value is stockGm × wac.
 * Upserts the (year, book) row, then recomputes that book/year's WAC chain.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await req.json().catch(() => ({}));
    const book: Book | null =
      body.book === "official" || body.book === "unofficial" ? body.book : null;
    const year = Number(body.year);
    const stockGm = Number(body.stockGm);
    const wac = Number(body.wac);

    if (!book) return NextResponse.json({ error: "book must be official or unofficial" }, { status: 400 });
    if (!Number.isInteger(year) || year < 2000 || year > 2100)
      return NextResponse.json({ error: "year is invalid" }, { status: 400 });
    if (!Number.isFinite(stockGm) || stockGm < 0)
      return NextResponse.json({ error: "opening stock (g) must be ≥ 0" }, { status: 400 });
    if (!Number.isFinite(wac) || wac < 0)
      return NextResponse.json({ error: "opening rate must be ≥ 0" }, { status: 400 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;

    const { data: existing } = await sb
      .from("opening_balances")
      .select("opening_stock_gm,opening_wac,opening_stock_value_thb")
      .eq("year", year)
      .eq("book", book)
      .maybeSingle();

    const openingStockGm = roundCurrency(stockGm);
    const openingWac = roundWac(wac);
    const openingValue = roundCurrency(openingStockGm * openingWac);

    const { error: upErr } = await sb.from("opening_balances").upsert(
      {
        year,
        book,
        opening_stock_gm: openingStockGm,
        opening_wac: openingWac,
        opening_stock_value_thb: openingValue,
      },
      { onConflict: "year,book" }
    );
    if (upErr) throw new Error(upErr.message);

    // Re-base the whole year's WAC chain + per-sale profit for this book.
    await persistBookWac(sb, book, year);

    await logAudit({
      entityType: "opening_balance",
      entityId: `${book}-${year}`,
      action: existing ? "updated" : "created",
      performedBy: (admin as { id: number }).id,
      oldValues: existing ?? null,
      newValues: {
        year,
        book,
        opening_stock_gm: openingStockGm,
        opening_wac: openingWac,
        opening_stock_value_thb: openingValue,
      },
    });

    return NextResponse.json({
      ok: true,
      opening: {
        year,
        book,
        opening_stock_gm: openingStockGm,
        opening_wac: openingWac,
        opening_stock_value_thb: openingValue,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save opening balance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
