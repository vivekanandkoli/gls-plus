import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { logAudit } from "@/lib/transaction-audit";

const SELECT =
  "id,book,type,client_id,weight_grams,rate_per_gram,amount_thb,booking_date,expected_delivery_date,status,converted_txn_id,notes,cancelled_reason,created_by,created_at";

/** PATCH /api/bookings/[id] — edit a PENDING booking. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;
    const { data: existing, error: loadErr } = await sb.from("bookings").select("status").eq("id", id).maybeSingle();
    if (loadErr) throw new Error(loadErr.message);
    if (!existing) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    if (existing.status !== "pending") {
      return NextResponse.json({ error: "Only pending bookings can be edited." }, { status: 409 });
    }

    const body = await req.json().catch(() => ({}));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: Record<string, any> = {};
    if (body.book === "official" || body.book === "unofficial") payload.book = body.book;
    if (body.type === "BUY" || body.type === "SELL") payload.type = body.type;
    if ("clientId" in body) payload.client_id = typeof body.clientId === "string" && body.clientId ? body.clientId : null;
    if (body.weightGrams != null && body.weightGrams !== "") {
      const w = Number(body.weightGrams);
      if (!Number.isFinite(w) || w <= 0) return NextResponse.json({ error: "Weight must be positive" }, { status: 400 });
      payload.weight_grams = w;
    }
    if (body.ratePerGram != null && body.ratePerGram !== "") {
      const r = Number(body.ratePerGram);
      if (!Number.isFinite(r) || r <= 0) return NextResponse.json({ error: "Rate must be positive" }, { status: 400 });
      payload.rate_per_gram = r;
    }
    if (body.bookingDate) payload.booking_date = body.bookingDate;
    if ("expectedDeliveryDate" in body) payload.expected_delivery_date = body.expectedDeliveryDate || null;
    if ("notes" in body) payload.notes = typeof body.notes === "string" ? body.notes.trim() || null : null;

    // Recompute amount if weight or rate changed and no explicit amount given.
    if ((payload.weight_grams != null || payload.rate_per_gram != null) && (body.amountThb == null || body.amountThb === "")) {
      const { data: cur } = await sb.from("bookings").select("weight_grams,rate_per_gram").eq("id", id).maybeSingle();
      const w = payload.weight_grams ?? Number(cur?.weight_grams) ?? 0;
      const r = payload.rate_per_gram ?? Number(cur?.rate_per_gram) ?? 0;
      payload.amount_thb = w * r;
    } else if (body.amountThb != null && body.amountThb !== "") {
      payload.amount_thb = Number(body.amountThb);
    }

    if (Object.keys(payload).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

    const { data: before } = await sb.from("bookings").select(SELECT).eq("id", id).maybeSingle();
    const { data, error } = await sb.from("bookings").update(payload).eq("id", id).select(SELECT).maybeSingle();
    if (error) throw new Error(error.message);
    await logAudit({ entityType: "booking", entityId: id, action: "updated", performedBy: user.id, oldValues: before ?? null, newValues: data });
    return NextResponse.json({ booking: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update booking";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/bookings/[id] — remove a booking (any status; it never touched stock). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;
    const { data: before } = await sb.from("bookings").select(SELECT).eq("id", id).maybeSingle();
    const { error } = await sb.from("bookings").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await logAudit({ entityType: "booking", entityId: id, action: "deleted", performedBy: user.id, oldValues: before ?? null });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete booking";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
