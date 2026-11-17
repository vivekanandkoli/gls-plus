import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { requireAppUser } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

/**
 * GET /api/transactions/export — the current (filtered) transactions list as an
 * .xlsx download. Honours the same filters as /api/transactions/list
 * (book, type, year, q) so the file matches whatever the page is showing.
 * Rows are chronological (oldest first) to read like a ledger.
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;

    // If searching by client name, resolve matching client ids first.
    let clientIdFilter: string[] | null = null;
    if (q) {
      const { data: cm } = await sb.from("clients").select("id").ilike("name", `%${q}%`);
      clientIdFilter = (cm ?? []).map((c: { id: string }) => c.id);
    }

    type Tx = {
      book: string;
      date: string;
      type: string;
      invoice_number: string | null;
      weight_grams: number | null;
      rate_per_gram: number | null;
      amount_thb: number | null;
      vat_percent: number | null;
      payment_mode: string | null;
      profit_loss: number | null;
      status: string;
      client_id: string | null;
    };

    const rows: Tx[] = [];
    for (let f = 0; ; f += 1000) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = sb
        .from("transactions")
        .select(
          "book,date,type,invoice_number,weight_grams,rate_per_gram,amount_thb,vat_percent,payment_mode,profit_loss,status,client_id,created_at"
        );
      if (book === "official" || book === "unofficial") query = query.eq("book", book);
      if (type === "BUY" || type === "SELL") query = query.eq("type", type);
      if (status) query = query.eq("status", status);
      if (year) query = query.gte("date", `${year}-01-01`).lte("date", `${year}-12-31`);
      if (q) {
        const idList = (clientIdFilter ?? []).map((id) => `"${id}"`).join(",");
        const ors = [`invoice_number.ilike.%${q}%`];
        if (idList) ors.push(`client_id.in.(${idList})`);
        query = query.or(ors.join(","));
      }
      query = query
        .order("date", { ascending: true })
        .order("created_at", { ascending: true })
        .range(f, f + 999);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      rows.push(...data);
      if (data.length < 1000) break;
    }

    // Resolve client names in one batch.
    const ids = Array.from(new Set(rows.map((r) => r.client_id).filter(Boolean))) as string[];
    const nameById = new Map<string, string>();
    if (ids.length) {
      const { data: cs } = await sb.from("clients").select("id,name").in("id", ids);
      for (const c of cs ?? []) nameById.set(c.id, c.name);
    }

    const num = (v: number | null | undefined) => (v == null ? "" : Number(v));

    const aoa: (string | number)[][] = [
      [
        "Date",
        "Book",
        "Type",
        "Client",
        "Invoice #",
        "Weight (g)",
        "Rate (THB/g)",
        "Amount (THB)",
        "VAT %",
        "Payment",
        "Profit/Loss (THB)",
        "Status",
      ],
      ...rows.map((r) => [
        r.date,
        r.book,
        r.type,
        (r.client_id ? nameById.get(r.client_id) : "") ?? "",
        r.invoice_number ?? "",
        num(r.weight_grams),
        num(r.rate_per_gram),
        num(r.amount_thb),
        num(r.vat_percent),
        r.payment_mode ?? "",
        // Profit only applies to SELL rows.
        r.type === "SELL" ? num(r.profit_loss) : "",
        r.status,
      ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [
      { wch: 12 }, { wch: 11 }, { wch: 6 }, { wch: 26 }, { wch: 16 }, { wch: 12 },
      { wch: 13 }, { wch: 16 }, { wch: 7 }, { wch: 9 }, { wch: 16 }, { wch: 10 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const stamp = new Date().toISOString().slice(0, 10);
    const scope = book === "official" || book === "unofficial" ? book : "all";
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="transactions-${scope}-${stamp}.xlsx"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
