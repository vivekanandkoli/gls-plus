import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

/** PATCH /api/stock/adjust/[id] — admin approves or rejects a pending request.
 *  body: { action: "approve" | "reject", rejectionReason? } */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action === "reject" ? "reject" : "approve";
    const rejectionReason =
      typeof body?.rejectionReason === "string" ? body.rejectionReason.trim() || null : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;
    const { data, error } = await sb
      .from("stock_adjustments")
      .update({
        status: action === "approve" ? "approved" : "rejected",
        approved_by: admin.id,
        approved_at: new Date().toISOString(),
        rejection_reason: action === "reject" ? rejectionReason : null,
      })
      .eq("id", id)
      .eq("status", "pending")
      .select("id,status")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json({ error: "Request not found or already decided" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, status: data.status });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Action failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
