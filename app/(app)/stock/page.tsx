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

  const [book, setBook] = useState<"unofficial" | "official">("unofficial");
  const [mode, setMode] = useState<"set" | "delta">("set");
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

  const actual = (official?.currentStockGm ?? 0) + (unofficial?.currentStockGm ?? 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/stock/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ book, mode, grams: Number(grams), date, reason }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to save");
      setMsg(`Saved. ${book === "unofficial" ? "Real vault" : "Official"} stock is now ${gm(d.currentStockGm)}.`);
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

  const selectCls =
    "w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <PageWrapper
      title="Real stock"
      description="Adjust the real vault (unofficial) stock. Actual = official + unofficial; official is unchanged."
    >
      {/* Totals */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm">Official (declared)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold tabular-nums">{loading ? "…" : gm(official?.currentStockGm)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm">Unofficial (real vault)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{loading ? "…" : gm(unofficial?.currentStockGm)}</div>
            {unofficial?.adjustmentGm ? (
              <div className="text-xs text-muted-foreground">incl. {gm(unofficial.adjustmentGm)} adjustments</div>
            ) : null}
          </CardContent>
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
              <span className="text-xs font-medium text-muted-foreground">Book</span>
              <select className={selectCls} value={book} onChange={(e) => setBook(e.target.value as "unofficial" | "official")}>
                <option value="unofficial">Unofficial (real vault)</option>
                <option value="official">Official (declared)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Mode</span>
              <select className={selectCls} value={mode} onChange={(e) => setMode(e.target.value as "set" | "delta")}>
                <option value="set">Set stock to…</option>
                <option value="delta">Adjust by (+/−)…</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                {mode === "set" ? "New stock (grams)" : "Change (grams, use − to reduce)"}
              </span>
              <Input type="number" step="0.001" value={grams} onChange={(e) => setGrams(e.target.value)} required />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Date</span>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
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
                    <div className="flex items-center gap-2 text-sm">
                      <span className={cn("font-semibold tabular-nums", a.delta_gm >= 0 ? "text-emerald-700" : "text-red-700")}>
                        {a.delta_gm >= 0 ? "+" : ""}{gm(a.delta_gm)}
                      </span>
                      <span className="rounded-full border px-1.5 text-[10px] uppercase text-muted-foreground" style={{ borderColor: "var(--border)" }}>
                        {a.book}
                      </span>
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
