import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import { nextInvoiceNumber } from "@/lib/invoice-number";
import { logTransactionAudit } from "@/lib/transaction-audit";
import { isAdmin, type Book, type PaymentMode } from "@/lib/rbac";
import { initialStatusForRole } from "@/lib/transaction-permissions";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { persistBookWac, yearOf } from "@/lib/wac-book";

const TX_SELECT =
  "id,book,client_id,date,type,invoice_number,weight_grams,rate_per_gram,amount_thb,payment_mode,vat_percent,notes,status,created_by,approved_by,approved_at";
const PAYMENT_MODES: PaymentMode[] = ["bank", "qr", "cheque", "cash"];
const STATUSES = ["pending", "approved", "rejected"];

/**
 * POST /api/bookings/[id]/convert — turn a pending booking into a real
 * transaction on delivery. Rate/weight/date can be adjusted in the body.
 * The transaction then flows through WAC, invoice numbering and approval.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;

    const { data: b, error: loadErr } = await sb
      .from("bookings")
      .select("id,book,type,client_id,weight_grams,rate_per_gram,expected_delivery_date,notes,status")
      .eq("id", id)
      .maybeSingle();
    if (loadErr) throw new Error(loadErr.message);
    if (!b) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    if (b.status !== "pending") {
      return NextResponse.json({ error: `Booking is already ${b.status}.` }, { status: 409 });
    }

    const body = await req.json().catch(() => ({}));
    const book: Book = b.book === "official" ? "official" : "unofficial";
    const type: "BUY" | "SELL" = b.type;
    const clientId: string | null = b.client_id ?? null;

    const weight = body.weightGrams != null && body.weightGrams !== "" ? Number(body.weightGrams) : Number(b.weight_grams);
    const rate = body.ratePerGram != null && body.ratePerGram !== "" ? Number(body.ratePerGram) : Number(b.rate_per_gram);
    const date =
      typeof body.date === "string" && body.date
        ? body.date
        : (b.expected_delivery_date || new Date().toISOString().slice(0, 10));

    if (!Number.isFinite(weight) || weight <= 0) {
      return NextResponse.json({ error: "Weight must be greater than zero" }, { status: 400 });
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      return NextResponse.json({ error: "Rate must be greater than zero" }, { status: 400 });
    }
    const amount = body.amountThb != null && body.amountThb !== "" ? Number(body.amountThb) : weight * rate;

    let paymentMode: PaymentMode = PAYMENT_MODES.includes(body.paymentMode) ? body.paymentMode : "bank";
    if (book === "unofficial") paymentMode = "cash";
    const vat = book === "official" && body.vatPercent != null && body.vatPercent !== "" ? Number(body.vatPercent) : null;
    const notes = typeof body.notes === "string" ? body.notes.trim() || null : (b.notes ?? null);

    const status = isAdmin(user) && STATUSES.includes(body.status) ? body.status : initialStatusForRole(user.role);
    const approvedAt = status === "approved" ? new Date().toISOString() : null;

    const manualInvoice = typeof body.invoiceNumber === "string" ? body.invoiceNumber.trim() : "";
    const invoiceNumber = manualInvoice || (await nextInvoiceNumber(sb, book, type, date));

    const { data: inserted, error } = await sb
      .from("transactions")
      .insert({
        book, type, date, client_id: clientId,
        weight_grams: weight, rate_per_gram: rate, amount_thb: amount,
        payment_mode: paymentMode, vat_percent: vat, invoice_number: invoiceNumber,
        notes, status, created_by: user.id,
        approved_by: status === "approved" ? user.id : null, approved_at: approvedAt,
      })
      .select(TX_SELECT)
      .single();
    if (error) throw new Error(error.message);

    if (status === "approved") {
      await persistBookWac(sb, book, yearOf(date));
    }

    await logTransactionAudit({
      transactionId: inserted.id,
      action: "created",
      performedBy: user.id,
      newValues: { ...inserted, from_booking: id } as Record<string, unknown>,
    });

    const { data: updatedBooking, error: upErr } = await sb
      .from("bookings")
      .update({ status: "delivered", converted_txn_id: inserted.id, delivered_at: new Date().toISOString() })
      .eq("id", id)
      .select("id,status,converted_txn_id")
      .maybeSingle();
    if (upErr) throw new Error(upErr.message);

    return NextResponse.json({ transaction: inserted, booking: updatedBooking }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to convert booking";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
