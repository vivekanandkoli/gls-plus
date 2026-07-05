/**
 * Deals service — core business logic for the deals table.
 * One deal = one buy + one sell, same weight, same day.
 */

import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { logTransactionAudit } from "@/lib/transaction-audit";
import type { AppUser, TransactionStatus } from "@/lib/rbac";
import { isAdmin } from "@/lib/rbac";
import { computeDealsWacPl } from "@/lib/wac-fetch";

export type PaymentMode = "cash" | "bank" | "qr" | "cheque";

export interface DealRecord {
  id: number;
  date: string;
  weight_gm: number;
  buy_client_id: string | null;
  buy_rate: number;
  buy_amount: number | null;
  sell_client_id: string | null;
  sell_rate: number;
  sell_amount: number | null;
  trading_profit: number | null;
  profit_pct: number | null;
  buy_invoice: string;
  sell_invoice: string;
  payment_mode: PaymentMode;
  is_cash: boolean;
  wac_at_sale: number | null;
  cost_of_sale: number | null;
  wac_profit_loss: number | null;
  status: TransactionStatus;
  rejection_reason: string | null;
  notes: string | null;
  created_by: number | null;
  approved_by: number | null;
  approved_at: string | null;
  created_at: string;
}

const DEAL_SELECT = `
  id,date,weight_gm,
  buy_client_id,buy_rate,buy_amount,
  sell_client_id,sell_rate,sell_amount,
  trading_profit,profit_pct,
  buy_invoice,sell_invoice,payment_mode,is_cash,
  wac_at_sale,cost_of_sale,wac_profit_loss,
  status,rejection_reason,notes,
  created_by,approved_by,approved_at,created_at
`.trim();

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

// ── Invoice numbering ─────────────────────────────────────────────────────────

/**
 * Atomically increment and return the next counter for (date, type).
 * Uses upsert so the row is created on first use.
 */
export async function nextInvoiceCounter(
  supabase: ServiceClient,
  date: string,
  type: "buy" | "sell" | "cash"
): Promise<number> {
  // Upsert counter row then increment
  const { error: upsertErr } = await (supabase as any)
    .from("invoice_counters")
    .upsert({ date, type, counter: 0 }, { onConflict: "date,type", ignoreDuplicates: true });
  if (upsertErr) throw new Error(upsertErr.message);

  const { data, error } = await (supabase as any).rpc("increment_invoice_counter", {
    p_date: date,
    p_type: type,
  });
  if (error) {
    // Fallback: count existing deals for same day + type
    return await countFallbackInvoice(supabase, date, type);
  }
  return data as number;
}

async function countFallbackInvoice(
  supabase: ServiceClient,
  date: string,
  type: "buy" | "sell" | "cash"
): Promise<number> {
  const col = type === "cash" ? "buy_invoice" : type === "buy" ? "buy_invoice" : "sell_invoice";
  const prefix = type === "cash" ? `CASH-${date.replace(/-/g, "")}-` : type === "buy" ? `IV-${date.replace(/-/g, "")}-` : `UP-${date.replace(/-/g, "")}-`;
  const { count } = await (supabase as any)
    .from("deals")
    .select(col, { count: "exact", head: true })
    .ilike(col, `${prefix}%`);
  return ((count as number) ?? 0) + 1;
}

function pad3(n: number) {
  return String(n).padStart(3, "0");
}

/**
 * Generate buy + sell invoice numbers for a new deal.
 * Cash deals get a single CASH-YYYYMMDD-NNN number used for both invoices.
 */
