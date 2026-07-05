/**
 * Two-ledger transactions service. Every gold BUY/SELL lives in exactly one
 * book (official | unofficial). Staff entries are pending; admin entries are
 * auto-approved. Approving/creating(admin)/deleting an approved row recomputes
 * that book's WAC chain.
 */

import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { isAdmin, type AppUser } from "@/lib/rbac";
import type { Book } from "@/lib/opening-balances";
import { generateInvoiceNumber } from "@/lib/invoice-numbers";
import { recalcBookWac } from "@/lib/book-wac";
import { logActivity } from "@/lib/audit-log";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

export type TxType = "BUY" | "SELL";
export type PaymentMode = "bank" | "qr" | "cheque" | "cash";
export type TxnStatus = "pending" | "approved" | "rejected";

export interface TxnRecord {
  id: string;
  book: Book;
  date: string;
  type: TxType;
  client_id: string | null;
  weight_grams: number;
  rate_per_gram: number;
  amount_thb: number;
  payment_mode: PaymentMode;
  vat_percent: number | null;
  invoice_number: string | null;
  notes: string | null;
  status: TxnStatus;
  wac_at_sale: number | null;
  cost_of_sale: number | null;
  profit_loss: number | null;
  paired_txn_id: string | null;
  created_by: number | null;
  approved_by: number | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

const SELECT =
  "id,book,date,type,client_id,weight_grams,rate_per_gram,amount_thb,payment_mode," +
  "vat_percent,invoice_number,notes,status,wac_at_sale,cost_of_sale,profit_loss," +
  "paired_txn_id,created_by,approved_by,approved_at,rejection_reason,created_at";

export async function fetchTransaction(
  supabase: ServiceClient,
  id: string
): Promise<TxnRecord | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("transactions")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as TxnRecord | null) ?? null;
}

export interface CreateTxnInput {
  book: Book;
  date: string;
  type: TxType;
  clientId: string | null;
  weightGrams: number;
  ratePerGram: number;
  paymentMode: PaymentMode;
  vatPercent?: number | null;
  notes?: string | null;
  pairedTxnId?: string | null;
}

export async function createTransaction(
  input: CreateTxnInput,
  user: AppUser
): Promise<TxnRecord> {
  const supabase = createSupabaseServiceClient();

  // Unofficial book is cash-only; official may use any mode.
  const paymentMode: PaymentMode = input.book === "unofficial" ? "cash" : input.paymentMode;
  const amount = Math.round(input.weightGrams * input.ratePerGram * 100) / 100;
  const invoice = await generateInvoiceNumber(supabase, input.book, input.type, input.date);

  const status: TxnStatus = isAdmin(user) ? "approved" : "pending";
  const approvedAt = status === "approved" ? new Date().toISOString() : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("transactions")
    .insert({
      book: input.book,
      date: input.date,
      type: input.type,
      client_id: input.clientId,
      weight_grams: input.weightGrams,
      rate_per_gram: input.ratePerGram,
      amount_thb: amount,
      payment_mode: paymentMode,
      vat_percent: input.book === "official" ? input.vatPercent ?? null : null,
      invoice_number: invoice,
      notes: input.notes?.trim() || null,
      paired_txn_id: input.pairedTxnId ?? null,
      status,
      created_by: user.id,
      approved_by: status === "approved" ? user.id : null,
      approved_at: approvedAt,
    })
    .select(SELECT)
    .single();

  if (error) throw new Error(error.message);

  await logActivity({
    transactionId: data.id,
    action: "created",
    performedBy: user.id,
    newValues: data as Record<string, unknown>,
  });

  if (status === "approved") {
    await recalcBookWac(supabase, input.book);
    return (await fetchTransaction(supabase, data.id)) ?? (data as TxnRecord);
  }
  return data as TxnRecord;
}

export async function approveTransaction(id: string, admin: AppUser): Promise<TxnRecord> {
  const supabase = createSupabaseServiceClient();
  const tx = await fetchTransaction(supabase, id);
  if (!tx) throw new Error("Transaction not found");
  if (tx.status !== "pending") throw new Error("Only pending transactions can be approved");

  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("transactions")
    .update({ status: "approved", approved_by: admin.id, approved_at: now, rejection_reason: null })
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error) throw new Error(error.message);

  await recalcBookWac(supabase, tx.book);
  await logActivity({
    transactionId: id,
    action: "approved",
    performedBy: admin.id,
    oldValues: { status: "pending" },
    newValues: { status: "approved", approved_by: admin.id, approved_at: now },
  });

  return (await fetchTransaction(supabase, id)) ?? (data as TxnRecord);
}

export async function rejectTransaction(
  id: string,
  admin: AppUser,
  reason?: string | null
): Promise<TxnRecord> {
  const supabase = createSupabaseServiceClient();
  const tx = await fetchTransaction(supabase, id);
  if (!tx) throw new Error("Transaction not found");
  if (tx.status !== "pending") throw new Error("Only pending transactions can be rejected");

  const trimmed = reason?.trim() || null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("transactions")
    .update({
      status: "rejected",
      approved_by: admin.id,
      approved_at: new Date().toISOString(),
      rejection_reason: trimmed,
    })
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error) throw new Error(error.message);

  await logActivity({
    transactionId: id,
    action: "rejected",
    performedBy: admin.id,
    oldValues: { status: "pending" },
    newValues: { status: "rejected", rejection_reason: trimmed },
  });

  return data as TxnRecord;
}

export async function deleteTransaction(id: string, user: AppUser): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const tx = await fetchTransaction(supabase, id);
  if (!tx) throw new Error("Transaction not found");

  const wasApproved = tx.status === "approved";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("transactions").delete().eq("id", id);
  if (error) throw new Error(error.message);

  if (wasApproved) await recalcBookWac(supabase, tx.book);

  await logActivity({
    transactionId: id,
    action: "deleted",
    performedBy: user.id,
    oldValues: tx as unknown as Record<string, unknown>,
    newValues: null,
  });
}

export interface ListTxnOptions {
  book?: Book;
  status?: TxnStatus | "all";
  page?: number;
  pageSize?: number;
}

export async function listTransactions(opts: ListTxnOptions = {}): Promise<{
  transactions: TxnRecord[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const supabase = createSupabaseServiceClient();
  const page = Math.max(0, opts.page ?? 0);
  const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 50));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from("transactions")
    .select(SELECT, { count: "exact" })
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (opts.book) q = q.eq("book", opts.book);
  if (opts.status && opts.status !== "all") q = q.eq("status", opts.status);
  q = q.range(page * pageSize, page * pageSize + pageSize - 1);

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return { transactions: (data ?? []) as TxnRecord[], total: count ?? 0, page, pageSize };
}
