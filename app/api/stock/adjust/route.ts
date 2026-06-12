import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await req.json().catch(() => null);
    const mode = body?.mode === "delta" ? "delta" : "set";
    const parsedGrams = typeof body?.grams === "number" ? body.grams : NaN;
    const date = typeof body?.date === "string" ? body.date : new Date().toISOString().slice(0, 10);
    const notes = typeof body?.notes === "string" ? body.notes.trim() : "";

    if (!Number.isFinite(parsedGrams) || !date) {
      return NextResponse.json({ error: "grams and date required" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient() as any;

    const { data: lastLedger } = await supabase
      .from("stock_ledger")
      .select("balance_grams")
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const latestBalance =
      typeof lastLedger?.balance_grams === "number" ? lastLedger.balance_grams : 0;

    const delta = mode === "set" ? parsedGrams - latestBalance : parsedGrams;
    const newBalance = mode === "set" ? parsedGrams : latestBalance + parsedGrams;

    const { error: insertErr } = await supabase.from("stock_ledger").insert({
      transaction_id: null,
      balance_grams: newBalance,
      recorded_at: date,
    });
    if (insertErr) throw insertErr;

    await supabase.from("audit_log").insert({
      event_type: "stock_adjustment",
      description: `Manual stock adjustment: ${mode === "set" ? "set to" : "delta"} ${parsedGrams} g. New balance: ${newBalance.toFixed(4)} g.${notes ? " Reason: " + notes : ""}`,
      metadata: {
        mode,
        date,
        parsedGrams,
        delta,
        newBalance,
        notes: notes || null,
        performed_by: admin.id,
      },
    });

    return NextResponse.json({ newBalance, delta });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stock adjustment failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
