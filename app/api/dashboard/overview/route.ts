import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { computeBookSummary } from "@/lib/wac-book";
import type { Book } from "@/lib/rbac";

/**
 * GET /api/dashboard/overview?year=YYYY
 * Two-ledger dashboard payload: per-book (official/unofficial) stock, WAC,
 * buy/sell totals and profit for the year, plus recent transactions.
 */
export async function GET(req: Request) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  try {
    const url = new URL(req.url);
    const now = new Date().getUTCFullYear();
    const year = Number(url.searchParams.get("year")) || now;

    const supabase = createSupabaseServiceClient() as never;

    const [official, unofficial] = await Promise.all([
      computeBookSummary(supabase, "official" as Book, year),
      computeBookSummary(supabase, "unofficial" as Book, year),
    ]);

    // Years that actually have data, for the selector.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data: yearRows } = await sb
      .from("transactions")
      .select("date")
      .order("date", { ascending: true });
    const years = Array.from(
      new Set<number>((yearRows ?? []).map((r: { date: string }) => new Date(r.date).getUTCFullYear()))
    ).sort((a, b) => b - a);

    // Recent transactions for the selected year (both books).
    const { data: recentRows } = await sb
      .from("transactions")
      .select("id,book,date,type,invoice_number,weight_grams,rate_per_gram,amount_thb,status,client_id")
      .gte("date", `${year}-01-01`)
      .lte("date", `${year}-12-31`)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(12);

    const clientIds = Array.from(
      new Set((recentRows ?? []).map((r: { client_id: string | null }) => r.client_id).filter(Boolean))
    );
    const nameById = new Map<string, string>();
    if (clientIds.length) {
      const { data: clients } = await sb.from("clients").select("id,name").in("id", clientIds);
      for (const c of clients ?? []) nameById.set(c.id, c.name);
    }
    const recent = (recentRows ?? []).map(
      (r: { client_id: string | null } & Record<string, unknown>) => ({
        ...r,
        client_name: r.client_id ? nameById.get(r.client_id) ?? null : null,
      })
    );

    return NextResponse.json({
      year,
      years: years.length ? years : [now],
      books: { official, unofficial },
      recent,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load dashboard";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
