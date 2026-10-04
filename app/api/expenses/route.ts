import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

const PAGE_SIZE = 50;

/** GET /api/expenses?page=0&q=&from=&to= — ledger rows (newest first, with
 *  running balance) plus overall totals. */
export async function GET(req: Request) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  try {
    const url = new URL(req.url);
    const page = Math.max(0, parseInt(url.searchParams.get("page") ?? "0", 10) || 0);
    const pageSize = Math.min(200, parseInt(url.searchParams.get("pageSize") ?? String(PAGE_SIZE), 10) || PAGE_SIZE);
    const q = (url.searchParams.get("q") ?? "").trim();
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;

    let query = sb
      .from("expenses_balance")
      .select("id,date,description,job_id,received,expense,balance", { count: "exact" })
      .order("date", { ascending: false })
      .order("id", { ascending: false });
    if (q) query = query.ilike("description", `%${q}%`);
    if (from) query = query.gte("date", from);
    if (to) query = query.lte("date", to);

    const start = page * pageSize;
    const { data, count, error } = await query.range(start, start + pageSize - 1);
    if (error) throw new Error(error.message);

    const { data: summaryRows } = await sb.rpc("expense_summary");
    const summary = summaryRows?.[0] ?? { total_received: 0, total_expense: 0, balance: 0 };

    return NextResponse.json({
      entries: data ?? [],
      total: count ?? 0,
      page,
      pageSize,
      summary,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load expenses";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/expenses — add a ledger entry. */
export async function POST(req: Request) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  try {
    const body = await req.json().catch(() => ({}));
    const date = typeof body.date === "string" && body.date ? body.date : null;
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const jobId = typeof body.jobId === "string" ? body.jobId.trim() || null : null;
    const received = Number(body.received) || 0;
    const expense = Number(body.expense) || 0;

    if (!date) return NextResponse.json({ error: "Date is required" }, { status: 400 });
    if (!description && received === 0 && expense === 0) {
      return NextResponse.json({ error: "Add a description or an amount" }, { status: 400 });
    }
    if (received < 0 || expense < 0) {
      return NextResponse.json({ error: "Amounts cannot be negative" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;
    const { data, error } = await sb
      .from("expenses")
      .insert({ date, description, job_id: jobId, received, expense, created_by: user.id })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to add entry";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
