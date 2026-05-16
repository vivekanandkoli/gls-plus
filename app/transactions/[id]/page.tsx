"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "@/lib/supabase";
import { cn, embeddedClientName, formatCurrency } from "@/lib/utils";

type TxDetail = {
  id: string;
  date: string;
  type: "BUY" | "SELL";
  invoice_number: string | null;
  weight_grams: number | null;
  rate_per_gram: number | null;
  amount_thb: number | null;
  vat_percent: number | null;
  notes: string | null;
  client: { name: string } | { name: string }[] | null;
};

export default function TransactionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tx, setTx] = useState<TxDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const supabase = getSupabaseClient() as any;
        const { data, error } = await supabase
          .from("transactions")
          .select(
            "id,date,type,invoice_number,weight_grams,rate_per_gram,amount_thb,vat_percent,notes,client:clients(name)"
          )
          .eq("id", id)
          .single();
        if (error || !data) { setNotFound(true); return; }
        setTx(data as TxDetail);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [id]);

  if (loading) {
    return (
      <PageWrapper title="Transaction">
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Loading…</div>
      </PageWrapper>
    );
  }

  if (notFound || !tx) {
    return (
      <PageWrapper title="Transaction not found">
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          Transaction not found.{" "}
          <Link href="/transactions" className="underline">Back to transactions</Link>
        </div>
      </PageWrapper>
    );
  }

  const clientName = embeddedClientName(tx.client) ?? "-";

  return (
    <PageWrapper title={tx.invoice_number ?? `Transaction ${tx.id.slice(0, 8)}`}>
      <div className="rounded-lg border bg-card p-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Badge
              className={cn(
                tx.type === "BUY"
                  ? "bg-emerald-600 text-white hover:bg-emerald-600"
                  : "bg-amber-600 text-white hover:bg-amber-600"
              )}
            >
              {tx.type}
            </Badge>
            <span className="font-mono text-sm text-muted-foreground">{tx.date}</span>
          </div>
          <Button asChild size="sm">
            <Link href={`/transactions/${tx.id}/edit`}>Edit</Link>
          </Button>
        </div>

        <div className="rounded-lg border divide-y text-sm">
          {[
            ["Invoice #", tx.invoice_number ?? "-"],
            ["Client", clientName],
            ["Weight", tx.weight_grams != null ? `${tx.weight_grams.toLocaleString()} g` : "-"],
            ["Rate", tx.rate_per_gram != null ? `${tx.rate_per_gram.toLocaleString()} THB/g` : "-"],
            ["Amount", tx.amount_thb != null ? formatCurrency(tx.amount_thb, "THB", "th-TH") : "-"],
            ["VAT", tx.vat_percent != null && tx.vat_percent > 0 ? `${tx.vat_percent}%` : "0%"],
            ["Notes", tx.notes ?? "-"],
          ].map(([label, value]) => (
            <div key={label} className="flex items-start gap-4 px-4 py-3">
              <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
              <span className="font-medium">{value}</span>
            </div>
          ))}
        </div>

        <div>
          <Button variant="outline" asChild size="sm">
            <Link href="/transactions">← Back to transactions</Link>
          </Button>
        </div>
      </div>
    </PageWrapper>
  );
}
