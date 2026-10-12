import { createSupabaseServiceClient } from "@/lib/supabase-service";
import type { AuditAction } from "@/lib/rbac";

/**
 * Generic change-log writer. Records who did what to which entity, with the
 * before/after values, into gls.activity_log. Never throws — audit failures
 * must not break the operation they describe.
 */
export async function logAudit(opts: {
  entityType: string;
  entityId: string | number | null;
  action: string;
  performedBy: number | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  /** Only for transactions, to keep the existing FK column populated. */
  transactionId?: string | null;
}): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase.from("activity_log").insert({
    entity_type: opts.entityType,
    entity_id: opts.entityId != null ? String(opts.entityId) : null,
    transaction_id: opts.transactionId ?? null,
    action: opts.action,
    performed_by: opts.performedBy,
    old_values: opts.oldValues ?? null,
    new_values: opts.newValues ?? null,
  });
  if (error) {
    console.warn("activity_log insert failed:", error.message);
  }
}

/** Backwards-compatible helper for transaction audit entries. */
export async function logTransactionAudit(opts: {
  transactionId: string | null;
  action: AuditAction;
  performedBy: number | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}): Promise<void> {
  await logAudit({
    entityType: "transaction",
    entityId: opts.transactionId,
    transactionId: opts.transactionId,
    action: opts.action,
    performedBy: opts.performedBy,
    oldValues: opts.oldValues,
    newValues: opts.newValues,
  });
}
