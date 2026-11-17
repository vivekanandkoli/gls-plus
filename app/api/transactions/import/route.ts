import { NextResponse } from "next/server";

import { forbidden, requireAppUser } from "@/lib/auth-server";
import { nextInvoiceNumber } from "@/lib/invoice-number";
import { logTransactionAudit } from "@/lib/transaction-audit";
import { isAdmin } from "@/lib/rbac";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { persistBookWac, yearOf } from "@/lib/wac-book";

/**
 * POST /api/transactions/import
 * Admin-only bulk import of OFFICIAL, already-approved transactions
 * (e.g. back-filling months that were only kept in the owner's spreadsheet).
 *
 * The caller resolves each row's client first (existing id, or a name to
 * create) so this endpoint never guesses. Everything is created in the
 * official book, approved, payment_mode=bank, vat=0 by default. BUY rows keep
 * the supplier invoice number from the sheet; SELL rows get the app's own
 * UP… serial so the issued-invoice sequence stays the app's.
 *
 * WAC is recomputed once per (book, year) touched, not per row.
 */

type ImportRow = {
  date?: unknown;
  type?: unknown;
  clientId?: unknown; // existing client id (preferred)
  newClientName?: unknown; // create this client if no clientId
  weightGrams?: unknown;
  ratePerGram?: unknown;
  amountThb?: unknown;
  invoiceNumber?: unknown; // used for BUY only
  paymentMode?: unknown;
  vatPercent?: unknown;
  notes?: unknown;
};

type RowResult = {
  index: number;
  ok: boolean;
  id?: string;
  invoiceNumber?: string | null;
  clientId?: string | null;
  error?: string;
};

const num = (v: unknown): number => Number(v);

export async function POST(req: Request) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;
  if (!isAdmin(user)) return forbidden("Only admins can import transactions");

  let body: { rows?: ImportRow[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rows = Array.isArray(body.rows) ? body.rows : null;
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "No rows to import" }, { status: 400 });
  }
  if (rows.length > 1000) {
    return NextResponse.json({ error: "Too many rows (max 1000 per import)" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createSupabaseServiceClient() as any;

  // Validate everything up front; a bad row fails the whole import so the
  // ledger is never left half-written.
  type Clean = {
    date: string;
    type: "BUY" | "SELL";
    clientId: string | null;
    newClientName: string | null;
    weight: number;
    rate: number;
    amount: number;
    invoiceNumber: string | null;
    paymentMode: string;
    vat: number | null;
    notes: string | null;
  };
  const clean: Clean[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const type = r.type === "BUY" || r.type === "SELL" ? r.type : null;
    const date = typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null;
    const weight = num(r.weightGrams);
    const rate = num(r.ratePerGram);
    if (!type) return NextResponse.json({ error: `Row ${i + 1}: type must be BUY or SELL` }, { status: 400 });
    if (!date) return NextResponse.json({ error: `Row ${i + 1}: date must be YYYY-MM-DD` }, { status: 400 });
    if (!Number.isFinite(weight) || weight <= 0)
      return NextResponse.json({ error: `Row ${i + 1}: weight must be > 0` }, { status: 400 });
    if (!Number.isFinite(rate) || rate <= 0)
      return NextResponse.json({ error: `Row ${i + 1}: rate must be > 0` }, { status: 400 });

    const clientId = typeof r.clientId === "string" && r.clientId ? r.clientId : null;
    const newClientName =
      !clientId && typeof r.newClientName === "string" && r.newClientName.trim()
        ? r.newClientName.trim()
        : null;

    const amount =
      r.amountThb != null && r.amountThb !== "" && Number.isFinite(num(r.amountThb))
        ? num(r.amountThb)
        : Math.round(weight * rate * 100) / 100;

    // BUY keeps the supplier's number; SELL is auto-assigned later.
    const invoiceNumber =
      type === "BUY" && typeof r.invoiceNumber === "string" && r.invoiceNumber.trim()
        ? r.invoiceNumber.trim()
        : null;

    const paymentMode =
      typeof r.paymentMode === "string" && ["bank", "qr", "cheque", "cash"].includes(r.paymentMode)
        ? r.paymentMode
        : "bank";
    const vat =
      r.vatPercent != null && r.vatPercent !== "" && Number.isFinite(num(r.vatPercent))
        ? num(r.vatPercent)
        : 0;
    const notes = typeof r.notes === "string" && r.notes.trim() ? r.notes.trim() : null;

    clean.push({
      date,
      type,
      clientId,
      newClientName,
      weight,
      rate,
      amount,
      invoiceNumber,
      paymentMode,
      vat,
      notes,
    });
  }

  const nowIso = new Date().toISOString();
  const results: RowResult[] = [];
  const touched = new Set<number>(); // years, for a single WAC pass
  let created = 0;

  // Cache created clients by name so repeated names make one client.
  const createdClients = new Map<string, string>();

  try {
    for (let i = 0; i < clean.length; i++) {
      const c = clean[i];

      // Resolve the client: existing id, or create (once) the named client.
      let clientId = c.clientId;
      if (!clientId && c.newClientName) {
        const key = c.newClientName.toLowerCase();
        if (createdClients.has(key)) {
          clientId = createdClients.get(key)!;
        } else {
          const { data: cl, error: ce } = await sb
            .from("clients")
            .insert({ name: c.newClientName })
            .select("id")
            .single();
          if (ce) throw new Error(`Row ${i + 1}: failed to create client "${c.newClientName}": ${ce.message}`);
          clientId = cl.id as string;
          createdClients.set(key, clientId);
        }
      }

      const invoiceNumber =
        c.type === "BUY"
          ? c.invoiceNumber // supplier's number (may be null)
          : await nextInvoiceNumber(sb, "official", "SELL", c.date);

      const { data: inserted, error } = await sb
        .from("transactions")
        .insert({
          book: "official",
          type: c.type,
          date: c.date,
          client_id: clientId,
          weight_grams: c.weight,
          rate_per_gram: c.rate,
          amount_thb: c.amount,
          payment_mode: c.paymentMode,
          vat_percent: c.vat,
          invoice_number: invoiceNumber,
          notes: c.notes,
          status: "approved",
          created_by: user.id,
          approved_by: user.id,
          approved_at: nowIso,
        })
        .select("id,invoice_number,client_id")
        .single();

      if (error) throw new Error(`Row ${i + 1}: ${error.message}`);

      touched.add(yearOf(c.date));
      created += 1;
      results.push({
        index: i,
        ok: true,
        id: inserted.id,
        invoiceNumber: inserted.invoice_number,
        clientId: inserted.client_id,
      });

      await logTransactionAudit({
        transactionId: inserted.id,
        action: "created",
        performedBy: user.id,
        newValues: inserted as Record<string, unknown>,
      });
    }

    // One WAC recompute per year touched, after all inserts.
    for (const year of touched) {
      await persistBookWac(sb, "official", year);
    }

    return NextResponse.json({ ok: true, created, years: [...touched], results }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Import failed";
    // Recompute WAC for whatever did land, so the ledger stays consistent.
    for (const year of touched) {
      try {
        await persistBookWac(sb, "official", year);
      } catch {
        /* best effort */
      }
    }
    return NextResponse.json(
      { error: message, created, years: [...touched], results },
      { status: 500 }
    );
  }
}
