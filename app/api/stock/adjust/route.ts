import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import { isAdmin, type Book } from "@/lib/rbac";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { computeBookState, yearOf } from "@/lib/wac-book";
import { notifyAdmins } from "@/lib/push";

const BOOKS: Book[] = ["official", "unofficial"];
const SELECT = "id,book,date,delta_gm,reason,adjusted_by,status,approved_by,approved_at,rejection_reason,created_at";

/** GET /api/stock/adjust?book=unofficial — current (approved) stock, approved
 *  history, and pending requests (all for admins; own for staff). */
export async function GET(req: Request) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  const url = new URL(req.url);
  const book = (url.searchParams.get("book") as Book) || "unofficial";
  if (!BOOKS.includes(book)) {
    return NextResponse.json({ error: "Invalid book" }, { status: 400 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;
    const state = await computeBookState(sb, book);

    const { data: approved } = await sb
      .from("stock_adjustments")
      .select(SELECT)
      .eq("book", book)
      .eq("status", "approved")
      .order("date", { ascending: false })
      .order("id", { ascending: false });

    let pendingQ = sb
      .from("stock_adjustments")
      .select(SELECT)
      .eq("book", book)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (!isAdmin(user)) pendingQ = pendingQ.eq("adjusted_by", user.id);
    const { data: pending } = await pendingQ;

    return NextResponse.json({
      book,
      currentStockGm: state.physicalStockGm,
      wacStockGm: state.stockGm,
      adjustmentGm: state.adjustmentGm,
      approved: approved ?? [],
      pending: pending ?? [],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load stock";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/stock/adjust — record a stock adjustment.
 *  Admins apply immediately (approved); staff create a pending request.
 *  body: { book, mode: "set"|"delta", grams, date?, reason } */
export async function POST(req: Request) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

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

    // "set" → delta from the current (approved) physical stock for that year.
    let delta = grams;
    if (mode === "set") {
      const state = await computeBookState(sb, book, yearOf(date));
      delta = grams - state.physicalStockGm;
    }
    delta = Math.round(delta * 1000) / 1000;
    if (delta === 0) {
      return NextResponse.json({ error: "No change — stock is already at that value." }, { status: 400 });
    }

    const admin = isAdmin(user);
    const nowIso = new Date().toISOString();
    const { data: inserted, error } = await sb
      .from("stock_adjustments")
      .insert({
        book,
        date,
        delta_gm: delta,
        reason,
        adjusted_by: user.id,
        status: admin ? "approved" : "pending",
        approved_by: admin ? user.id : null,
        approved_at: admin ? nowIso : null,
      })
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);

    if (!admin) {
      await notifyAdmins({
        title: "Stock update needs approval",
        body: `A real-stock change of ${delta > 0 ? "+" : ""}${delta} g was requested.`,
        url: "/stock",
      });
    }

    const state = await computeBookState(sb, book);
    return NextResponse.json(
      { adjustment: inserted, pending: !admin, currentStockGm: state.physicalStockGm },
      { status: 201 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stock adjustment failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/stock/adjust?id=123 — admins remove any; staff cancel their own pending. */
export async function DELETE(req: Request) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  const url = new URL(req.url);
  const id = Number(url.searchParams.get("id"));
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;
    if (!isAdmin(user)) {
      const { data: row } = await sb
        .from("stock_adjustments")
        .select("adjusted_by,status")
        .eq("id", id)
        .maybeSingle();
      if (!row || row.adjusted_by !== user.id || row.status !== "pending") {
        return NextResponse.json({ error: "Not allowed" }, { status: 403 });
      }
    }
    const { error } = await sb.from("stock_adjustments").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
