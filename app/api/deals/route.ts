import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import { createDeal, type CreateDealInput, type PaymentMode } from "@/lib/deals-service";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

const PAYMENT_MODES = ["cash", "bank", "qr", "cheque"] as const;

// ── GET /api/deals ────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status"); // pending|approved|rejected|all
  const officialOnly = searchParams.get("official_only") === "true";
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "50", 10)));

  try {
    const supabase = createSupabaseServiceClient() as any;

    let q = supabase
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
         sell_client:clients!deals_sell_client_id_fkey(id,name)`,
        { count: "exact" }
      )
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });

    if (status && status !== "all") q = q.eq("status", status);
    if (officialOnly) q = q.eq("is_cash", false);
    if (user.role !== "admin") q = q.eq("status", "approved"); // users see approved only

    q = q.range(page * pageSize, page * pageSize + pageSize - 1);

    const { data, error, count } = await q;
    if (error) throw new Error(error.message);

    return NextResponse.json({
      deals: data ?? [],
      total: count ?? 0,
      page,
      pageSize,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to fetch deals";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── POST /api/deals ───────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  try {
    const body = await req.json().catch(() => null);

    const date = typeof body?.date === "string" ? body.date : null;
    const weightGm = typeof body?.weightGm === "number" ? body.weightGm : null;
    const buyClientId = typeof body?.buyClientId === "string" && body.buyClientId ? body.buyClientId : null;
    const buyRate = typeof body?.buyRate === "number" ? body.buyRate : null;
    const sellClientId = typeof body?.sellClientId === "string" && body.sellClientId ? body.sellClientId : null;
    const sellRate = typeof body?.sellRate === "number" ? body.sellRate : null;
    const paymentMode = PAYMENT_MODES.includes(body?.paymentMode) ? (body.paymentMode as PaymentMode) : null;
    const notes = typeof body?.notes === "string" ? body.notes.trim() || null : null;

    // Cash mode only allowed for admin
    if (body?.paymentMode === "cash" && user.role !== "admin") {
      return NextResponse.json({ error: "Only admins can create cash deals" }, { status: 403 });
    }

    if (!date || !weightGm || !buyRate || !sellRate || !paymentMode) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const input: CreateDealInput = {
      date,
      weightGm,
      buyClientId,
      buyRate,
      sellClientId,
      sellRate,
      paymentMode,
      notes,
    };

    const deal = await createDeal(input, user);
    return NextResponse.json({ deal }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Create failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
