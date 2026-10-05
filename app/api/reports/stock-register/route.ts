import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { requireAppUser } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { embedFkOne } from "@/lib/utils";

type Row = {
  srNo: number;
  date: string;
  name: string;
  invoiceBuy: string;
  invoiceSale: string;
  buyWt: number | null;
  sellWt: number | null;
  balance: number;
  buyRate: number | null;
  buyAmt: number | null;
  sellRate: number | null;
  sellAmt: number | null;
};

function ddmmyyyy(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/**
 * GET /api/reports/stock-register?year=YYYY&book=official[&format=xlsx]
 * Reproduces the owner's stock-register sheet: one row per transaction with
 * BUY / SALE weights, rate, amount and the running stock balance.
 */
export async function GET(req: Request) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  try {
    const url = new URL(req.url);
    const year = Number(url.searchParams.get("year")) || new Date().getUTCFullYear();
    const book = url.searchParams.get("book") === "unofficial" ? "unofficial" : "official";
    const format = url.searchParams.get("format");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;

    const { data: ob } = await sb
      .from("opening_balances")
      .select("opening_stock_gm")
      .eq("book", book)
      .eq("year", year)
      .maybeSingle();
    const openingStock = Number(ob?.opening_stock_gm) || 0;

    const { data: txs, error } = await sb
      .from("transactions")
      .select("date,type,invoice_number,weight_grams,rate_per_gram,amount_thb,created_at,client:clients(name)")
      .eq("book", book)
      .eq("status", "approved")
      .gte("date", `${year}-01-01`)
      .lte("date", `${year}-12-31`)
      .order("date", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    let stock = openingStock;
    const rows: Row[] = (txs ?? []).map((t: Record<string, unknown>, i: number) => {
      const isBuy = t.type === "BUY";
      const wt = Number(t.weight_grams) || 0;
      stock += isBuy ? wt : -wt;
      const client = embedFkOne(t.client as { name: string } | { name: string }[] | null);
      return {
        srNo: i + 1,
        date: ddmmyyyy(String(t.date)),
        name: client?.name ?? "",
        invoiceBuy: isBuy ? (t.invoice_number as string) ?? "" : "",
        invoiceSale: !isBuy ? (t.invoice_number as string) ?? "" : "",
        buyWt: isBuy ? wt : null,
        sellWt: !isBuy ? wt : null,
        balance: Math.round(stock * 1000) / 1000,
        buyRate: isBuy ? Number(t.rate_per_gram) || 0 : null,
        buyAmt: isBuy ? Number(t.amount_thb) || 0 : null,
        sellRate: !isBuy ? Number(t.rate_per_gram) || 0 : null,
        sellAmt: !isBuy ? Number(t.amount_thb) || 0 : null,
      };
    });

    if (format === "xlsx") {
      const header = [
        "Sr. No.", "Date", "Name", "invoice BUY", "Invoice sale", "BUY", "SALE", "Balance",
        "", "BUY", "Rate", "Amount", "SALE", "Rate", "Amount",
      ];
      const aoa: (string | number)[][] = [
        header,
        ...rows.map((r) => [
          r.srNo, r.date, r.name, r.invoiceBuy, r.invoiceSale,
          r.buyWt ?? "", r.sellWt ?? "", r.balance, "",
          r.buyWt ?? "", r.buyRate ?? "", r.buyAmt ?? "",
          r.sellWt ?? "", r.sellRate ?? "", r.sellAmt ?? "",
        ]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Stock ${year}`);
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="stock-register-${book}-${year}.xlsx"`,
        },
      });
    }

    return NextResponse.json({ year, book, openingStock, rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load stock register";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