export async function generateDealInvoices(
  supabase: ServiceClient,
  date: string,
  paymentMode: PaymentMode
): Promise<{ buyInvoice: string; sellInvoice: string }> {
  const day = date.replace(/-/g, ""); // YYYYMMDD

  if (paymentMode === "cash") {
    const n = await countFallbackInvoice(supabase, date, "cash");
    const invoice = `CASH-${day}-${pad3(n)}`;
    return { buyInvoice: invoice, sellInvoice: invoice };
  }

  // Official: IV-YYYYMMDD-NNN (buy) + UP-YYYYMMDD-NNN (sell), same sequence number
  const buyN = await countFallbackInvoice(supabase, date, "buy");
  const buyInvoice = `IV-${day}-${pad3(buyN)}`;
  const sellInvoice = `UP-${day}-${pad3(buyN)}`;
  return { buyInvoice, sellInvoice };
}

// ── Computed fields ───────────────────────────────────────────────────────────

export function computeDealFields(weightGm: number, buyRate: number, sellRate: number) {
  const buyAmount = Math.round(weightGm * buyRate * 100) / 100;
  const sellAmount = Math.round(weightGm * sellRate * 100) / 100;
  const tradingProfit = Math.round((sellAmount - buyAmount) * 100) / 100;
  const profitPct = buyAmount > 0 ? Math.round((tradingProfit / buyAmount) * 10000) / 100 : 0;
  return { buyAmount, sellAmount, tradingProfit, profitPct };
}

// ── WAC persistence ───────────────────────────────────────────────────────────

/**
 * Recompute WAC P&L for ALL approved non-cash deals and write the results back.
 *
 * Called after:
 *   • approveDeal  — newly approved deal joins the WAC chain; all subsequent deals shift
 *   • createDeal   — when admin creates (immediately approved); same as above
 *   • deleteDeal   — approved non-cash deal removed; all subsequent deals shift
 *
 * Cash deals are never touched (computeDealsWacPl filters them out).
 * The full recalculation is intentional — a single new approval can shift every
 * downstream WAC value, so a partial update would leave stale data.
 */
