import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createSupabaseServiceClient() as any;
    const { data, error } = await supabase
      .from("clients")
      .select("id, name")
      .order("name", { ascending: true });

    if (error) throw new Error(error.message);
    return NextResponse.json({ clients: data ?? [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to fetch clients";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
