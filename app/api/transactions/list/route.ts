import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

/**
 * GET /api/transactions/list
 * Filters: book, year, type, status, q (invoice or client name), page, pageSize.
 * Two-ledger aware; returns rows with client names + persisted WAC/profit.
 */
export async function GET(req: Request) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  try {
    const url = new URL(req.url);
    const p = url.searchParams;
    const book = p.get("book"); // official | unofficial | null(all)
    const year = p.get("year");
    const type = p.get("type"); // BUY | SELL
    const status = p.get("status");
    const q = (p.get("q") || "").trim();
    const page = Math.max(1, Number(p.get("page")) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(p.get("pageSize")) || 50));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;

    // If searching by client name, resolve matching client ids first.
    let clientIdFilter: string[] | null = null;
    if (q) {
      const { data: cm } = await sb.from("clients").select("id").ilike("name", `%${q}%`);
      clientIdFilter = (cm ?? []).map((c: { id: string }) => c.id);
    }

    let query = sb
      .from("transactions")
      .select(
        "id,book,date,type,invoice_number,weight_grams,rate_per_gram,amount_thb,payment_mode,status,wac_at_sale,cost_of_sale,profit_loss,client_id",
        { count: "exact" }
      );

    if (book === "official" || book === "unofficial") query = query.eq("book", book);
    if (type === "BUY" || type === "SELL") query = query.eq("type", type);
    if (status) query = query.eq("status", status);
    if (year) query = query.gte("date", `${year}-01-01`).lte("date", `${year}-12-31`);
    if (q) {
      // invoice match OR client-name match (via resolved ids)
      const idList = (clientIdFilter ?? []).map((id) => `"${id}"`).join(",");
      const ors = [`invoice_number.ilike.%${q}%`];
      if (idList) ors.push(`client_id.in.(${idList})`);
      query = query.or(ors.join(","));
    }

    const from = (page - 1) * pageSize;
    query = query
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    const { data: rows, count, error } = await query;
    if (error) throw new Error(error.message);

    // Resolve client names for this page.
    const ids = Array.from(
      new Set((rows ?? []).map((r: { client_id: string | null }) => r.client_id).filter(Boolean))
    );
    const nameById = new Map<string, string>();
    if (ids.length) {
      const { data: cs } = await sb.from("clients").select("id,name").in("id", ids);
      for (const c of cs ?? []) nameById.set(c.id, c.name);
    }

    const out = (rows ?? []).map((r: { client_id: string | null } & Record<string, unknown>) => ({
      ...r,
      client_name: r.client_id ? nameById.get(r.client_id) ?? null : null,
    }));

    // Distinct years for the filter.
    const { data: yr } = await sb.from("transactions").select("date");
    const years = Array.from(
      new Set<number>((yr ?? []).map((r: { date: string }) => new Date(r.date).getUTCFullYear()))
    ).sort((a: number, b: number) => b - a);

    return NextResponse.json({
      rows: out,
      total: count ?? out.length,
      page,
      pageSize,
      years,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load transactions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
