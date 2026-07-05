/** Writes to gls.activity_log — the two-ledger model's audit trail. */

import { createSupabaseServiceClient } from "@/lib/supabase-service";

export type AuditAction =
  | "created"
  | "edited"
  | "approved"
  | "rejected"
  | "deleted"
  | "resubmitted"
  | "invoice_edited"
  | "stock_adjusted";

export async function logActivity(params: {
  transactionId?: string | null;
  action: AuditAction;
  performedBy: number | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const supabase = createSupabaseServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("activity_log").insert({
      transaction_id: params.transactionId ?? null,
      action: params.action,
      performed_by: params.performedBy,
      old_values: params.oldValues ?? null,
      new_values: params.newValues ?? null,
    });
  } catch (e) {
    // Audit logging must never break the main operation.
    console.error("activity_log insert failed:", e);
  }
}
