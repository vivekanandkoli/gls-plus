import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { logTransactionAudit } from "@/lib/transaction-audit";
import type { AppUser, TransactionRecord } from "@/lib/rbac";
import { persistWacRecalculation } from "@/lib/wac-persist";
import { checkWacColumnsAvailable } from "@/lib/wac-columns";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

async function fetchTransaction(
  supabase: ServiceClient,
  id: string
): Promise<TransactionRecord | null> {
  const { data, error } = await (supabase as any)
    .from("transactions")
    .select(
      "id,client_id,date,type,invoice_number,weight_grams,rate_per_gram,amount_thb,vat_percent,notes,status,created_by,approved_by,approved_at,rejection_reason"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as TransactionRecord | null) ?? null;
}

async function getLatestStockBalance(supabase: ServiceClient): Promise<number> {
  const { data } = await (supabase as any)
    .from("stock_ledger")
    .select("balance_grams")
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return typeof data?.balance_grams === "number" ? data.balance_grams : 0;
}

/**
 * Rebuild stock_ledger entries for all approved transactions from `fromDate`
 * onwards. This handles past-dated approvals correctly: it removes stale entries,
 * computes the running balance from the last ledger row before `fromDate`, then
 * re-inserts each approved transaction in chronological (date, created_at, id) order.
 *
 * Manual adjustment rows (transaction_id IS NULL) are left untouched.
 */
