import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { embedFkOne } from "@/lib/utils";

const SELECT =
  "id,book,type,client_id,weight_grams,rate_per_gram,amount_thb,booking_date,expected_delivery_date,status,converted_txn_id,notes,cancelled_reason,created_by,created_at,client:clients(name)";

type Book = "official" | "unofficial";

/** GET /api/bookings?status=&book=&type= — bookings (newest first) + committed totals. */
export async function GET(req: Request) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status"); // pending|delivered|cancelled|null
    const book = url.searchParams.get("book");
    const type = url.searchParams.get("type"); // BUY|SELL

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = sb.from("bookings").select(SELECT).order("booking_date", { ascending: false }).order("created_at", { ascending: false });
    if (status === "pending" || status === "delivered" || status === "cancelled") query = query.eq("status", status);
    if (book === "official" || book === "unofficial") query = query.eq("book", book);
    if (type === "BUY" || type === "SELL") query = query.eq("type", type);

    const { data, error } = await query.limit(2000);
    if (error) throw new Error(error.message);

    const rows = (data ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      clientName: embedFkOne(r.client as { name: string } | { name: string }[] | null)?.name ?? null,
    }));

    // Committed = sum of weight for pending bookings (what's reserved but not yet delivered).
    const { data: pend } = await sb.from("bookings").select("type,weight_grams").eq("status", "pending");
    const committed = { buy: 0, sell: 0 };
    for (const p of pend ?? []) {
      const w = Number((p as { weight_grams: number }).weight_grams) || 0;
      if ((p as { type: string }).type === "BUY") committed.buy += w;
      else committed.sell += w;
    }
    committed.buy = Math.round(committed.buy * 1000) / 1000;
    committed.sell = Math.round(committed.sell * 1000) / 1000;

    return NextResponse.json({ rows, committed });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load bookings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/bookings — create an advance booking (reservation only, no stock impact). */
export async function POST(req: Request) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  try {
    const body = await req.json().catch(() => ({}));
    const book: Book = body.book === "official" ? "official" : "unofficial";
    const type = body.type === "BUY" || body.type === "SELL" ? body.type : null;
    const clientId = typeof body.clientId === "string" && body.clientId ? body.clientId : null;
    const weight = Number(body.weightGrams);
    const rate = Number(body.ratePerGram);
    const bookingDate = typeof body.bookingDate === "string" && body.bookingDate ? body.bookingDate : null;
    const deliveryDate = typeof body.expectedDeliveryDate === "string" && body.expectedDeliveryDate ? body.expectedDeliveryDate : null;
    const notes = typeof body.notes === "string" ? body.notes.trim() || null : null;

    if (!type || !bookingDate || !Number.isFinite(weight) || weight <= 0) {
      return NextResponse.json({ error: "Type, booking date and a positive weight are required" }, { status: 400 });
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      return NextResponse.json({ error: "Rate must be greater than zero" }, { status: 400 });
    }
    const amount = body.amountThb != null && body.amountThb !== "" ? Number(body.amountThb) : weight * rate;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;
    const { data, error } = await sb
      .from("bookings")
      .insert({
        book, type, client_id: clientId,
        weight_grams: weight, rate_per_gram: rate, amount_thb: amount,
        booking_date: bookingDate, expected_delivery_date: deliveryDate,
        status: "pending", notes, created_by: user.id,
      })
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ booking: data }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create booking";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
