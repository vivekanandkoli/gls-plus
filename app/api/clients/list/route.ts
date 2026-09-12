import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

/** GET /api/clients/list - id + name for pickers. */
export async function GET() {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;
    const { data, error } = await sb.from("clients").select("id,name").order("name");
    if (error) throw new Error(error.message);
    return NextResponse.json({ clients: data ?? [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load clients";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
