"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { TransactionStatusBadge } from "@/components/transactions/TransactionStatusBadge";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase";
import { useAppUser } from "@/hooks/use-app-user";

type Book = "official" | "unofficial";
type TxnStatus = "pending" | "approved" | "rejected";

type Txn = {
  id: string;
  book: Book;
  date: string;
  type: "BUY" | "SELL";
  client_id: string | null;
  weight_grams: number;
  rate_per_gram: number;
  amount_thb: number;
  payment_mode: string;
  invoice_number: string | null;
  status: TxnStatus;
  profit_loss: number | null;
};

const BOOK_FILTERS: { value: Book | "all"; label: string; adminOnly?: boolean }[] = [
  { value: "all", label: "All" },
  { value: "official", label: "Official" },
  { value: "unofficial", label: "Unofficial", adminOnly: true },
];

const STATUS_FILTERS: (TxnStatus | "all")[] = ["all", "pending", "approved", "rejected"];

export default function TransactionsPage() {
  const searchParams = useSearchParams();
  const { isAdmin } = useAppUser();

  const initialBook = (searchParams.get("book") as Book | null) ?? "all";
  const [bookFilter, setBookFilter] = useState<Book | "all">(initialBook);
  const [statusFilter, setStatusFilter] = useState<TxnStatus | "all">("all");
  const [rows, setRows] = useState<Txn[]>([]);
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ pageSize: "100" });
      if (bookFilter !== "all") params.set("book", bookFilter);
      if (isAdmin && statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/transactions?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setRows(data.transactions as Txn[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load transactions");
    } finally {
      setLoading(false);
    }
  }, [bookFilter, statusFilter, isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  // Client id → name map for display.
  useEffect(() => {
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabaseClient() as any;
      const { data } = await supabase.from("clients").select("id,name").limit(1000);
      const map: Record<string, string> = {};
      for (const c of data ?? []) map[c.id] = c.name;
      setClientNames(map);
    })();
  }, []);

  async function act(id: string, action: "approve" | "reject" | "delete") {
    setBusyId(id);
    setError(null);
    try {
      let res: Response;
      if (action === "delete") {
        res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
      } else if (action === "reject") {
        const reason = window.prompt("Reason for rejection (optional):") ?? "";
        res = await fetch(`/api/transactions/${id}/reject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        });
      } else {
        res = await fetch(`/api/transactions/${id}/approve`, { method: "POST" });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `${action} failed`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : `${action} failed`);
    } finally {
      setBusyId(null);
    }
  }

  const bookFilters = useMemo(
    () => BOOK_FILTERS.filter((f) => !f.adminOnly || isAdmin),
    [isAdmin]
  );

  return (
    <PageWrapper
      title="Transactions"
      description="Gold buys and sells across the official (tax) and unofficial (vault) books."
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {bookFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setBookFilter(f.value)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm transition-colors",
                bookFilter === f.value
                  ? f.value === "unofficial"
                    ? "border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                    : "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button asChild>
          <Link href="/transactions/new">+ New transaction</Link>
        </Button>
      </div>

      {isAdmin && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Status:</span>
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "rounded-md border px-2.5 py-1 capitalize transition-colors",
                statusFilter === s ? "border-primary bg-muted font-medium" : "border-border hover:bg-muted"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Invoice</th>
              <th className="px-3 py-2">Book</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2 text-right">Weight</th>
              <th className="px-3 py-2 text-right">Rate</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-right">Profit</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">
                  No transactions yet.
                </td>
              </tr>
            ) : (
              rows.map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="whitespace-nowrap px-3 py-2">{t.date}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{t.invoice_number ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-xs",
                        t.book === "unofficial"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                          : "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300"
                      )}
                    >
                      {t.book === "unofficial" ? "Unofficial" : "Official"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn("font-medium", t.type === "BUY" ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400")}>
                      {t.type}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{t.client_id ? clientNames[t.client_id] ?? "—" : "—"}</td>
                  <td className="px-3 py-2 text-right">{t.weight_grams}g</td>
                  <td className="px-3 py-2 text-right">{t.rate_per_gram}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(t.amount_thb, "THB", "th-TH")}</td>
                  <td className="px-3 py-2 text-right">
                    {t.type === "SELL" && t.profit_loss != null ? (
                      <span className={t.profit_loss >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}>
                        {formatCurrency(t.profit_loss, "THB", "th-TH")}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <TransactionStatusBadge status={t.status} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <div className="flex items-center gap-1">
                      {isAdmin && t.status === "pending" && (
                        <>
                          <Button size="sm" variant="outline" disabled={busyId === t.id} onClick={() => act(t.id, "approve")}>
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" disabled={busyId === t.id} onClick={() => act(t.id, "reject")}>
                            Reject
                          </Button>
                        </>
                      )}
                      {isAdmin && (
                        <Button size="sm" variant="ghost" disabled={busyId === t.id} onClick={() => act(t.id, "delete")}>
                          Delete
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PageWrapper>
  );
}
