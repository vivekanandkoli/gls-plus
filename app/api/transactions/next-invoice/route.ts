import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import { nextInvoiceNumber, type TxType } from "@/lib/invoice-number";
import type { Book } from "@/lib/rbac";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

/** Preview the invoice number the create form will use. */
export async function GET(req: Request) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  try {
    const { searchParams } = new URL(req.url);
    const book: Book = searchParams.get("book") === "unofficial" ? "unofficial" : "official";
    const type: TxType = searchParams.get("type") === "SELL" ? "SELL" : "BUY";
    const date = searchParams.get("date");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "A valid date is required" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;
    return NextResponse.json({ invoiceNumber: await nextInvoiceNumber(sb, book, type, date) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to generate invoice number";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