export async function rebuildStockLedgerFromDate(
  supabase: ServiceClient,
  fromDate: string
): Promise<void> {
  // 1. Delete transaction-linked ledger entries at or after fromDate.
  const { error: delErr } = await (supabase as any)
    .from("stock_ledger")
    .delete()
    .not("transaction_id", "is", null)
    .gte("date", fromDate);
  if (delErr) throw new Error(delErr.message);

  // 2. Starting balance = latest ledger entry before fromDate (includes manual adjustments).
  const { data: prior } = await (supabase as any)
    .from("stock_ledger")
    .select("balance_grams")
    .lt("date", fromDate)
    .order("date", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  let runningBalance: number =
    typeof prior?.balance_grams === "number" ? prior.balance_grams : 0;

  // 3. Fetch all approved transactions from fromDate onwards, in WAC chain order.
  const { data: txsFromDate, error: fetchErr } = await (supabase as any)
    .from("transactions")
    .select("id,client_id,date,type,weight_grams,created_at")
    .eq("status", "approved")
    .gte("date", fromDate)
    .order("date", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (fetchErr) throw new Error(fetchErr.message);

  // 4. Re-insert in order with correct running balance.
  const rows: Record<string, unknown>[] = [];
  for (const tx of txsFromDate ?? []) {
    const weight = typeof tx.weight_grams === "number" ? tx.weight_grams : 0;
    const delta = tx.type === "BUY" ? weight : -weight;
    runningBalance += delta;
    rows.push({
      transaction_id: tx.id,
      client_id: tx.client_id,
      date: tx.date,
      delta_grams: delta,
      balance_grams: runningBalance,
      recorded_at: tx.date,
    });
  }

  if (rows.length > 0) {
    const { error: insErr } = await (supabase as any).from("stock_ledger").insert(rows);
    if (insErr) throw new Error(insErr.message);
  }
}

/** @deprecated Use rebuildStockLedgerFromDate instead for correctness with past-dated approvals. */
export async function applyStockLedgerForTransaction(
  supabase: ServiceClient,
  tx: Pick<TransactionRecord, "id" | "client_id" | "date" | "type" | "weight_grams">
): Promise<void> {
  await rebuildStockLedgerFromDate(supabase, tx.date);
}

export async function removeStockLedgerForTransaction(
  supabase: ServiceClient,
  transactionId: string
): Promise<void> {
  await (supabase as any).from("stock_ledger").delete().eq("transaction_id", transactionId);
}

export async function approveTransaction(
  txId: string,
  admin: AppUser
): Promise<TransactionRecord> {
  const supabase = createSupabaseServiceClient();
  const tx = await fetchTransaction(supabase, txId);
  if (!tx) throw new Error("Transaction not found");
  if (tx.status !== "pending") throw new Error("Only pending transactions can be approved");

  const now = new Date().toISOString();
  const { data: updated, error } = await (supabase as any)
    .from("transactions")
    .update({
      status: "approved",
      approved_by: admin.id,
      approved_at: now,
      rejection_reason: null,
    })
    .eq("id", txId)
    .select(
      "id,client_id,date,type,invoice_number,weight_grams,rate_per_gram,amount_thb,vat_percent,notes,status,created_by,approved_by,approved_at,rejection_reason"
    )
    .single();

  if (error) throw new Error(error.message);

  // Rebuild ledger from this transaction's date so past-dated approvals are correct.
  await rebuildStockLedgerFromDate(supabase, tx.date);

  const hasColumns = await checkWacColumnsAvailable(supabase as never);
  if (hasColumns) {
    await persistWacRecalculation(supabase as never, {
      fromDate: tx.date,
      fromId: tx.id,
    });
  }

  await logTransactionAudit({
    transactionId: txId,
    action: "approved",
    performedBy: admin.id,
    oldValues: { status: tx.status },
    newValues: { status: "approved", approved_by: admin.id, approved_at: now },
  });

  return updated as TransactionRecord;
}

export async function rejectTransaction(
  txId: string,
  admin: AppUser,
  reason?: string | null
): Promise<TransactionRecord> {
  const supabase = createSupabaseServiceClient();
  const tx = await fetchTransaction(supabase, txId);
  if (!tx) throw new Error("Transaction not found");
  if (tx.status !== "pending") throw new Error("Only pending transactions can be rejected");

  const trimmedReason = reason?.trim() || null;
  const { data: updated, error } = await (supabase as any)
    .from("transactions")
    .update({
      status: "rejected",
      approved_by: admin.id,
      approved_at: new Date().toISOString(),
      rejection_reason: trimmedReason,
    })
    .eq("id", txId)
    .select(
      "id,client_id,date,type,invoice_number,weight_grams,rate_per_gram,amount_thb,vat_percent,notes,status,created_by,approved_by,approved_at,rejection_reason"
    )
    .single();

  if (error) throw new Error(error.message);

  await logTransactionAudit({
    transactionId: txId,
    action: "rejected",
    performedBy: admin.id,
    oldValues: { status: tx.status },
    newValues: { status: "rejected", rejection_reason: trimmedReason },
  });

  return updated as TransactionRecord;
}

export async function deleteTransactionWithSideEffects(
  txId: string,
  user: AppUser
): Promise<{ date: string; id: string }> {
  const supabase = createSupabaseServiceClient();
  const tx = await fetchTransaction(supabase, txId);
  if (!tx) throw new Error("Transaction not found");

  const wasApproved = tx.status === "approved";
  const txDate = tx.date;

  // Remove this transaction's ledger row before deleting the transaction record.
  await removeStockLedgerForTransaction(supabase, txId);
  const { error } = await (supabase as any).from("transactions").delete().eq("id", txId);
  if (error) throw new Error(error.message);

  if (wasApproved) {
    // Rebuild ledger from the deleted tx's date so all subsequent balances stay correct.
    await rebuildStockLedgerFromDate(supabase, txDate);

    const hasColumns = await checkWacColumnsAvailable(supabase as never);
    if (hasColumns) {
      await persistWacRecalculation(supabase as never, {
        fromDate: txDate,
        fromId: txId,
      });
    }
  }

  await logTransactionAudit({
    transactionId: txId,
    action: "deleted",
    performedBy: user.id,
    oldValues: tx as unknown as Record<string, unknown>,
    newValues: null,
  });

  return { date: tx.date, id: tx.id };
}
