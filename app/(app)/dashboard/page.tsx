"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { TransactionFormDialog } from "@/components/TransactionFormDialog";
import { useAppUser } from "@/hooks/use-app-user";

type BookSummary = {
  book: "official" | "unofficial";
  year: number;
  stockGm: number;
  wac: number;
  stockValueThb: number;
  physicalStockGm: number;
  adjustmentGm: number;
  buyWeight: number;
  sellWeight: number;
  buyValue: number;
  sellValue: number;
  txnCount: number;
  profit: number;
};

type RecentTx = {
  id: string;
  book: "official" | "unofficial";
  date: string;
  type: "BUY" | "SELL";
  invoice_number: string | null;
  weight_grams: number | null;
  rate_per_gram: number | null;
  amount_thb: number | null;
  status: string;
  client_name: string | null;
};

type Overview = {
  year: number;
  years: number[];
  books: { official: BookSummary; unofficial: BookSummary };
  recent: RecentTx[];
};

const baht = (n: number | null | undefined) =>
  formatCurrency(Number(n) || 0, "THB", "th-TH");
const grams = (n: number | null | undefined) =>
  `${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} g`;
const rate = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "pos" | "neg";
}) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 text-lg font-semibold tabular-nums",
          tone === "pos" && "text-emerald-600",
          tone === "neg" && "text-red-600"
        )}
      >
        {value}
      </div>
      {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function BookCard({
  title,
  subtitle,
  accent,
  s,
}: {
  title: string;
  subtitle: string;
  accent: string;
  s: BookSummary;
}) {
  const empty = s.txnCount === 0;
  return (
    <Card className="overflow-hidden">
      <CardHeader className={cn("border-b", accent)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge variant="outline">{s.txnCount} txns · {s.year}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="pt-4">
        {empty ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No transactions in this book for {s.year}.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat
              label="Current stock"
              value={grams(s.stockGm)}
              sub={s.adjustmentGm ? `incl. ${grams(s.adjustmentGm)} adj → ${grams(s.physicalStockGm)}` : undefined}
              tone={s.stockGm < 0 ? "neg" : undefined}
            />
            <Stat label="Live WAC" value={`${rate(s.wac)}`} sub="THB / g" />
            <Stat label="Stock value" value={baht(s.stockValueThb)} />
            <Stat label="Bought" value={grams(s.buyWeight)} sub={baht(s.buyValue)} />
            <Stat label="Sold" value={grams(s.sellWeight)} sub={baht(s.sellValue)} />
            <Stat
              label="WAC profit"
              value={baht(s.profit)}
              tone={s.profit >= 0 ? "pos" : "neg"}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { isAdmin } = useAppUser();
  const [year, setYear] = useState<number | null>(null);
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // row editing / creation (shared dialog)
  const [editId, setEditId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    fetch("/api/clients/list")
      .then((r) => r.json())
      .then((d) => setClients(d.clients ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const q = year ? `?year=${year}` : "";
    fetch(`/api/dashboard/overview${q}`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        if (d.error) setError(d.error);
        else {
          setData(d);
          if (year === null) setYear(d.year);
        }
      })
      .catch((e) => active && setError(String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [year, nonce]);

  const off = data?.books.official;
  const unoff = data?.books.unofficial;

  return (
    <PageWrapper
      title="Dashboard"
      description="Two independent ledgers: the real vault (unofficial) and the declared book (official)."
    >
      {/* Year selector */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Year</span>
        <div className="flex gap-1 rounded-lg border bg-card p-1">
          {(data?.years ?? []).map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium transition",
                y === (year ?? data?.year)
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {y}
            </button>
          ))}
        </div>
        <Button className="ml-auto" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          New transaction
        </Button>
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading && !data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {unoff ? (
              <BookCard
                title="Unofficial - Real Vault"
                subtitle="The truth: every real trade (cash). This is the owner's actual stock & P/L."
                accent="bg-amber-50/60"
                s={unoff}
              />
            ) : null}
            {off ? (
              <BookCard
                title="Official - Declared Book"
                subtitle="The declared-for-tax view (any payment mode). For CA / audit only."
                accent="bg-sky-50/60"
                s={off}
              />
            ) : null}
          </div>

          {/* Reconciliation */}
          {off && unoff ? (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-sm">Reconciliation - real vs declared</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Stat label="Official (declared)" value={grams(off.physicalStockGm)} tone={off.physicalStockGm < 0 ? "neg" : undefined} />
                  <Stat label="Actual stock (official + unofficial)" value={grams(off.physicalStockGm + unoff.physicalStockGm)} tone="pos" />
                  <Stat label="Actual P/L" value={baht(unoff.profit)} tone={unoff.profit >= 0 ? "pos" : "neg"} />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Actual physical stock = official + unofficial. Official stays as declared; the real vault is the undeclared balance.
                  </p>
                  <Link href="/stock" className="text-xs font-medium text-primary hover:underline">
                    {isAdmin ? "Adjust real stock →" : "Request stock update →"}
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* Recent transactions */}
          <Card className="mt-4">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-sm">Recent transactions · {year}</CardTitle>
              <div className="flex items-center gap-3">
                <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
                  <Plus className="size-4" />
                  New
                </Button>
                <Link href="/transactions" className="text-sm text-primary hover:underline">
                  View all
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {/* Mobile: tap-friendly card list */}
              <div className="md:hidden">
                {(data?.recent ?? []).length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No transactions found.{" "}
                    <button onClick={() => setCreating(true)} className="text-primary hover:underline">
                      Add the first one
                    </button>
                    .
                  </div>
                ) : (
                  <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                    {(data?.recent ?? []).map((t) => (
                      <li key={t.id}>
                        <button
                          onClick={() => setEditId(t.id)}
                          className="flex w-full items-center justify-between gap-3 py-3 text-left active:bg-muted/50"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={cn("text-sm font-semibold", t.type === "BUY" ? "text-emerald-600" : "text-amber-700")}>
                                {t.type}
                              </span>
                              <span className="truncate text-sm font-medium text-foreground">{t.client_name || "—"}</span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{formatDate(t.date, "dd MMM yyyy")}</span>
                              <span aria-hidden>·</span>
                              <Badge variant={t.book === "unofficial" ? "secondary" : "outline"} className="h-4 px-1.5 text-[10px]">
                                {t.book}
                              </Badge>
                            </div>
                            {t.invoice_number ? (
                              <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{t.invoice_number}</div>
                            ) : null}
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-sm font-semibold tabular-nums">{baht(t.amount_thb)}</div>
                            <div className="text-xs tabular-nums text-muted-foreground">
                              {grams(t.weight_grams)} · {rate(t.rate_per_gram)}
                            </div>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Desktop: full table */}
              <div className="hidden md:block overflow-x-auto">
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.recent ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                          No transactions found.{" "}
                          <button
                            onClick={() => setCreating(true)}
                            className="text-primary hover:underline"
                          >
                            Add the first one
                          </button>
                          .
                        </TableCell>
                      </TableRow>
                    ) : (
                      (data?.recent ?? []).map((t) => (
                        <TableRow
                          key={t.id}
                          onClick={() => setEditId(t.id)}
                          className="cursor-pointer hover:bg-muted/50"
                        >
                          <TableCell className="whitespace-nowrap">{formatDate(t.date, "dd MMM yyyy")}</TableCell>
                          <TableCell>
                            <Badge variant={t.book === "unofficial" ? "secondary" : "outline"}>
                              {t.book}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[160px] truncate">{t.client_name ?? ""}</TableCell>
                          <TableCell>
                            <span className={cn("font-medium", t.type === "BUY" ? "text-emerald-600" : "text-amber-700")}>
                              {t.type}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{t.invoice_number ?? ""}</TableCell>
                          <TableCell className="text-right tabular-nums">{grams(t.weight_grams)}</TableCell>
                          <TableCell className="text-right tabular-nums">{rate(t.rate_per_gram)}</TableCell>
                          <TableCell className="text-right tabular-nums">{baht(t.amount_thb)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {editId || creating ? (
        <TransactionFormDialog
          id={editId}
          clients={clients}
          onClose={() => {
            setEditId(null);
            setCreating(false);
          }}
          onSaved={() => {
            setEditId(null);
            setCreating(false);
            setNonce((n) => n + 1);
          }}
        />
      ) : null}
    </PageWrapper>
  );
}
