import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

const SELECT = "id,date,book,kind,category,amount_thb,description,created_by,created_at";

/** PATCH /api/other-income/[id] — update a row. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: Record<string, any> = {};
    if (body.book === "official" || body.book === "unofficial") payload.book = body.book;
    if (body.kind === "income" || body.kind === "expense") payload.kind = body.kind;
    if (typeof body.category === "string" && body.category.trim()) payload.category = body.category.trim();
    if (typeof body.date === "string" && body.date) payload.date = body.date;
    if (body.amount_thb != null && body.amount_thb !== "") {
      const amt = Number(body.amount_thb);
      if (!Number.isFinite(amt) || amt < 0) {
        return NextResponse.json({ error: "Amount must be zero or more" }, { status: 400 });
      }
      payload.amount_thb = amt;
    }
    if ("description" in body) {
      payload.description = typeof body.description === "string" ? body.description.trim() || null : null;
    }

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;
    const { data, error } = await sb.from("other_income").update(payload).eq("id", id).select(SELECT).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

    return NextResponse.json({ row: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update entry";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/other-income/[id] — remove a row. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;
    const { error } = await sb.from("other_income").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete entry";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
