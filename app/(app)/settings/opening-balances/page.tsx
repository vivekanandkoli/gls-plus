"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatCurrency } from "@/lib/utils";
import { useAppUser } from "@/hooks/use-app-user";

type Row = {
  year: number;
  book: "official" | "unofficial";
  opening_stock_gm: number;
  opening_wac: number;
  opening_stock_value_thb: number;
};

const baht = (n: number) => formatCurrency(Number(n) || 0, "THB", "th-TH");
const grams = (n: number) => `${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} g`;
const rate4 = (n: number) =>
  Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export default function OpeningBalancesPage() {
  const { isAdmin, loading: userLoading } = useAppUser();
  const now = new Date().getUTCFullYear();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // form
  const [book, setBook] = useState<"official" | "unofficial">("official");
  const [year, setYear] = useState<string>(String(now));
  const [stockGm, setStockGm] = useState<string>("");
  const [wac, setWac] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/opening-balances");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to load");
      setRows(d.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  // Prefill the form when a matching (year, book) row exists.
  useEffect(() => {
    const existing = rows.find((r) => r.book === book && String(r.year) === year);
    if (existing) {
      setStockGm(String(existing.opening_stock_gm));
      setWac(String(existing.opening_wac));
    }
  }, [rows, book, year]);

  const previewValue = useMemo(() => {
    const g = Number(stockGm) || 0;
    const w = Number(wac) || 0;
    return Math.round(g * w * 100) / 100;
  }, [stockGm, wac]);

  const isEditing = useMemo(
    () => rows.some((r) => r.book === book && String(r.year) === year),
    [rows, book, year]
  );

  async function save() {
    setSaving(true);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/opening-balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ book, year: Number(year), stockGm: Number(stockGm), wac: Number(wac) }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to save");
      setMsg(`Saved. ${book} ${year} opening set to ${grams(Number(stockGm))} @ ${rate4(Number(wac))} — WAC & profit for ${year} recomputed.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!userLoading && !isAdmin) {
    return (
      <PageWrapper title="Opening Balances" description="Admins only.">
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Only admins can view or edit opening balances.
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper
      title="Opening Balances"
      description="The opening stock each year's weighted-average cost starts from — per book. Editing one re-bases that whole year."
    >
      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
        Changing an opening balance re-computes the WAC and profit of <strong>every</strong> transaction in that
        book/year. Make sure the opening stock and rate match your records (usually last year&apos;s closing stock).
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {msg ? (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{msg}</div>
      ) : null}

      {/* Editor */}
      <Card className="mb-6">
        <CardContent className="p-5">
          <h3 className="mb-3 text-sm font-semibold">{isEditing ? "Edit opening balance" : "Add opening balance"}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-muted-foreground">
              Book
              <div className="mt-1 inline-flex w-full rounded-md border p-0.5">
                {(["official", "unofficial"] as const).map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBook(b)}
                    className={cn(
                      "flex-1 rounded-md px-2 py-1.5 text-sm capitalize transition-colors",
                      book === b ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </label>
            <label className="text-xs text-muted-foreground">
              Year
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="mt-1 w-full rounded-md border bg-card px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Opening stock (g)
              <input
                type="number"
                value={stockGm}
                onChange={(e) => setStockGm(e.target.value)}
                placeholder="624.9"
                className="mt-1 w-full rounded-md border bg-card px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Opening rate (THB/g)
              <input
                type="number"
                value={wac}
                onChange={(e) => setWac(e.target.value)}
                placeholder="4259"
                className="mt-1 w-full rounded-md border bg-card px-2 py-1.5 text-sm text-foreground"
              />
            </label>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              Opening stock value = {grams(Number(stockGm) || 0)} × {rate4(Number(wac) || 0)} ={" "}
              <span className="font-semibold text-foreground">{baht(previewValue)}</span>
            </div>
            <Button onClick={save} disabled={saving || !stockGm || !wac || !year}>
              {saving ? "Saving…" : isEditing ? "Update & recompute" : "Add & recompute"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Existing */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Year</TableHead>
                  <TableHead>Book</TableHead>
                  <TableHead className="text-right">Opening stock</TableHead>
                  <TableHead className="text-right">Opening rate</TableHead>
                  <TableHead className="text-right">Opening value</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No opening balances configured yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={`${r.book}-${r.year}`}>
                      <TableCell>{r.year}</TableCell>
                      <TableCell className="capitalize">{r.book}</TableCell>
                      <TableCell className="text-right tabular-nums">{grams(r.opening_stock_gm)}</TableCell>
                      <TableCell className="text-right tabular-nums">{rate4(r.opening_wac)}</TableCell>
                      <TableCell className="text-right tabular-nums">{baht(r.opening_stock_value_thb)}</TableCell>
                      <TableCell className="text-right">
                        <button
                          onClick={() => {
                            setBook(r.book);
                            setYear(String(r.year));
                            setStockGm(String(r.opening_stock_gm));
                            setWac(String(r.opening_wac));
                            if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          Edit
                        </button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
