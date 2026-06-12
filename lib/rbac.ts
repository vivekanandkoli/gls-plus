export type AppRole = "admin" | "user";

export type TransactionStatus = "pending" | "approved" | "rejected";

export type AuditAction =
  | "created"
  | "edited"
  | "approved"
  | "rejected"
  | "deleted"
  | "resubmitted"
  | "invoice_edited";

export interface AppUser {
  id: number;
  authId: string;
  email: string;
  role: AppRole;
  isActive: boolean;
  createdAt: string;
}

export interface TransactionRecord {
  id: string;
  client_id: string;
  date: string;
  type: "BUY" | "SELL";
  invoice_number: string | null;
  weight_grams: number | null;
  rate_per_gram: number | null;
  amount_thb: number | null;
  vat_percent: number | null;
  notes: string | null;
  status: TransactionStatus;
  created_by: number | null;
  approved_by: number | null;
  approved_at: string | null;
  rejection_reason: string | null;
}

export function isAdmin(user: Pick<AppUser, "role"> | null | undefined): boolean {
  return user?.role === "admin";
}

export const RATE_DEVIATION_THRESHOLD_PCT = 15;

/** Flag pending SELL rows where rate deviates from current WAC by more than threshold. */
export function isRateDeviationAlert(
  type: "BUY" | "SELL",
  ratePerGram: number | null | undefined,
  currentWac: number,
  thresholdPct = RATE_DEVIATION_THRESHOLD_PCT
): boolean {
  if (type !== "SELL" || !ratePerGram || ratePerGram <= 0 || currentWac <= 0) return false;
  const deviationPct = (Math.abs(ratePerGram - currentWac) / currentWac) * 100;
  return deviationPct > thresholdPct;
}
