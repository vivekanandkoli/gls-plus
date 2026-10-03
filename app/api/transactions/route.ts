import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import { nextInvoiceNumber } from "@/lib/invoice-number";
import { logTransactionAudit } from "@/lib/transaction-audit";
import { notifyAdmins } from "@/lib/push";
import { isAdmin, type Book, type PaymentMode } from "@/lib/rbac";
import { initialStatusForRole } from "@/lib/transaction-permissions";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { persistBookWac, yearOf } from "@/lib/wac-book";

const SELECT =
  "id,book,client_id,date,type,invoice_number,weight_grams,rate_per_gram,amount_thb,payment_mode,vat_percent,notes,status,wac_at_sale,cost_of_sale,profit_loss,declared_from_id,paired_txn_id,created_by,approved_by,approved_at,rejection_reason";

const PAYMENT_MODES: PaymentMode[] = ["bank", "qr", "cheque", "cash"];
const STATUSES = ["pending", "approved", "rejected"];

/** Create a transaction in either ledger. Admins post approved rows, users post pending. */
export async function POST(req: Request) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  try {
    const body = await req.json().catch(() => ({}));

    const book: Book = body.book === "unofficial" ? "unofficial" : "official";
    const type = body.type === "BUY" || body.type === "SELL" ? body.type : null;
    const date = typeof body.date === "string" && body.date ? body.date : null;
    const clientId =
      typeof body.clientId === "string" && body.clientId ? body.clientId : null;
    const weight = Number(body.weightGrams);
    const rate = Number(body.ratePerGram);

    if (!type || !date || !Number.isFinite(weight) || weight <= 0) {
      return NextResponse.json(
        { error: "Book, type, date and a positive weight are required" },
        { status: 400 }
      );
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      return NextResponse.json({ error: "Rate must be greater than zero" }, { status: 400 });
    }

    const amount =
      body.amountThb != null && body.amountThb !== ""
        ? Number(body.amountThb)
        : weight * rate;

    // Unofficial book is cash-only (DB constraint).
    let paymentMode: PaymentMode = PAYMENT_MODES.includes(body.paymentMode)
      ? body.paymentMode
      : "bank";
    if (book === "unofficial") paymentMode = "cash";

    const vat =
      book === "official" && body.vatPercent != null && body.vatPercent !== ""
        ? Number(body.vatPercent)
        : null;
    const notes = typeof body.notes === "string" ? body.notes.trim() || null : null;

    // Non-admins always start pending, whatever they post.
    const status =
      isAdmin(user) && STATUSES.includes(body.status)
        ? body.status
        : initialStatusForRole(user.role);
    const approvedAt = status === "approved" ? new Date().toISOString() : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;

    // Numbering is the server's job; a caller-supplied number still wins.
    const manualInvoice =
      typeof body.invoiceNumber === "string" ? body.invoiceNumber.trim() : "";
    const invoiceNumber = manualInvoice || (await nextInvoiceNumber(sb, book, type, date));

    const { data: inserted, error } = await sb
      .from("transactions")
      .insert({
        book,
        type,
        date,
        client_id: clientId,
        weight_grams: weight,
        rate_per_gram: rate,
        amount_thb: amount,
        payment_mode: paymentMode,
        vat_percent: vat,
        invoice_number: invoiceNumber,
        notes,
        status,
        created_by: user.id,
        approved_by: status === "approved" ? user.id : null,
        approved_at: approvedAt,
      })
      .select(SELECT)
      .single();

    if (error) throw new Error(error.message);

    // Only approved rows take part in the WAC chain.
    if (status === "approved") {
      await persistBookWac(sb, book, yearOf(date));
    }

    await logTransactionAudit({
      transactionId: inserted.id,
      action: "created",
      performedBy: user.id,
      newValues: inserted as Record<string, unknown>,
    });

    // Alert admins when something lands in the approval queue.
    if (status === "pending") {
      const label = `${type} ${weight}g${inserted.invoice_number ? ` · ${inserted.invoice_number}` : ""}`;
      await notifyAdmins({
        title: "Transaction needs approval",
        body: `${label} is awaiting your approval.`,
        url: `/transactions/${inserted.id}`,
      });
    }

    return NextResponse.json({ transaction: inserted }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Create failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
