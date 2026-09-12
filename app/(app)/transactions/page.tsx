"use client";

import { useCallback, useEffect, useState } from "react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { TransactionEditDialog } from "@/components/TransactionEditDialog";

type Row = {
  id: string;
  book: "official" | "unofficial";
  date: string;
  type: "BUY" | "SELL";
  invoice_number: string | null;
  weight_grams: number | null;
  rate_per_gram: number | null;
  amount_thb: number | null;
  payment_mode: string | null;
  status: string;
  profit_loss: number | null;
  client_name: string | null;
};

type Resp = { rows: Row[]; total: number; page: number; pageSize: number; years: number[] };

const baht = (n: number | null | undefined) => formatCurrency(Number(n) || 0, "THB", "th-TH");
const grams = (n: number | null | undefined) =>
  n == null ? "" : `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 3 })} g`;
const rate = (n: number | null | undefined) =>
  n == null ? "" : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });

const PAGE_SIZE = 50;

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { label: string; value: T }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg border bg-card p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1 text-sm font-medium transition",
            o.value === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function TransactionsPage() {
  const [book, setBook] = useState<"all" | "official" | "unofficial">("all");
  const [type, setType] = useState<"all" | "BUY" | "SELL">("all");
  const [year, setYear] = useState<string>("all");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // row editing
  const [editId, setEditId] = useState<string | null>(null);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [nonce, setNonce] = useState(0);

  // load clients once (for the edit dialog's picker)
  useEffect(() => {
    fetch("/api/clients/list")
      .then((r) => r.json())
      .then((d) => setClients(d.clients ?? []))
      .catch(() => {});
  }, []);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  // reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [book, type, year, qDebounced]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (book !== "all") params.set("book", book);
    if (type !== "all") params.set("type", type);
    if (year !== "all") params.set("year", year);
    if (qDebounced) params.set("q", qDebounced);
    let active = true;
    fetch(`/api/transactions/list?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch((e) => active && setError(String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [book, type, year, qDebounced, page, nonce]);

  useEffect(() => {
    const cleanup = load();
    return cleanup;
  }, [load]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = data?.rows ?? [];
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <PageWrapper title="Transactions" description="Browse both ledgers: official (declared) and unofficial (real vault).">
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          value={book}
          onChange={setBook}
          options={[
            { label: "All books", value: "all" },
            { label: "Official", value: "official" },
            { label: "Unofficial", value: "unofficial" },
          ]}
        />
        <Segmented
          value={type}
          onChange={setType}
          options={[
            { label: "All", value: "all" },
            { label: "Buy", value: "BUY" },
            { label: "Sell", value: "SELL" },
          ]}
        />
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="rounded-lg border bg-card px-3 py-1.5 text-sm"
        >
          <option value="all">All years</option>
          {(data?.years ?? []).map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search invoice or client…"
          className="min-w-[220px] flex-1 rounded-lg border bg-card px-3 py-1.5 text-sm"
        />
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Book</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead className="text-right">Weight</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && !data ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={10}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                      No transactions match these filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow
                      key={r.id}
                      onClick={() => setEditId(r.id)}
                      className="cursor-pointer hover:bg-muted/50"
                    >
                      <TableCell className="whitespace-nowrap">{formatDate(r.date, "dd MMM yyyy")}</TableCell>
                      <TableCell>
                        <Badge variant={r.book === "unofficial" ? "secondary" : "outline"}>{r.book}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate">{r.client_name ?? ""}</TableCell>
                      <TableCell>
                        <span className={cn("font-medium", r.type === "BUY" ? "text-emerald-600" : "text-amber-700")}>
                          {r.type}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.invoice_number ?? ""}</TableCell>
                      <TableCell className="text-right tabular-nums">{grams(r.weight_grams)}</TableCell>
                      <TableCell className="text-right tabular-nums">{rate(r.rate_per_gram)}</TableCell>
                      <TableCell className="text-right tabular-nums">{baht(r.amount_thb)}</TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          r.profit_loss != null && (r.profit_loss >= 0 ? "text-emerald-600" : "text-red-600")
                        )}
                      >
                        {r.type === "SELL" && r.profit_loss != null ? baht(r.profit_loss) : ""}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"
                          }
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {rangeStart}–{rangeEnd} of {total.toLocaleString()} transactions
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-md border px-3 py-1 disabled:opacity-40"
          >
            Prev
          </button>
          <span>
            Page {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-md border px-3 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      {editId ? (
        <TransactionEditDialog
          id={editId}
          clients={clients}
          onClose={() => setEditId(null)}
          onSaved={() => {
            setEditId(null);
            setNonce((n) => n + 1);
          }}
        />
      ) : null}
    </PageWrapper>
  );
}
