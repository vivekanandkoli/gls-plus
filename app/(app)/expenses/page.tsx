"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";

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
type Summary = { total_received: number; total_expense: number; balance: number };

const fmt = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  const [summary, setSummary] = useState<Summary>({ total_received: 0, total_expense: 0, balance: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 300);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(blank());
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
      const res = await fetch(`/api/expenses?${params.toString()}`);
      const d = await res.json();
      if (res.ok) {
        setEntries(d.entries ?? []);
        setTotal(d.total ?? 0);
        setSummary(d.summary ?? { total_received: 0, total_expense: 0, balance: 0 });
      }
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQ]);

  useEffect(() => { setPage(0); }, [debouncedQ]);
  useEffect(() => { void load(); }, [load]);

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: form.date,
          description: form.description,
          jobId: form.jobId,
          received: Number(form.received) || 0,
          expense: Number(form.expense) || 0,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to add");
      setForm(blank());
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
      if (res.ok) {
        setEdit(null);
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function del(id: number) {
    if (!confirm("Delete this entry? The balance will be recalculated.")) return;
    const res = await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    if (res.ok) await load();
  }

  return (
    <PageWrapper
      title="Expense Tracker"
      description="A standalone cash ledger — received, expenses and running balance. Independent of the gold books."
    >
      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-primary/40">
          <CardHeader className="pb-1"><CardTitle className="text-sm">Current balance</CardTitle></CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold tabular-nums", summary.balance < 0 ? "text-red-600" : "text-emerald-700")}>
              {fmt(summary.balance)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm">Total received</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold tabular-nums text-emerald-700">{fmt(summary.total_received)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm">Total expense</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold tabular-nums text-red-600">{fmt(summary.total_expense)}</div></CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search description…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button onClick={() => { setForm(blank()); setErr(null); setAddOpen(true); }}>
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
                  <TableCell className="text-right tabular-nums text-emerald-700">{Number(r.received) ? fmt(r.received) : ""}</TableCell>
                  <TableCell className="text-right tabular-nums text-red-600">{Number(r.expense) ? fmt(r.expense) : ""}</TableCell>
                  <TableCell className={cn("text-right tabular-nums font-medium", Number(r.balance) < 0 ? "text-red-600" : "")}>{fmt(r.balance)}</TableCell>
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
            <span>{total.toLocaleString()} entries</span>
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
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">Date
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">Job ID (optional)
                <Input value={form.jobId} onChange={(e) => setForm({ ...form, jobId: e.target.value })} />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Description
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Taxi, Cash received…" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">Received
                <Input type="number" step="0.01" value={form.received} onChange={(e) => setForm({ ...form, received: e.target.value })} placeholder="0.00" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">Expense
                <Input type="number" step="0.01" value={form.expense} onChange={(e) => setForm({ ...form, expense: e.target.value })} placeholder="0.00" />
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
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">Date
                  <Input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">Job ID
                  <Input value={edit.job_id ?? ""} onChange={(e) => setEdit({ ...edit, job_id: e.target.value })} />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">Description
                <Input value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">Received
                  <Input type="number" step="0.01" value={edit.received} onChange={(e) => setEdit({ ...edit, received: Number(e.target.value) })} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">Expense
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
