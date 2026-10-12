import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import { nextInvoiceNumber } from "@/lib/invoice-number";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import type { Book } from "@/lib/rbac";

/**
 * GET /api/invoice-number/preview?book=&type=&date=
 * Returns the invoice number that WOULD be assigned next (non-consuming — it's
 * derived from the highest serial already issued that day).
 */
export async function GET(req: Request) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  try {
    const url = new URL(req.url);
    const book: Book = url.searchParams.get("book") === "unofficial" ? "unofficial" : "official";
    const type = url.searchParams.get("type") === "BUY" ? "BUY" : "SELL";
    const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;
    const invoiceNumber = await nextInvoiceNumber(sb, book, type, date);
    return NextResponse.json({ invoiceNumber });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to preview invoice number";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
