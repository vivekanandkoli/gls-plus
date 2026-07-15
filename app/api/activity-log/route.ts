import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 500);
    const offset = parseInt(url.searchParams.get("offset") ?? "0", 10) || 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createSupabaseServiceClient() as any;
    const { data, error, count } = await supabase
      .from("activity_log")
      .select(
        "id,created_at,action,old_values,new_values,transaction_id,performer:performed_by(email)",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return NextResponse.json({ entries: data ?? [], total: count ?? 0 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load activity log";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
