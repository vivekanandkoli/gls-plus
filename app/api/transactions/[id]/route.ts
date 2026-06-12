import { NextResponse } from "next/server";

import { forbidden, requireAppUser } from "@/lib/auth-server";
import { logTransactionAudit } from "@/lib/transaction-audit";
import {
  canDeleteTransaction,
  canEditTransaction,
} from "@/lib/transaction-permissions";
import type { TransactionRecord } from "@/lib/rbac";
import {
  deleteTransactionWithSideEffects,
  removeStockLedgerForTransaction,
} from "@/lib/transactions-service";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { checkWacColumnsAvailable } from "@/lib/wac-columns";
import { persistWacRecalculation, wacRecalcFromDate } from "@/lib/wac-persist";

type Ctx = { params: Promise<{ id: string }> };

async function loadTx(id: string): Promise<TransactionRecord | null> {
  const supabase = createSupabaseServiceClient() as any;
  const { data, error } = await supabase
    .from("transactions")
    .select(
      "id,client_id,date,type,invoice_number,weight_grams,rate_per_gram,amount_thb,vat_percent,notes,status,transaction_mode,created_by,approved_by,approved_at,rejection_reason"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as TransactionRecord | null;
}

export async function PUT(req: Request, ctx: Ctx) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  try {
    const { id } = await ctx.params;
    const existing = await loadTx(id);
    if (!existing) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }
    if (!canEditTransaction(user, existing)) {
      return forbidden(
        existing.status === "approved"
          ? "This transaction is approved and cannot be edited"
          : "You cannot edit this transaction"
      );
    }

    const body = await req.json().catch(() => null);
    const clientId = typeof body?.clientId === "string" ? body.clientId : existing.client_id;
    const type = body?.type === "BUY" || body?.type === "SELL" ? body.type : existing.type;
    const date = typeof body?.date === "string" ? body.date : existing.date;
    const weightGrams =
      typeof body?.weightGrams === "number" ? body.weightGrams : existing.weight_grams ?? 0;
    const ratePerGram =
      typeof body?.ratePerGram === "number" ? body.ratePerGram : existing.rate_per_gram ?? 0;
    const vatPercent =
      typeof body?.vatPercent === "number" ? body.vatPercent : existing.vat_percent ?? 0;
    const notes =
      typeof body?.notes === "string" ? body.notes.trim() || null : existing.notes;

    const amountThb = weightGrams * ratePerGram;
    const newStatus =
      user.role === "admin" && existing.status === "approved"
        ? "approved"
        : "pending";

    const supabase = createSupabaseServiceClient() as any;
    const updatePayload: Record<string, unknown> = {
      client_id: clientId,
      type,
      date,
      weight_grams: weightGrams,
      rate_per_gram: ratePerGram,
      amount_thb: amountThb,
      vat_percent: vatPercent,
      notes,
      status: newStatus,
      rejection_reason: newStatus === "pending" ? null : existing.rejection_reason,
      approved_by: newStatus === "pending" ? null : existing.approved_by,
      approved_at: newStatus === "pending" ? null : existing.approved_at,
    };

    const { data: updated, error } = await supabase
      .from("transactions")
      .update(updatePayload)
      .eq("id", id)
      .select(
        "id,client_id,date,type,invoice_number,weight_grams,rate_per_gram,amount_thb,vat_percent,notes,status,transaction_mode,created_by,approved_by,approved_at,rejection_reason"
      )
      .single();

    if (error) throw new Error(error.message);

    const wasApproved = existing.status === "approved";
    const isApproved = newStatus === "approved";

    if (wasApproved && isApproved) {
      const newDelta = type === "BUY" ? weightGrams : -weightGrams;
      const { data: ledger } = await supabase
        .from("stock_ledger")
        .select("id,delta_grams,balance_grams")
        .eq("transaction_id", id)
        .maybeSingle();

      if (ledger) {
        const oldDelta = typeof ledger.delta_grams === "number" ? ledger.delta_grams : 0;
        const deltaChange = newDelta - oldDelta;
        await supabase
          .from("stock_ledger")
          .update({
            delta_grams: newDelta,
            balance_grams: (ledger.balance_grams ?? 0) + deltaChange,
            date,
            recorded_at: date,
          })
          .eq("id", ledger.id);
      }

      const hasColumns = await checkWacColumnsAvailable(supabase as never);
      if (hasColumns) {
        await persistWacRecalculation(supabase as never, {
          fromDate: wacRecalcFromDate(existing.date, date),
          fromId: id,
        });
      }
    } else if (wasApproved && !isApproved) {
      await removeStockLedgerForTransaction(supabase, id);
      const hasColumns = await checkWacColumnsAvailable(supabase as never);
      if (hasColumns) {
        await persistWacRecalculation(supabase as never, {
          fromDate: existing.date,
          fromId: id,
        });
      }
    }

    await logTransactionAudit({
      transactionId: id,
      action: existing.status === "rejected" ? "resubmitted" : "edited",
      performedBy: user.id,
      oldValues: existing as unknown as Record<string, unknown>,
      newValues: updated as unknown as Record<string, unknown>,
    });

    return NextResponse.json({ transaction: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  try {
    const { id } = await ctx.params;
    const existing = await loadTx(id);
    if (!existing) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }
    if (!canDeleteTransaction(user, existing)) {
      return forbidden("You cannot delete this transaction");
    }

    const anchor = await deleteTransactionWithSideEffects(id, user);
    return NextResponse.json({ ok: true, anchor });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
