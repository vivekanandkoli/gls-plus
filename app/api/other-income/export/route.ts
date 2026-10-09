import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { requireAdmin } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

/** GET /api/other-income/export — the current (filtered) ledger as an .xlsx download. */
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const url = new URL(req.url);
    const year = url.searchParams.get("year");
    const book = url.searchParams.get("book");
    const kind = url.searchParams.get("kind");
    const category = (url.searchParams.get("category") ?? "").trim();
    const q = (url.searchParams.get("q") ?? "").trim();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;

    const rows: {
      date: string; book: string; kind: string; category: string;
      amount_thb: number | string; description: string | null;
    }[] = [];
    for (let f = 0; ; f += 1000) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = sb
        .from("other_income")
        .select("date,book,kind,category,amount_thb,description")
        .order("date", { ascending: true })
        .order("id", { ascending: true });
      if (year) query = query.gte("date", `${year}-01-01`).lte("date", `${year}-12-31`);
      if (book === "official" || book === "unofficial") query = query.eq("book", book);
      if (kind === "income" || kind === "expense") query = query.eq("kind", kind);
      if (category) query = query.ilike("category", category);
      if (q) query = query.ilike("description", `%${q}%`);
      const { data, error } = await query.range(f, f + 999);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      rows.push(...data);
      if (data.length < 1000) break;
    }

    const aoa: (string | number)[][] = [
      ["Date", "Book", "Kind", "Category", "Income", "Expense", "Description"],
      ...rows.map((r) => [
        r.date,
        r.book,
        r.kind,
        r.category,
        r.kind === "income" ? Number(r.amount_thb) || 0 : 0,
        r.kind === "expense" ? Number(r.amount_thb) || 0 : 0,
        r.description ?? "",
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 12 }, { wch: 11 }, { wch: 9 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 40 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Other Income");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="other-income-${stamp}.xlsx"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
