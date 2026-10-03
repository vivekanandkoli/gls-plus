import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

const SELECT = "id,name,phone,email,tax_id,address,notes";

/** Normalize an optional text field to a trimmed value or null. */
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** GET /api/clients/[id] - one client. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;
    const { data, error } = await sb.from("clients").select(SELECT).eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    return NextResponse.json({ client: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load client";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PATCH /api/clients/[id] - update a client. Writes run server-side via
 *  service_role because RLS has no client write policy. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
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
      .update({
        name,
        tax_id: str(body.taxId ?? body.tax_id),
        address: str(body.address),
        phone: str(body.phone),
        email: str(body.email),
        notes: str(body.notes),
      })
      .eq("id", id)
      .select(SELECT)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    return NextResponse.json({ client: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update client";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
