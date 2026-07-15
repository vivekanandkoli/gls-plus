"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
import { TransactionStatusBadge } from "@/components/transactions/TransactionStatusBadge";
import { cn, formatCurrency } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase";

type Book = "official" | "unofficial";
type SellRow = {
  id: string;
  date: string;
  book: Book;
  weight_grams: number;
  rate_per_gram: number;
  amount_thb: number;
  profit_loss: number | null;
  paired_txn_id: string | null;
  client_id: string | null;
  status: "pending" | "approved" | "rejected";
};
type Deal = {
  id: string;
  date: string;
  book: Book;
  weight: number;
  buyRate: number;
  sellRate: number;
  profit: number | null;
  status: "pending" | "approved" | "rejected";
  buyClient: string;
  sellClient: string;
};

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabaseClient() as any;
      // Deal-sells: SELLs that link to a paired BUY.
      const { data: sells, error: sErr } = await supabase
        .from("transactions")
        .select("id,date,book,weight_grams,rate_per_gram,amount_thb,profit_loss,paired_txn_id,client_id,status")
        .not("paired_txn_id", "is", null)
        .order("date", { ascending: false })
        .limit(200);
      if (sErr) throw new Error(sErr.message);

      const buyIds = (sells ?? []).map((s: SellRow) => s.paired_txn_id).filter(Boolean);
      const { data: buys } = buyIds.length
        ? await supabase.from("transactions").select("id,rate_per_gram,client_id").in("id", buyIds)
        : { data: [] };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const buyMap = new Map<string, any>((buys ?? []).map((b: any) => [b.id, b]));

      const { data: clientsData } = await supabase.from("clients").select("id,name").limit(1000);
      const nameMap = new Map<string, string>((clientsData ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));

      const rows: Deal[] = (sells ?? []).map((s: SellRow) => {
        const buy = s.paired_txn_id ? buyMap.get(s.paired_txn_id) : null;
        return {
          id: s.id,
          date: s.date,
          book: s.book,
          weight: s.weight_grams,
          buyRate: buy?.rate_per_gram ?? 0,
          sellRate: s.rate_per_gram,
          profit: s.profit_loss,
          status: s.status,
          buyClient: buy?.client_id ? nameMap.get(buy.client_id) ?? "—" : "—",
          sellClient: s.client_id ? nameMap.get(s.client_id) ?? "—" : "—",
        };
      });
      setDeals(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load deals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageWrapper title="Deals" description="Paired buy + sell trades. Each deal is two linked transactions.">
      <div className="mb-4 flex justify-end">
        <Button asChild><Link href="/deals/new"><Plus className="mr-2 h-4 w-4" />New deal</Link></Button>
      </div>

      {error && <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">{error}</div>}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Book</th>
              <th className="px-3 py-2 text-right">Weight</th>
              <th className="px-3 py-2">Buy from</th>
              <th className="px-3 py-2 text-right">Buy rate</th>
              <th className="px-3 py-2">Sell to</th>
              <th className="px-3 py-2 text-right">Sell rate</th>
              <th className="px-3 py-2 text-right">Profit</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">Loading…</td></tr>
            ) : deals.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">No deals yet.</td></tr>
            ) : (
              deals.map((d) => (
                <tr key={d.id} className="border-t border-border">
                  <td className="px-3 py-2 whitespace-nowrap">{d.date}</td>
                  <td className="px-3 py-2"><span className={cn("rounded px-1.5 py-0.5 text-xs", d.book === "unofficial" ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" : "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300")}>{d.book === "unofficial" ? "Unofficial" : "Official"}</span></td>
                  <td className="px-3 py-2 text-right">{d.weight}g</td>
                  <td className="px-3 py-2">{d.buyClient}</td>
                  <td className="px-3 py-2 text-right">{d.buyRate.toLocaleString()}</td>
                  <td className="px-3 py-2">{d.sellClient}</td>
                  <td className="px-3 py-2 text-right">{d.sellRate.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">{d.profit != null ? <span className={d.profit >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600"}>{formatCurrency(d.profit, "THB", "th-TH")}</span> : "—"}</td>
                  <td className="px-3 py-2"><TransactionStatusBadge status={d.status} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PageWrapper>
  );
}
