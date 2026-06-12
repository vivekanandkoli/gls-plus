"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { TransactionPlDetailBlock, wacPlFromRow } from "@/components/transactions/TransactionPlDisplay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTransactionWac } from "@/hooks/use-transaction-wac";
import { getSupabaseClient } from "@/lib/supabase";
import { cn, embeddedClientName, formatCurrency } from "@/lib/utils";
import { TransactionStatusBadge } from "@/components/transactions/TransactionStatusBadge";
import { useAppUser } from "@/hooks/use-app-user";
import { canEditTransaction } from "@/lib/transaction-permissions";
import type { TransactionStatus } from "@/lib/rbac";

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
  wac_at_sale?: number | null;
  cost_of_sale?: number | null;
  profit_loss?: number | null;
  pl_percent?: number | null;
  status?: TransactionStatus;
  created_by?: number | null;
  rejection_reason?: string | null;
  client: { name: string } | { name: string }[] | null;
};

export default function TransactionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user: appUser, isAdmin } = useAppUser();
  const [wacDbEnabled, setWacDbEnabled] = useState(false);
  const useDbWac = wacDbEnabled === true;
  const { plById } = useTransactionWac(!useDbWac);
  const [tx, setTx] = useState<TxDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Admin inline invoice edit state
  const [invoiceEditing, setInvoiceEditing] = useState(false);
  const [invoiceDraft, setInvoiceDraft] = useState("");
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [invoiceSuccess, setInvoiceSuccess] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/wac/status");
        const body = await res.json().catch(() => ({}));
        setWacDbEnabled(res.ok && body?.hasColumns === true);
      } catch {
        setWacDbEnabled(false);
      }
    })();
  }, []);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const supabase = getSupabaseClient() as any;
        const wacSelect = useDbWac
          ? ",wac_at_sale,cost_of_sale,profit_loss,pl_percent"
          : "";
        const { data, error } = await supabase
          .from("transactions")
          .select(
            `id,date,type,invoice_number,weight_grams,rate_per_gram,amount_thb,vat_percent,notes,status,created_by,rejection_reason${wacSelect},client:clients(name)`
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
  }, [id, useDbWac]);

  async function saveInvoiceNumber() {
    if (!tx || !invoiceDraft.trim()) return;
    setInvoiceSaving(true);
    setInvoiceError(null);
    try {
      const res = await fetch(`/api/transactions/${tx.id}/invoice`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceNumber: invoiceDraft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInvoiceError(typeof data.error === "string" ? data.error : "Failed to update invoice number");
        return;
      }
      setTx((prev) => prev ? { ...prev, invoice_number: invoiceDraft.trim() } : prev);
      setInvoiceEditing(false);
      setInvoiceSuccess(true);
      setTimeout(() => setInvoiceSuccess(false), 3000);
    } catch {
      setInvoiceError("Failed to update invoice number");
    } finally {
      setInvoiceSaving(false);
    }
  }

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
  const pl = useDbWac ? wacPlFromRow(tx) : plById.get(tx.id);
  const txRecord = {
    ...tx,
    status: (tx.status ?? "pending") as TransactionStatus,
    created_by: tx.created_by ?? null,
  };
  const showEdit = appUser ? canEditTransaction(appUser, txRecord) : false;

  return (
    <PageWrapper title={tx.invoice_number ?? `Transaction ${tx.id.slice(0, 8)}`}>
      <div className="rounded-lg border bg-card p-6 space-y-5">
        {/* ── Header row: invoice + badges ── */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            {/* Invoice number — admin can inline-edit */}
            <div className="flex items-center gap-2">
              {invoiceEditing && isAdmin ? (
                <div className="space-y-1">
                  <div className="flex gap-2">
                    <Input
                      value={invoiceDraft}
                      onChange={(e) => { setInvoiceDraft(e.target.value); setInvoiceError(null); }}
                      className="h-7 border-amber-400 font-mono text-sm focus-visible:ring-amber-400 w-48"
                      autoFocus
                    />
                    <Button size="sm" className="h-7 px-2.5" onClick={saveInvoiceNumber} disabled={invoiceSaving || !invoiceDraft.trim()}>
                      {invoiceSaving ? "…" : "Save"}
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 px-2.5" onClick={() => { setInvoiceEditing(false); setInvoiceError(null); }}>
                      Cancel
                    </Button>
                  </div>
                  {invoiceError && <p className="text-xs text-red-600">{invoiceError}</p>}
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    This action is logged in the audit trail.
                  </p>
                </div>
              ) : (
                <>
                  <span className="font-mono text-base font-semibold">
                    {tx.invoice_number ?? `#${tx.id.slice(0, 8)}`}
                  </span>
                  {isAdmin && (
                    <button
                      onClick={() => { setInvoiceDraft(tx.invoice_number ?? ""); setInvoiceEditing(true); setInvoiceError(null); }}
                      className="rounded p-0.5 text-amber-600 hover:bg-amber-50 hover:text-amber-800 dark:hover:bg-amber-950"
                      title="Edit invoice number (admin only)"
                    >
                      ✏️
                    </button>
                  )}
                  {invoiceSuccess && (
                    <span className="text-xs text-emerald-600">Updated ✓</span>
                  )}
                </>
              )}
            </div>

            {/* Type + status + date */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                className={cn(
                  tx.type === "BUY"
                    ? "bg-emerald-600 text-white hover:bg-emerald-600"
                    : "bg-amber-600 text-white hover:bg-amber-600"
                )}
              >
                {tx.type}
              </Badge>
              <TransactionStatusBadge status={(tx.status ?? "pending") as TransactionStatus} />
              <span className="font-mono text-sm text-muted-foreground">{tx.date}</span>
            </div>
          </div>

          {showEdit && (
            <Button asChild size="sm">
              <Link href={`/transactions/${tx.id}/edit`}>Edit</Link>
            </Button>
          )}
        </div>

        {tx.status === "rejected" && tx.rejection_reason && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
            <span className="font-medium">Rejection reason: </span>
            {tx.rejection_reason}
          </div>
        )}

        <div className="rounded-lg border divide-y text-sm">
          {[
            ["Client", clientName],
            ["Weight", tx.weight_grams != null ? `${tx.weight_grams.toLocaleString()} g` : "-"],
            ["Rate", tx.rate_per_gram != null ? `${tx.rate_per_gram.toLocaleString()} THB/g` : "-"],
            ["Amount", tx.amount_thb != null ? formatCurrency(tx.amount_thb, "THB", "th-TH") : "-"],
          ].map(([label, value]) => (
            <div key={label} className="flex items-start gap-4 px-4 py-3">
              <span className="w-36 shrink-0 text-muted-foreground">{label}</span>
              <span className="font-medium">{value}</span>
            </div>
          ))}
          <TransactionPlDetailBlock type={tx.type} pl={pl} />
          {[
            ["VAT", tx.vat_percent != null && tx.vat_percent > 0 ? `${tx.vat_percent}%` : "0%"],
            ["Notes", tx.notes ?? "-"],
          ].map(([label, value]) => (
            <div key={label} className="flex items-start gap-4 px-4 py-3">
              <span className="w-36 shrink-0 text-muted-foreground">{label}</span>
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
