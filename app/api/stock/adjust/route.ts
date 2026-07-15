import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { currentBookWac } from "@/lib/book-wac";
import { logActivity } from "@/lib/audit-log";
import type { Book } from "@/lib/opening-balances";

export const dynamic = "force-dynamic";

const BOOKS = ["official", "unofficial"] as const;

// GET /api/stock/adjust?book=official — list adjustments (admin)
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const { searchParams } = new URL(req.url);
  const bookParam = searchParams.get("book");
  const book = BOOKS.includes(bookParam as Book) ? (bookParam as Book) : undefined;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (createSupabaseServiceClient() as any)
      .from("stock_adjustments")
      .select("id,book,date,delta_gm,reason,adjusted_by,created_at")
      .order("date", { ascending: false })
      .order("id", { ascending: false });
    if (book) q = q.eq("book", book);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return NextResponse.json({ adjustments: data ?? [] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

// POST /api/stock/adjust — create an adjustment (admin)
// body: { book, date, mode: 'delta'|'set', grams, reason }
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await req.json().catch(() => null);
    const book = BOOKS.includes(body?.book) ? (body.book as Book) : null;
    const mode = body?.mode === "set" ? "set" : "delta";
    const grams = Number(body?.grams);
    const date = typeof body?.date === "string" ? body.date : new Date().toISOString().slice(0, 10);
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

    if (!book || !Number.isFinite(grams) || !reason) {
      return NextResponse.json({ error: "book, grams, and reason are required" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    let delta = grams;
    if (mode === "set") {
      const current = await currentBookWac(supabase, book);
      delta = Math.round((grams - current.stockGm) * 1000) / 1000;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("stock_adjustments")
      .insert({ book, date, delta_gm: delta, reason, adjusted_by: admin.id })
      .select("id,book,date,delta_gm,reason,created_at")
      .single();
    if (error) throw new Error(error.message);

    await logActivity({
      action: "stock_adjusted",
      performedBy: admin.id,
      newValues: { book, date, delta_gm: delta, reason, mode },
    });

    const after = await currentBookWac(supabase, book);
    return NextResponse.json({ adjustment: data, newStockGm: after.stockGm }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Adjustment failed" }, { status: 500 });
  }
}
