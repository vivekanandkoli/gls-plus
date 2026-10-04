"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Plus, Search } from "lucide-react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Entry = {
  id: number;
  date: string;
  description: string;
  job_id: string | null;
  received: number;
  expense: number;
  balance: number;
};
type View = { received: number; expense: number; count: number };
type TypeFilter = "all" | "received" | "expense";

const fmt = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Currency symbol for the tracker (Thai baht).
const CURRENCY = "฿";
const money = (n: number | string | null | undefined) => `${CURRENCY}${fmt(n)}`;

function monthRange(ym: string): { first: string; last: string } {
  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { first: `${ym}-01`, last: `${ym}-${String(lastDay).padStart(2, "0")}` };
}
const CURRENT_MONTH = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
})();

function useDebounce<T>(value: T, delay: number): T {
  const [dv, setDv] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return dv;
}

const blank = () => ({
  date: new Date().toISOString().slice(0, 10),
  description: "",
  jobId: "",
  received: "",
  expense: "",
});

export default function ExpensesPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [overallBalance, setOverallBalance] = useState(0);
  const [view, setView] = useState<View>({ received: 0, expense: 0, count: 0 });
  const [hasFilter, setHasFilter] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  // filters
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 300);
  const [type, setType] = useState<TypeFilter>("all");
  // Default to the current month so the owner lands on recent activity.
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [from, setFrom] = useState(monthRange(CURRENT_MONTH).first);
  const [to, setTo] = useState(monthRange(CURRENT_MONTH).last);

  const [addOpen, setAddOpen] = useState(false);
  const [formState, setFormState] = useState(blank());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<Entry | null>(null);

  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
      if (type !== "all") params.set("type", type);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/expenses?${params.toString()}`);
      const d = await res.json();
      if (res.ok) {
        setEntries(d.entries ?? []);
        setTotal(d.total ?? 0);
        setOverallBalance(Number(d.overallBalance) || 0);
        setView(d.view ?? { received: 0, expense: 0, count: 0 });
        setHasFilter(!!d.hasFilter);
      }
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQ, type, from, to]);

  useEffect(() => { setPage(0); }, [debouncedQ, type, from, to]);
  useEffect(() => { void load(); }, [load]);

  // Month quick-pick fills the from/to range.
  function onMonth(v: string) {
    setMonth(v);
    if (!v) { setFrom(""); setTo(""); return; }
    const [y, m] = v.split("-").map(Number);
    const first = `${v}-01`;
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    setFrom(first);
    setTo(last);
  }
  function clearFilters() {
    setQ(""); setType("all"); setMonth(""); setFrom(""); setTo("");
  }
  function exportCsv() {
    const p = new URLSearchParams();
    if (debouncedQ.trim()) p.set("q", debouncedQ.trim());
    if (type !== "all") p.set("type", type);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    window.location.href = `/api/expenses/export?${p.toString()}`;
  }

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: formState.date,
          description: formState.description,
          jobId: formState.jobId,
          received: Number(formState.received) || 0,
          expense: Number(formState.expense) || 0,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to add");
      setFormState(blank());
      setAddOpen(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    if (!edit) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/expenses/${edit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: edit.date,
          description: edit.description,
          jobId: edit.job_id ?? "",
          received: edit.received,
          expense: edit.expense,
        }),
      });
      if (res.ok) { setEdit(null); await load(); }
    } finally {
      setSaving(false);
    }
  }

  async function del(id: number) {
    if (!confirm("Delete this entry? The balance will be recalculated.")) return;
    const res = await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    if (res.ok) await load();
  }

  const net = view.received - view.expense;
  const typeBtn = (t: TypeFilter, label: string) => (
    <button
      type="button"
      onClick={() => setType(t)}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm transition-colors",
        type === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
      )}
    >
      {label}
    </button>
  );

  return (
    <PageWrapper title="Expense Tracker">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-primary/40">
          <CardHeader className="pb-1"><CardTitle className="text-xs">Current balance</CardTitle></CardHeader>
          <CardContent><div className={cn("text-xl font-bold tabular-nums", overallBalance < 0 ? "text-red-600" : "text-emerald-700")}>{money(overallBalance)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs">Received{hasFilter ? " (filtered)" : ""}</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold tabular-nums text-emerald-700">{money(view.received)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs">Expense{hasFilter ? " (filtered)" : ""}</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold tabular-nums text-red-600">{money(view.expense)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs">Net{hasFilter ? " (filtered)" : ""}</CardTitle></CardHeader>
          <CardContent><div className={cn("text-xl font-bold tabular-nums", net < 0 ? "text-red-600" : "text-emerald-700")}>{money(net)}</div></CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search description…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="inline-flex rounded-md border p-0.5" style={{ borderColor: "var(--border)" }}>
          {typeBtn("all", "All")}
          {typeBtn("received", "Received")}
          {typeBtn("expense", "Expense")}
        </div>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          Month
          <Input type="month" value={month} onChange={(e) => onMonth(e.target.value)} className="w-[150px]" />
        </label>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          From
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setMonth(""); }} className="w-[150px]" />
        </label>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          To
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setMonth(""); }} className="w-[150px]" />
        </label>
        {(q || type !== "all" || from || to) ? (
          <Button variant="outline" onClick={clearFilters}>Clear</Button>
        ) : null}
        <Button variant="outline" onClick={exportCsv} disabled={total === 0}>
          <Download className="mr-1.5 h-4 w-4" /> Export
        </Button>
        <Button onClick={() => { setFormState(blank()); setErr(null); setAddOpen(true); }}>
          <Plus className="mr-1.5 h-4 w-4" /> Add entry
        </Button>
      </div>

      {/* Ledger */}
      <Card className="mt-4">
        <CardContent className="p-0">
          <Table className="table-cards">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[90px]">Job ID</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Expense</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="w-[120px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{r.date}</TableCell>
                  <TableCell className="max-w-[320px] truncate">{r.description || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.job_id || ""}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-700">{Number(r.received) ? money(r.received) : ""}</TableCell>
                  <TableCell className="text-right tabular-nums text-red-600">{Number(r.expense) ? money(r.expense) : ""}</TableCell>
                  <TableCell className={cn("text-right tabular-nums font-medium", Number(r.balance) < 0 ? "text-red-600" : "")}>{money(r.balance)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setEdit({ ...r, received: Number(r.received), expense: Number(r.expense), balance: Number(r.balance) })}>Edit</Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground hover:text-red-600" onClick={() => del(r.id)}>Delete</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    {loading ? "Loading…" : "No entries found."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground" style={{ borderColor: "var(--border)" }}>
            <span>{total.toLocaleString()} entries{hasFilter ? " (filtered)" : ""}</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page === 0 || loading} onClick={() => setPage((p) => p - 1)}>← Prev</Button>
              <span className="px-2 text-xs">{page + 1} / {totalPages}</span>
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page >= totalPages - 1 || loading} onClick={() => setPage((p) => p + 1)}>Next →</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add entry</DialogTitle></DialogHeader>
          <form onSubmit={addEntry} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">Date
                <Input type="date" value={formState.date} onChange={(e) => setFormState({ ...formState, date: e.target.value })} required />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">Job ID (optional)
                <Input value={formState.jobId} onChange={(e) => setFormState({ ...formState, jobId: e.target.value })} />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Description
              <Input value={formState.description} onChange={(e) => setFormState({ ...formState, description: e.target.value })} placeholder="e.g. Taxi, Cash received…" />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">Received
                <Input type="number" step="0.01" value={formState.received} onChange={(e) => setFormState({ ...formState, received: e.target.value })} placeholder="0.00" />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">Expense
                <Input type="number" step="0.01" value={formState.expense} onChange={(e) => setFormState({ ...formState, expense: e.target.value })} placeholder="0.00" />
              </label>
            </div>
            {err ? <p className="text-sm text-red-600">{err}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Add"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit entry</DialogTitle></DialogHeader>
          {edit ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">Date
                  <Input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} />
                </label>
                <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">Job ID
                  <Input value={edit.job_id ?? ""} onChange={(e) => setEdit({ ...edit, job_id: e.target.value })} />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">Description
                <Input value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">Received
                  <Input type="number" step="0.01" value={edit.received} onChange={(e) => setEdit({ ...edit, received: Number(e.target.value) })} />
                </label>
                <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">Expense
                  <Input type="number" step="0.01" value={edit.expense} onChange={(e) => setEdit({ ...edit, expense: Number(e.target.value) })} />
                </label>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
                <Button onClick={saveEdit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
