import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-server";
import { logTransactionAudit } from "@/lib/transaction-audit";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

/**
 * PATCH /api/transactions/:id/invoice
 * Admin-only: update the invoice number on any transaction.
 * Validates uniqueness within the same year, then logs the change.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminResult = await requireAdmin();
  if (adminResult instanceof NextResponse) return adminResult;
  const appUser = adminResult;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const newInvoice = typeof body.invoiceNumber === "string" ? body.invoiceNumber.trim() : "";

  if (!newInvoice) {
    return NextResponse.json({ error: "Invoice number is required" }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();

  // Fetch the current transaction.
  const { data: tx, error: txErr } = await supabase
    .schema("gls")
    .from("transactions")
    .select("id,invoice_number,date")
    .eq("id", id)
    .single();

  if (txErr || !tx) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  const oldInvoice = tx.invoice_number as string | null;

  if (oldInvoice === newInvoice) {
    return NextResponse.json({ message: "No change" });
  }

  // Check uniqueness within the same year.
  const year = tx.date ? (tx.date as string).slice(0, 4) : new Date().getFullYear().toString();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const { count } = await supabase
    .schema("gls")
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("invoice_number", newInvoice)
    .gte("date", yearStart)
    .lte("date", yearEnd)
    .neq("id", id);

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `Invoice ${newInvoice} already exists` },
      { status: 409 }
    );
  }

  // Update invoice number.
  const { error: updateErr } = await supabase
    .schema("gls")
    .from("transactions")
    .update({ invoice_number: newInvoice })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Write audit log.
  await logTransactionAudit({
    transactionId: id,
    action: "invoice_edited",
    performedBy: appUser.id,
    oldValues: { invoice_number: oldInvoice },
    newValues: { invoice_number: newInvoice },
  });

  return NextResponse.json({ invoiceNumber: newInvoice });
}
