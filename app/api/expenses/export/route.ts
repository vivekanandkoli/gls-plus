import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** GET /api/expenses/export — the current (filtered) ledger as a CSV download. */
export async function GET(req: Request) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const type = url.searchParams.get("type");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;

    const rows: {
      date: string; description: string; job_id: string | null;
      received: number; expense: number; balance: number;
    }[] = [];
    for (let f = 0; ; f += 1000) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = sb
        .from("expenses_balance")
        .select("date,description,job_id,received,expense,balance")
        .order("date", { ascending: true })
        .order("id", { ascending: true });
      if (q) query = query.ilike("description", `%${q}%`);
      if (from) query = query.gte("date", from);
      if (to) query = query.lte("date", to);
      if (type === "received") query = query.gt("received", 0);
      if (type === "expense") query = query.gt("expense", 0);
      const { data, error } = await query.range(f, f + 999);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      rows.push(...data);
      if (data.length < 1000) break;
    }

    const header = ["Date", "Description", "Job ID", "Received", "Expense", "Balance"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([
        r.date,
        csvCell(r.description),
        csvCell(r.job_id ?? ""),
        Number(r.received) || 0,
        Number(r.expense) || 0,
        Number(r.balance) || 0,
      ].join(","));
    }
    const csv = "﻿" + lines.join("\r\n"); // BOM so Excel reads UTF-8

    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="expenses-${stamp}.csv"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
