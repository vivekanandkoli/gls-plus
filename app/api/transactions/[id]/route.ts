import { NextResponse } from "next/server";

import { forbidden, requireAppUser } from "@/lib/auth-server";
import { logTransactionAudit } from "@/lib/transaction-audit";
import { isAdmin, type Book, type PaymentMode } from "@/lib/rbac";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { persistBookWac, yearOf } from "@/lib/wac-book";

type Ctx = { params: Promise<{ id: string }> };

const SELECT =
  "id,book,client_id,date,type,invoice_number,weight_grams,rate_per_gram,amount_thb,payment_mode,vat_percent,notes,status,wac_at_sale,cost_of_sale,profit_loss,declared_from_id,paired_txn_id,created_by,approved_by,approved_at,rejection_reason";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadTx(sb: any, id: string) {
  const { data, error } = await sb.from("transactions").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function withClientName(sb: any, tx: any) {
  if (!tx?.client_id) return { ...tx, client_name: null };
  const { data } = await sb.from("clients").select("name").eq("id", tx.client_id).maybeSingle();
  return { ...tx, client_name: data?.name ?? null };
}

// Recompute WAC for each distinct (book, year) touched by the change.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recompute(sb: any, pairs: { book: Book; year: number }[]) {
  const seen = new Set<string>();
  for (const { book, year } of pairs) {
    const key = `${book}:${year}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await persistBookWac(sb, book, year);
  }
}

const PAYMENT_MODES: PaymentMode[] = ["bank", "qr", "cheque", "cash"];
const STATUSES = ["pending", "approved", "rejected"];

/** GET one transaction (with client name) - for the detail/edit view. */
export async function GET(_req: Request, ctx: Ctx) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;
  try {
    const { id } = await ctx.params;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;
    const tx = await loadTx(sb, id);
    if (!tx) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    return NextResponse.json({ transaction: await withClientName(sb, tx) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Full edit. Admin may edit any field of any transaction (incl. reclassifying book). */
export async function PUT(req: Request, ctx: Ctx) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;
  try {
    const { id } = await ctx.params;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;
    const existing = await loadTx(sb, id);
    if (!existing) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

    if (!isAdmin(user)) {
      const ownPending = existing.status !== "approved" && existing.created_by === user.id;
      if (!ownPending) return forbidden("You can only edit your own pending transactions");
    }

    const body = await req.json().catch(() => ({}));
    const numOr = (v: unknown, fb: number | null) =>
      typeof v === "number" && !Number.isNaN(v) ? v : v != null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : fb;

    const book: Book = body.book === "official" || body.book === "unofficial" ? body.book : existing.book;
    const type = body.type === "BUY" || body.type === "SELL" ? body.type : existing.type;
    const date = typeof body.date === "string" && body.date ? body.date : existing.date;
    const clientId =
      body.clientId === null ? null : typeof body.clientId === "string" && body.clientId ? body.clientId : existing.client_id;
    const weight = numOr(body.weightGrams, existing.weight_grams) ?? 0;
    const rate = numOr(body.ratePerGram, existing.rate_per_gram) ?? 0;
    const amount = body.amountThb != null && body.amountThb !== "" ? Number(body.amountThb) : weight * rate;
    // Unofficial book is cash-only (DB constraint).
    let paymentMode: PaymentMode = PAYMENT_MODES.includes(body.paymentMode) ? body.paymentMode : existing.payment_mode;
    if (book === "unofficial") paymentMode = "cash";
    const vat = book === "official" ? numOr(body.vatPercent, existing.vat_percent) : null;
    const invoice =
      body.invoiceNumber === null
        ? null
        : typeof body.invoiceNumber === "string"
          ? body.invoiceNumber.trim() || null
          : existing.invoice_number;
    const notes =
      body.notes === null ? null : typeof body.notes === "string" ? body.notes.trim() || null : existing.notes;
    const status = STATUSES.includes(body.status) ? body.status : existing.status;

    const payload: Record<string, unknown> = {
      book,
      type,
      date,
      client_id: clientId,
      weight_grams: weight,
      rate_per_gram: rate,
      amount_thb: amount,
      payment_mode: paymentMode,
      vat_percent: vat,
      invoice_number: invoice,
      notes,
      status,
    };

    const { error } = await sb.from("transactions").update(payload).eq("id", id);
    if (error) throw new Error(error.message);

    // Recompute both the old and new (book, year) chains, then persist WAC.
    await recompute(sb, [
      { book: existing.book as Book, year: yearOf(existing.date) },
      { book, year: yearOf(date) },
    ]);

    const finalTx = await loadTx(sb, id);
    await logTransactionAudit({
      transactionId: id,
      action: "edited",
      performedBy: user.id,
      oldValues: existing,
      newValues: finalTx,
    });
    return NextResponse.json({ transaction: await withClientName(sb, finalTx) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Delete + recompute the affected book/year. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;
  try {
    const { id } = await ctx.params;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;
    const existing = await loadTx(sb, id);
    if (!existing) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

    if (!isAdmin(user)) {
      const ownPending = existing.status !== "approved" && existing.created_by === user.id;
      if (!ownPending) return forbidden("You can only delete your own pending transactions");
    }

    // Log before delete (FK is on-delete-set-null, so the log survives).
    await logTransactionAudit({
      transactionId: id,
      action: "deleted",
      performedBy: user.id,
      oldValues: existing,
      newValues: null,
    });

    const { error } = await sb.from("transactions").delete().eq("id", id);
    if (error) throw new Error(error.message);

    await recompute(sb, [{ book: existing.book as Book, year: yearOf(existing.date) }]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
