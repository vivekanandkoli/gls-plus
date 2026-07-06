import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

// ── POST /api/clients — create (or reuse by name) a client ────────────────────
export async function POST(req: Request) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  try {
    const body = await req.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createSupabaseServiceClient() as any;

    // Reuse an existing client with the same name (case-insensitive), else insert.
    const { data: existing } = await supabase
      .from("clients")
      .select("id,name")
      .ilike("name", name)
      .limit(1)
      .maybeSingle();
    if (existing) return NextResponse.json({ client: existing }, { status: 200 });

    const { data, error } = await supabase
      .from("clients")
      .insert({ name, phone: body?.phone ?? null, email: body?.email ?? null })
      .select("id,name")
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ client: data }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Create failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
