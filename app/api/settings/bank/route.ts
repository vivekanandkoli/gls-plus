import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

const SELECT = "bank_name,bank_account_name,bank_account_number";

/** Normalize an optional text field to a trimmed value or null. */
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * GET /api/settings/bank - current company bank details (for SELL invoices).
 * Admin only.
 */
export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;
    const { data, error } = await sb.from("settings").select(SELECT).eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    return NextResponse.json({ bank: data ?? {} });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load bank details";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/settings/bank - update the company bank details.
 * Writes only the three bank columns on the single settings row (id = 1),
 * independent of the main Settings form. Admin only; service_role bypasses RLS.
 */
export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await req.json().catch(() => ({}));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;
    const { data, error } = await sb
      .from("settings")
      .update({
        bank_name: str(body.bank_name),
        bank_account_name: str(body.bank_account_name),
        bank_account_number: str(body.bank_account_number),
      })
      .eq("id", 1)
      .select(SELECT)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Settings row not found" }, { status: 404 });
    return NextResponse.json({ bank: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update bank details";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
