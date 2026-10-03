import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

/** GET /api/clients/list - clients for pickers, with contact/billing fields
 *  so a selected client's details can be shown inline. */
export async function GET() {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;
    const { data, error } = await sb
      .from("clients")
      .select("id,name,tax_id,address,phone,email")
      .order("name");
    if (error) throw new Error(error.message);
    return NextResponse.json({ clients: data ?? [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load clients";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
