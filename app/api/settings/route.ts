import { NextResponse } from "next/server";

import { requireAppUser, requireAdmin } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

const EDITABLE = [
  "company_name", "company_name_th", "tax_id", "phone", "email", "website",
  "address_1", "address_2", "logo_url", "invoice_footer",
  "official_low_stock_threshold_gm", "unofficial_low_stock_threshold_gm",
  "default_vat_percent",
  "invoice_prefix_official_buy", "invoice_prefix_official_sell",
  "invoice_prefix_unofficial_buy", "invoice_prefix_unofficial_sell",
] as const;

export async function GET() {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (createSupabaseServiceClient() as any)
      .from("settings").select("*").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    return NextResponse.json({ settings: data ?? {} });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  try {
    const body = await req.json().catch(() => ({}));
    const patch: Record<string, unknown> = {};
    for (const k of EDITABLE) if (k in (body ?? {})) patch[k] = body[k];
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (createSupabaseServiceClient() as any)
      .from("settings").update(patch).eq("id", 1).select("*").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ settings: data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
