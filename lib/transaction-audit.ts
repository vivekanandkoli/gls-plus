import { createSupabaseServiceClient } from "@/lib/supabase-service";
import type { AuditAction } from "@/lib/rbac";

export async function logTransactionAudit(opts: {
  transactionId: string | null;
  action: AuditAction;
  performedBy: number | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}): Promise<void> {
  const supabase = createSupabaseServiceClient();

  const { error } = await supabase.from("transaction_audit_log").insert({
    transaction_id: opts.transactionId,
    action: opts.action,
    performed_by: opts.performedBy,
    old_values: opts.oldValues ?? null,
    new_values: opts.newValues ?? null,
  });

  if (error) {
    console.warn("transaction_audit_log insert failed:", error.message);
  }
}
