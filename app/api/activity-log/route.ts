import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 500);
    const offset = parseInt(url.searchParams.get("offset") ?? "0", 10) || 0;

    const supabase = createSupabaseServiceClient() as any;
    const { data, error, count } = await supabase
      .from("activity_log")
      .select("id,created_at,action,old_values,new_values,transaction_id,performed_by", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Map performed_by (user id) to an email so the log is readable.
    const ids = Array.from(
      new Set((data ?? []).map((r: { performed_by: number | null }) => r.performed_by).filter(Boolean))
    );
    const emailById = new Map<number, string>();
    if (ids.length) {
      const { data: users } = await supabase.from("users").select("id,email").in("id", ids);
      for (const u of users ?? []) emailById.set(u.id, u.email);
    }

    const entries = (data ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      timestamp: r.created_at,
      performed_by_email: r.performed_by ? emailById.get(r.performed_by as number) ?? null : null,
    }));

    return NextResponse.json({ entries, total: count ?? 0 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load activity log";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
