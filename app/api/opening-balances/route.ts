import { NextResponse } from "next/server";

import { requireAppUser, requireAdmin } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import type { Book } from "@/lib/opening-balances";

export const dynamic = "force-dynamic";

const BOOKS = ["official", "unofficial"] as const;

// GET /api/opening-balances?year=2026
export async function GET(req: Request) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;
  const year = parseInt(new URL(req.url).searchParams.get("year") ?? String(new Date().getFullYear()), 10);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (createSupabaseServiceClient() as any)
      .from("opening_balances")
      .select("year,book,opening_stock_gm,opening_wac,opening_stock_value_thb")
      .eq("year", year);
    if (error) throw new Error(error.message);
    return NextResponse.json({ year, balances: data ?? [] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

// PUT /api/opening-balances  { year, book, opening_stock_gm, opening_wac }  (admin)
export async function PUT(req: Request) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  try {
    const body = await req.json().catch(() => ({}));
    const year = parseInt(String(body?.year ?? new Date().getFullYear()), 10);
    const book = BOOKS.includes(body?.book) ? (body.book as Book) : null;
    const gm = Number(body?.opening_stock_gm);
    const wac = Number(body?.opening_wac);
    if (!book || !Number.isFinite(gm) || !Number.isFinite(wac)) {
      return NextResponse.json({ error: "year, book, opening_stock_gm, opening_wac required" }, { status: 400 });
    }
    const value = Math.round(gm * wac * 100) / 100;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (createSupabaseServiceClient() as any)
      .from("opening_balances")
      .upsert({ year, book, opening_stock_gm: gm, opening_wac: wac, opening_stock_value_thb: value }, { onConflict: "year,book" })
      .select("year,book,opening_stock_gm,opening_wac,opening_stock_value_thb")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ balance: data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
