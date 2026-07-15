"use client";

import { useCallback, useEffect, useState } from "react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAppUser } from "@/hooks/use-app-user";

type Book = "official" | "unofficial";
type Adjustment = { id: number; book: Book; date: string; delta_gm: number; reason: string; created_at: string };

export default function StockAdjustPage() {
  const { isAdmin, loading: userLoading } = useAppUser();
  const [book, setBook] = useState<Book>("unofficial");
  const [mode, setMode] = useState<"delta" | "set">("delta");
  const [grams, setGrams] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [rows, setRows] = useState<Adjustment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/stock/adjust");
      const data = await res.json();
      if (res.ok) setRows(data.adjustments as Adjustment[]);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  async function submit() {
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/stock/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ book, mode, grams: Number(grams), date, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setOkMsg(`Adjusted. New ${book} stock: ${data.newStockGm}g`);
      setGrams("");
      setReason("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (!userLoading && !isAdmin) {
    return (
      <PageWrapper title="Stock adjustment" description="Admin only.">
        <div className="rounded-md border border-border p-4 text-sm text-muted-foreground">
          Only admins can adjust stock.
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title="Stock adjustment" description="Correct a book's stock when the counted vault drifts from the calculated balance.">
      <div className="max-w-xl space-y-4 rounded-lg border border-border p-5">
        {error && <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
        {okMsg && <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">{okMsg}</div>}

        <div>
          <label className="mb-1 block text-sm font-medium">Book</label>
          <div className="flex gap-2">
            {(["unofficial", "official"] as Book[]).map((b) => (
              <button key={b} onClick={() => setBook(b)} className={cn("rounded-md border px-3 py-1.5 text-sm capitalize", book === b ? (b === "unofficial" ? "border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" : "border-primary bg-primary text-primary-foreground") : "border-border hover:bg-muted")}>
                {b === "unofficial" ? "🔒 Unofficial (vault)" : "Official"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Mode</label>
          <div className="flex gap-2">
            <button onClick={() => setMode("delta")} className={cn("rounded-md border px-3 py-1.5 text-sm", mode === "delta" ? "border-primary bg-muted font-medium" : "border-border hover:bg-muted")}>Add / remove (±g)</button>
            <button onClick={() => setMode("set")} className={cn("rounded-md border px-3 py-1.5 text-sm", mode === "set" ? "border-primary bg-muted font-medium" : "border-border hover:bg-muted")}>Set exact total</button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">{mode === "set" ? "Counted total (g)" : "Change (g, negative to remove)"}</label>
            <Input inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} placeholder={mode === "set" ? "e.g. 1044.9" : "e.g. -2.5"} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Reason</label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Physical count correction, shrinkage" />
        </div>

        <Button onClick={submit} disabled={busy || !grams || !reason}>
          {busy ? "Saving…" : "Record adjustment"}
        </Button>
      </div>

      <h2 className="mt-6 mb-2 text-sm font-medium">Recent adjustments</h2>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Book</th><th className="px-3 py-2 text-right">Change (g)</th><th className="px-3 py-2">Reason</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">No adjustments yet.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                  <td className="px-3 py-2 capitalize">{r.book}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", r.delta_gm >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600")}>{r.delta_gm >= 0 ? "+" : ""}{r.delta_gm}</td>
                  <td className="px-3 py-2">{r.reason}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PageWrapper>
  );
}
