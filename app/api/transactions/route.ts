import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import { logTransactionAudit } from "@/lib/transaction-audit";
import { initialStatusForRole } from "@/lib/transaction-permissions";
import { rebuildStockLedgerFromDate } from "@/lib/transactions-service";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { checkWacColumnsAvailable } from "@/lib/wac-columns";
import { persistWacRecalculation } from "@/lib/wac-persist";

export async function POST(req: Request) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  try {
    const body = await req.json().catch(() => null);
    const clientId = typeof body?.clientId === "string" ? body.clientId : null;
    const type = body?.type === "BUY" || body?.type === "SELL" ? body.type : null;
    const date = typeof body?.date === "string" ? body.date : null;
    const invoiceNumber =
      typeof body?.invoiceNumber === "string" ? body.invoiceNumber : null;
    const weightGrams = typeof body?.weightGrams === "number" ? body.weightGrams : null;
    const ratePerGram = typeof body?.ratePerGram === "number" ? body.ratePerGram : null;
    const vatPercent = typeof body?.vatPercent === "number" ? body.vatPercent : 0;
    const notes = typeof body?.notes === "string" ? body.notes.trim() || null : null;
    const rawMode = body?.transactionMode;
    const transactionMode =
      rawMode === "cash" && user.role === "ADMIN" ? "cash" : "official";

    if (!clientId || !type || !date || !invoiceNumber || !weightGrams || !ratePerGram) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const status = initialStatusForRole(user.role);
    const amountThb = weightGrams * ratePerGram;
    const now = status === "approved" ? new Date().toISOString() : null;

    const supabase = createSupabaseServiceClient() as any;
    const { data: inserted, error } = await supabase
      .from("transactions")
      .insert({
        client_id: clientId,
        type,
        date,
        invoice_number: invoiceNumber,
        weight_grams: weightGrams,
        rate_per_gram: ratePerGram,
        amount_thb: amountThb,
        vat_percent: vatPercent,
        notes,
        status,
        transaction_mode: transactionMode,
        created_by: user.id,
        approved_by: status === "approved" ? user.id : null,
        approved_at: now,
      })
      .select(
        "id,client_id,date,type,invoice_number,weight_grams,rate_per_gram,amount_thb,vat_percent,notes,status,transaction_mode,created_by,approved_by,approved_at,rejection_reason"
      )
      .single();

    if (error) throw new Error(error.message);

    if (status === "approved") {
      await rebuildStockLedgerFromDate(supabase, date);
      const hasColumns = await checkWacColumnsAvailable(supabase as never);
      if (hasColumns) {
        await persistWacRecalculation(supabase as never, {
          fromDate: date,
          fromId: inserted.id,
        });
      }
    }

    await logTransactionAudit({
      transactionId: inserted.id,
      action: "created",
      performedBy: user.id,
      newValues: inserted as Record<string, unknown>,
    });

    return NextResponse.json({ transaction: inserted }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Create failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
