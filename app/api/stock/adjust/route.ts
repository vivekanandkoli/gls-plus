import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { computeBookState, yearOf } from "@/lib/wac-book";
import type { Book } from "@/lib/rbac";

const BOOKS: Book[] = ["official", "unofficial"];

/** GET /api/stock/adjust?book=unofficial — current stock + adjustment history. */
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const url = new URL(req.url);
  const book = (url.searchParams.get("book") as Book) || "unofficial";
  if (!BOOKS.includes(book)) {
    return NextResponse.json({ error: "Invalid book" }, { status: 400 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;
    const state = await computeBookState(sb, book);
    const { data: adjustments, error } = await sb
      .from("stock_adjustments")
      .select("id,book,date,delta_gm,reason,adjusted_by,created_at")
      .eq("book", book)
      .order("date", { ascending: false })
      .order("id", { ascending: false });
    if (error) throw new Error(error.message);

    return NextResponse.json({
      book,
      currentStockGm: state.physicalStockGm,
      wacStockGm: state.stockGm,
      adjustmentGm: state.adjustmentGm,
      adjustments: adjustments ?? [],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load stock";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/stock/adjust — record a stock adjustment for a book.
 *  body: { book, mode: "set"|"delta", grams, date?, reason } */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await req.json().catch(() => ({}));
    const book = (body.book as Book) || "unofficial";
    const mode = body.mode === "set" ? "set" : "delta";
    const grams = Number(body.grams);
    const date =
      typeof body.date === "string" && body.date ? body.date : new Date().toISOString().slice(0, 10);
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!BOOKS.includes(book)) {
      return NextResponse.json({ error: "Invalid book" }, { status: 400 });
    }
    if (!Number.isFinite(grams)) {
      return NextResponse.json({ error: "grams must be a number" }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ error: "A reason is required" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;

    // In "set" mode the delta is the difference from the current physical stock
    // for the adjustment's year.
    let delta = grams;
    if (mode === "set") {
      const state = await computeBookState(sb, book, yearOf(date));
      delta = grams - state.physicalStockGm;
    }
    delta = Math.round(delta * 1000) / 1000;

    if (delta === 0) {
      return NextResponse.json({ error: "No change — stock is already at that value." }, { status: 400 });
    }

    const { data: inserted, error } = await sb
      .from("stock_adjustments")
      .insert({ book, date, delta_gm: delta, reason, adjusted_by: admin.id })
      .select("id,book,date,delta_gm,reason,adjusted_by,created_at")
      .single();
    if (error) throw new Error(error.message);

    const state = await computeBookState(sb, book);
    return NextResponse.json(
      { adjustment: inserted, currentStockGm: state.physicalStockGm },
      { status: 201 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stock adjustment failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/stock/adjust?id=123 — remove an adjustment (undo/edit). */
export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const url = new URL(req.url);
  const id = Number(url.searchParams.get("id"));
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;
    const { error } = await sb.from("stock_adjustments").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
