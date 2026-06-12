import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import { isAdmin } from "@/lib/rbac";
import { fetchDeal, deleteDeal } from "@/lib/deals-service";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

// ── GET /api/deals/[id] ───────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  const dealId = parseInt(id, 10);
  if (isNaN(dealId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const supabase = createSupabaseServiceClient() as any;
    const { data, error } = await supabase
      .from("deals")
      .select(
        `id,date,weight_gm,
         buy_client_id,buy_rate,buy_amount,
         sell_client_id,sell_rate,sell_amount,
         trading_profit,profit_pct,
         buy_invoice,sell_invoice,payment_mode,is_cash,
         wac_at_sale,cost_of_sale,wac_profit_loss,
         status,rejection_reason,notes,
         created_by,approved_by,approved_at,created_at,
         buy_client:clients!deals_buy_client_id_fkey(id,name),
         sell_client:clients!deals_sell_client_id_fkey(id,name)`
      )
      .eq("id", dealId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

    // Non-admin can only see approved
    if (!isAdmin(user) && data.status !== "approved") {
      if (data.created_by !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    return NextResponse.json({ deal: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── DELETE /api/deals/[id] ────────────────────────────────────────────────────

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  const dealId = parseInt(id, 10);
  if (isNaN(dealId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const supabase = createSupabaseServiceClient() as any;
    const { data: deal, error: fetchErr } = await supabase
      .from("deals")
      .select("id,status,created_by")
      .eq("id", dealId)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

    const canDelete =
      isAdmin(user) ||
      (deal.status === "pending" && deal.created_by === user.id);
    if (!canDelete) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await deleteDeal(dealId, user);
    return NextResponse.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
