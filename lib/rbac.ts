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

/** Two-ledger discriminator. Unofficial = the real vault (cash-only). */
export type Book = "official" | "unofficial";

/** Payment mode. Unofficial book is constrained to `cash`. */
export type PaymentMode = "bank" | "qr" | "cheque" | "cash";

export interface TransactionRecord {
  id: string;
  book: Book;
  client_id: string;
  date: string;
  type: "BUY" | "SELL";
  invoice_number: string | null;
  weight_grams: number | null;
  rate_per_gram: number | null;
  amount_thb: number | null;
  payment_mode: PaymentMode;
  vat_percent: number | null;
  notes: string | null;
  status: TransactionStatus;
  /** Persisted WAC results (SELL only, set on approval). */
  wac_at_sale: number | null;
  cost_of_sale: number | null;
  profit_loss: number | null;
  /** Linked declaration (model B): official row → its unofficial source. */
  declared_from_id: string | null;
  paired_txn_id: string | null;
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
