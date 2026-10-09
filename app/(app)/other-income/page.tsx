"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Pencil, Plus, Trash2 } from "lucide-react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAppUser } from "@/hooks/use-app-user";
import { cn } from "@/lib/utils";

type Book = "official" | "unofficial";
type Kind = "income" | "expense";
type Row = {
  id: number;
  date: string;
  book: Book;
  kind: Kind;
  category: string;
  amount_thb: number | string;
  description: string | null;
};
type Totals = { income: number; expense: number; net: number };

const B = "฿";
const fmt = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n: number | string | null | undefined) => `${B}${fmt(n)}`;

const blankForm = () => ({
  id: null as number | null,
  date: new Date().toISOString().slice(0, 10),
  book: "unofficial" as Book,
  kind: "income" as Kind,
  category: "",
  amount_thb: "",
  description: "",
});

export default function OtherIncomePage() {
  const { isAdmin, loading: authLoading } = useAppUser();
  const now = new Date().getUTCFullYear();

  const [year, setYear] = useState<string>(String(now));
  const [book, setBook] = useState<"all" | Book>("all");
  const [kind, setKind] = useState<"all" | Kind>("all");
  const [q, setQ] = useState("");

  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<{ overall: Totals; byBook: Record<Book, Totals> }>({
    overall: { income: 0, expense: 0, net: 0 },
    byBook: { official: { income: 0, expense: 0, net: 0 }, unofficial: { income: 0, expense: 0, net: 0 } },
  });
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blankForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams();
      if (year) p.set("year", year);
      if (book !== "all") p.set("book", book);
      if (kind !== "all") p.set("kind", kind);
      if (q.trim()) p.set("q", q.trim());
      const res = await fetch(`/api/other-income?${p.toString()}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to load");
      setRows(d.rows ?? []);
      setTotals(d.totals ?? totals);
      setCategories(d.categories ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, book, kind, q]);

  useEffect(() => {
    if (!isAdmin) return;
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [isAdmin, load]);

  function openAdd() {
    setForm(blankForm());
    setSaveError(null);
    setOpen(true);
  }
  function openEdit(r: Row) {
    setForm({
      id: r.id,
      date: r.date,
      book: r.book,
      kind: r.kind,
      category: r.category,
      amount_thb: String(r.amount_thb ?? ""),
      description: r.description ?? "",
    });
    setSaveError(null);
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        date: form.date,
        book: form.book,
        kind: form.kind,
        category: form.category.trim(),
        amount_thb: form.amount_thb === "" ? NaN : Number(form.amount_thb),
        description: form.description,
      };
      const res = await fetch(form.id ? `/api/other-income/${form.id}` : "/api/other-income", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to save");
      setOpen(false);
      void load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function remove(r: Row) {
    if (typeof window !== "undefined" && !window.confirm(`Delete this ${r.kind} entry (${money(r.amount_thb)})?`)) return;
    try {
      const res = await fetch(`/api/other-income/${r.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed to delete");
      setRows((prev) => prev.filter((x) => x.id !== r.id));
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  function exportXlsx() {
    const p = new URLSearchParams();
    if (year) p.set("year", year);
    if (book !== "all") p.set("book", book);
    if (kind !== "all") p.set("kind", kind);
    if (q.trim()) p.set("q", q.trim());
    window.location.href = `/api/other-income/export?${p.toString()}`;
  }

  const net = totals.overall.net;
  const years = useMemo(() => {
    const arr: string[] = [];
    for (let y = now + 1; y >= now - 5; y--) arr.push(String(y));
    return arr;
  }, [now]);

  if (authLoading) {
    return <PageWrapper title="Other Income"><div className="text-sm text-muted-foreground">Loading…</div></PageWrapper>;
  }
  if (!isAdmin) {
    return (
      <PageWrapper title="Other Income">
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Admin access required.</div>
      </PageWrapper>
    );
  }

  const selectCls = "rounded-md border bg-background px-2 py-1.5 text-sm";

  return (
    <PageWrapper
      title="Other Income"
      description="Rental, consultant and other income (with related expenses), separate from gold trading. Net is added on top of trading profit."
    >
      {/* Totals */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Income</div>
          <div className="mt-1 text-xl font-semibold text-emerald-600">{money(totals.overall.income)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Expense</div>
          <div className="mt-1 text-xl font-semibold text-amber-700">{money(totals.overall.expense)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Net (added to profit)</div>
          <div className={cn("mt-1 text-xl font-semibold", net < 0 ? "text-red-600" : "text-foreground")}>{money(net)}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Official {money(totals.byBook.official.net)} · Unofficial {money(totals.byBook.unofficial.net)}
          </div>
        </CardContent></Card>
      </div>

      {/* Filters + actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select value={year} onChange={(e) => setYear(e.target.value)} className={selectCls} style={{ borderColor: "var(--border)" }}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={book} onChange={(e) => setBook(e.target.value as "all" | Book)} className={selectCls} style={{ borderColor: "var(--border)" }}>
          <option value="all">All books</option>
          <option value="official">Official</option>
          <option value="unofficial">Unofficial</option>
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value as "all" | Kind)} className={selectCls} style={{ borderColor: "var(--border)" }}>
          <option value="all">Income &amp; Expense</option>
          <option value="income">Income only</option>
          <option value="expense">Expense only</option>
        </select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search description…" className="w-48" />
        <div className="flex-1" />
        <Button variant="outline" onClick={exportXlsx} disabled={rows.length === 0}>
          <Download className="mr-1.5 h-4 w-4" /> Export
        </Button>
        <Button onClick={openAdd}>
          <Plus className="mr-1.5 h-4 w-4" /> Add entry
        </Button>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <Card className="mt-4">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Book</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Income</TableHead>
                  <TableHead className="text-right">Expense</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{r.date}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">{r.book}</TableCell>
                    <TableCell className="font-medium">{r.category}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-600">
                      {r.kind === "income" ? money(r.amount_thb) : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-amber-700">
                      {r.kind === "expense" ? money(r.amount_thb) : ""}
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate text-muted-foreground">{r.description ?? ""}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(r)} aria-label="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void remove(r)} aria-label="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      {loading ? "Loading…" : "No entries for this filter."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add / edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit entry" : "Add entry"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Date</span>
                <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Book (ledger)</span>
                <select value={form.book} onChange={(e) => setForm((f) => ({ ...f, book: e.target.value as Book }))} className={cn(selectCls, "h-9")} style={{ borderColor: "var(--border)" }}>
                  <option value="unofficial">Unofficial</option>
                  <option value="official">Official</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Type</span>
                <select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as Kind }))} className={cn(selectCls, "h-9")} style={{ borderColor: "var(--border)" }}>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Amount ({B})</span>
                <Input type="number" inputMode="decimal" value={form.amount_thb} onChange={(e) => setForm((f) => ({ ...f, amount_thb: e.target.value }))} placeholder="0.00" />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Category</span>
              <Input list="other-income-cats" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="Rental, Consultant, …" />
              <datalist id="other-income-cats">
                {categories.map((c) => <option key={c} value={c} />)}
                <option value="Rental" />
                <option value="Consultant" />
              </datalist>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Description (optional)</span>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </label>
            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving || !form.category.trim() || form.amount_thb === ""}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
