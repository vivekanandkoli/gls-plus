import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

export async function GET() {
  const auth = await requireAppUser();
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createSupabaseServiceClient() as any;
    const { count, error } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    if (error) throw error;

    return NextResponse.json({ count: count ?? 0 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to count pending";
    return NextResponse.json({ error: message, count: 0 }, { status: 500 });
  }
}