async function recalculateDealsWac(supabase: ServiceClient): Promise<void> {
  const plMap = await computeDealsWacPl(supabase as any);
  if (plMap.size === 0) return;

  // Parallel updates — each is a targeted UPDATE … WHERE id = ?
  await Promise.all(
    Array.from(plMap.entries()).map(([id, vals]) =>
      (supabase as any)
        .from("deals")
        .update({
          wac_at_sale: vals.wacAtSale,
          cost_of_sale: vals.costOfSale,
          wac_profit_loss: vals.wacProfitLoss,
        })
        .eq("id", id)
    )
  );
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function fetchDeal(
  supabase: ServiceClient,
  id: number
): Promise<DealRecord | null> {
  const { data, error } = await (supabase as any)
    .from("deals")
    .select(DEAL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DealRecord | null) ?? null;
}

export interface CreateDealInput {
  date: string;
  weightGm: number;
  buyClientId: string | null;
  buyRate: number;
  sellClientId: string | null;
  sellRate: number;
  paymentMode: PaymentMode;
  notes?: string | null;
}

export async function createDeal(
  input: CreateDealInput,
  user: AppUser
): Promise<DealRecord> {
  const supabase = createSupabaseServiceClient();
  const status: TransactionStatus = isAdmin(user) ? "approved" : "pending";
  const now = status === "approved" ? new Date().toISOString() : null;

  const { buyInvoice, sellInvoice } = await generateDealInvoices(
    supabase,
    input.date,
    input.paymentMode
  );

  const { buyAmount, sellAmount, tradingProfit, profitPct } = computeDealFields(
    input.weightGm,
    input.buyRate,
    input.sellRate
  );

  const { data, error } = await (supabase as any)
    .from("deals")
    .insert({
      date: input.date,
      weight_gm: input.weightGm,
      buy_client_id: input.buyClientId,
      buy_rate: input.buyRate,
      buy_amount: buyAmount,
      sell_client_id: input.sellClientId,
      sell_rate: input.sellRate,
      sell_amount: sellAmount,
      trading_profit: tradingProfit,
      profit_pct: profitPct,
      buy_invoice: buyInvoice,
      sell_invoice: sellInvoice,
      payment_mode: input.paymentMode,
      notes: input.notes?.trim() || null,
      status,
      created_by: user.id,
      approved_by: status === "approved" ? user.id : null,
      approved_at: now,
    })
    .select(DEAL_SELECT)
    .single();

  if (error) throw new Error(error.message);

  await logTransactionAudit({
    transactionId: String(data.id),
    action: "created",
    performedBy: user.id,
    newValues: data as Record<string, unknown>,
  });

  // Admin-created deals are immediately approved — compute WAC now.
  if (status === "approved" && !data.is_cash) {
    await recalculateDealsWac(supabase);
    const fresh = await fetchDeal(supabase, data.id);
    return fresh ?? (data as DealRecord);
  }

  return data as DealRecord;
}

export async function approveDeal(dealId: number, admin: AppUser): Promise<DealRecord> {
  const supabase = createSupabaseServiceClient();
  const deal = await fetchDeal(supabase, dealId);
  if (!deal) throw new Error("Deal not found");
  if (deal.status !== "pending") throw new Error("Only pending deals can be approved");

  const now = new Date().toISOString();
  const { data, error } = await (supabase as any)
    .from("deals")
    .update({
      status: "approved",
      approved_by: admin.id,
      approved_at: now,
      rejection_reason: null,
    })
    .eq("id", dealId)
    .select(DEAL_SELECT)
    .single();

  if (error) throw new Error(error.message);

  await logTransactionAudit({
    transactionId: String(dealId),
    action: "approved",
    performedBy: admin.id,
    oldValues: { status: "pending" },
    newValues: { status: "approved", approved_by: admin.id, approved_at: now },
  });

  // For non-cash deals: compute WAC for this deal and all subsequent ones.
  // The deal is now in the approved set so fetchDealsForWac already includes it.
  if (!deal.is_cash) {
    await recalculateDealsWac(supabase);
    const fresh = await fetchDeal(supabase, dealId);
    return fresh ?? (data as DealRecord);
  }

  return data as DealRecord;
}

export async function rejectDeal(
  dealId: number,
  admin: AppUser,
  reason?: string | null
): Promise<DealRecord> {
  const supabase = createSupabaseServiceClient();
  const deal = await fetchDeal(supabase, dealId);
  if (!deal) throw new Error("Deal not found");
  if (deal.status !== "pending") throw new Error("Only pending deals can be rejected");

  const trimmedReason = reason?.trim() || null;
  const { data, error } = await (supabase as any)
    .from("deals")
    .update({
      status: "rejected",
      approved_by: admin.id,
      approved_at: new Date().toISOString(),
      rejection_reason: trimmedReason,
    })
    .eq("id", dealId)
    .select(DEAL_SELECT)
    .single();

  if (error) throw new Error(error.message);

  await logTransactionAudit({
    transactionId: String(dealId),
    action: "rejected",
    performedBy: admin.id,
    oldValues: { status: "pending" },
    newValues: { status: "rejected", rejection_reason: trimmedReason },
  });

  return data as DealRecord;
}

export async function deleteDeal(dealId: number, user: AppUser): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const deal = await fetchDeal(supabase, dealId);
  if (!deal) throw new Error("Deal not found");

  // Capture before delete — needed to decide whether to recalculate WAC.
  const wasApprovedOfficial = deal.status === "approved" && !deal.is_cash;

  const { error } = await (supabase as any).from("deals").delete().eq("id", dealId);
  if (error) throw new Error(error.message);

  await logTransactionAudit({
    transactionId: String(dealId),
    action: "deleted",
    performedBy: user.id,
    oldValues: deal as unknown as Record<string, unknown>,
    newValues: null,
  });

  // Removing an approved non-cash deal shifts all subsequent WAC values.
  // The deal is already gone so fetchDealsForWac correctly excludes it.
  if (wasApprovedOfficial) {
    await recalculateDealsWac(supabase);
  }
}
