import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { logAudit } from "@/lib/transaction-audit";

/** POST /api/bookings/[id]/cancel — mark a pending booking cancelled. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const reason = typeof body.reason === "string" ? body.reason.trim() || null : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;
    const { data: existing, error: loadErr } = await sb.from("bookings").select("status").eq("id", id).maybeSingle();
    if (loadErr) throw new Error(loadErr.message);
    if (!existing) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    if (existing.status !== "pending") {
      return NextResponse.json({ error: `Booking is already ${existing.status}.` }, { status: 409 });
    }

    const { data, error } = await sb
      .from("bookings")
      .update({ status: "cancelled", cancelled_reason: reason, cancelled_at: new Date().toISOString() })
      .eq("id", id)
      .select("id,status,cancelled_reason")
      .maybeSingle();
    if (error) throw new Error(error.message);
    await logAudit({ entityType: "booking", entityId: id, action: "cancelled", performedBy: user.id, newValues: { status: "cancelled", cancelled_reason: reason } });
    return NextResponse.json({ booking: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to cancel booking";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
