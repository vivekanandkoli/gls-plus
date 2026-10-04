"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAppUser } from "@/hooks/use-app-user";
import { cn } from "@/lib/utils";

type Adj = {
  id: number;
  book: "official" | "unofficial";
  date: string;
  delta_gm: number;
  reason: string;
  created_at: string;
};
type BookData = {
  book: "official" | "unofficial";
  currentStockGm: number;
  wacStockGm: number;
  adjustmentGm: number;
  adjustments: Adj[];
};

const gm = (n: number | null | undefined) =>
  `${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} g`;

export default function StockPage() {
  const router = useRouter();
  const { isAdmin, loading: authLoading } = useAppUser();

  const [official, setOfficial] = useState<BookData | null>(null);
  const [unofficial, setUnofficial] = useState<BookData | null>(null);
  const [loading, setLoading] = useState(true);

  const [grams, setGrams] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace("/dashboard");
  }, [authLoading, isAdmin, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, u] = await Promise.all([
        fetch("/api/stock/adjust?book=official").then((r) => r.json()),
        fetch("/api/stock/adjust?book=unofficial").then((r) => r.json()),
      ]);
      setOfficial(o);
      setUnofficial(u);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const officialStock = official?.currentStockGm ?? 0;
  const actual = officialStock + (unofficial?.currentStockGm ?? 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      // The owner enters the ACTUAL total; the undeclared portion we store is
      // actual − official, so Actual = official + unofficial lands on the input.
      const target = Math.round((Number(grams) - officialStock) * 1000) / 1000;
      const res = await fetch("/api/stock/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ book: "unofficial", mode: "set", grams: target, date, reason }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to save");
      setMsg(`Saved. Actual stock is now ${gm(Number(grams))}.`);
      setGrams("");
      setReason("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function del(id: number) {
    if (!confirm("Delete this adjustment? Stock will be recalculated.")) return;
    const res = await fetch(`/api/stock/adjust?id=${id}`, { method: "DELETE" });
    if (res.ok) await load();
  }

  if (authLoading || !isAdmin) {
    return (
      <PageWrapper title="Real stock">
        <p className="text-sm text-muted-foreground">Checking access…</p>
      </PageWrapper>
    );
  }

  const history = [
    ...(unofficial?.adjustments ?? []),
    ...(official?.adjustments ?? []),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  return (
    <PageWrapper
      title="Real stock"
      description="Adjust the real vault (unofficial) stock. Actual = official + unofficial; official is unchanged."
    >
      {/* Totals */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm">Official (declared)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold tabular-nums">{loading ? "…" : gm(officialStock)}</div></CardContent>
        </Card>
        <Card className="border-primary/40">
          <CardHeader className="pb-1"><CardTitle className="text-sm">Actual (official + unofficial)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold tabular-nums text-primary">{loading ? "…" : gm(actual)}</div></CardContent>
        </Card>
      </div>

      {/* Adjust form */}
      <Card className="mt-4">
        <CardHeader><CardTitle className="text-sm">Adjust stock</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Actual total stock in vault (grams)</span>
              <Input type="number" step="0.001" value={grams} onChange={(e) => setGrams(e.target.value)} required placeholder="Actual counted grams" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Date</span>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
            {(() => {
              const entered = grams === "" ? null : Number(grams);
              if (entered == null || !Number.isFinite(entered)) return null;
              const undeclared = Math.round((entered - officialStock) * 1000) / 1000;
              return (
                <div className="sm:col-span-2 rounded-md border bg-muted/40 px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
                  Official (declared): <strong>{gm(officialStock)}</strong> · setting Actual to{" "}
                  <strong>{gm(entered)}</strong> → undeclared portion recorded ={" "}
                  <strong className={undeclared >= 0 ? "text-emerald-700" : "text-red-700"}>
                    {undeclared >= 0 ? "+" : ""}{gm(undeclared)}
                  </strong>
                  {undeclared < 0 ? " (actual is below declared)" : ""}
                </div>
              );
            })()}
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs font-medium text-muted-foreground">Reason</span>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} required placeholder="e.g. Physical count correction, added vault stock…" />
            </label>
            {err ? <p className="text-sm text-red-600 sm:col-span-2">{err}</p> : null}
            {msg ? <p className="text-sm text-emerald-700 sm:col-span-2">{msg}</p> : null}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save adjustment"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* History */}
      <Card className="mt-4">
        <CardHeader><CardTitle className="text-sm">Adjustment history</CardTitle></CardHeader>
        <CardContent className="p-0">
          {history.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No adjustments yet.</p>
          ) : (
            <ul className="divide-y px-4" style={{ borderColor: "var(--border)" }}>
              {history.map((a) => (
                <li key={`${a.book}-${a.id}`} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="text-sm">
                      <span className={cn("font-semibold tabular-nums", a.delta_gm >= 0 ? "text-emerald-700" : "text-red-700")}>
                        {a.delta_gm >= 0 ? "+" : ""}{gm(a.delta_gm)}
                      </span>
                      <span className="ml-1 text-xs text-muted-foreground">to the real vault</span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{a.date} · {a.reason}</div>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-red-600" onClick={() => del(a.id)}>
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
