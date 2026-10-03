import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

const SELECT = "id,name,phone,email,tax_id,address,notes";

/** Normalize an optional text field to a trimmed value or null. */
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** POST /api/clients - create a client. Writes run server-side via service_role
 *  because RLS has no client write policy (all writes bypass RLS here). */
export async function POST(req: Request) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;
    const { data, error } = await sb
      .from("clients")
      .insert({
        name,
        tax_id: str(body.taxId ?? body.tax_id),
        address: str(body.address),
        phone: str(body.phone),
        email: str(body.email),
        notes: str(body.notes),
      })
      .select(SELECT)
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ client: data }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create client";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
