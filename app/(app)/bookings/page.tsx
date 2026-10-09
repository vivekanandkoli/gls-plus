"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CalendarClock, Plus } from "lucide-react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";

type Book = "official" | "unofficial";
type TType = "BUY" | "SELL";
type Status = "pending" | "delivered" | "cancelled";
type Booking = {
  id: string;
  book: Book;
  type: TType;
  client_id: string | null;
  clientName: string | null;
  weight_grams: number;
  rate_per_gram: number;
  amount_thb: number | null;
  booking_date: string;
  expected_delivery_date: string | null;
  status: Status;
  converted_txn_id: string | null;
  notes: string | null;
  cancelled_reason: string | null;
};
type ClientLite = { id: string; name: string };

const B = "฿";
const fmt = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const g = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 3 });

const STATUS_STYLE: Record<Status, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  delivered: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

const blankForm = () => ({
  book: "unofficial" as Book,
  type: "SELL" as TType,
  clientId: "",
  weightGrams: "",
  ratePerGram: "",
  bookingDate: new Date().toISOString().slice(0, 10),
  expectedDeliveryDate: "",
  notes: "",
});

function BookingsInner() {
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<"all" | Status>("pending");
  const [book, setBook] = useState<"all" | Book>("all");
  const [type, setType] = useState<"all" | TType>("all");

  const [rows, setRows] = useState<Booking[]>([]);
  const [committed, setCommitted] = useState<{ buy: number; sell: number }>({ buy: 0, sell: 0 });
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create / edit dialog
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(blankForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Convert dialog
  const [convert, setConvert] = useState<Booking | null>(null);
  const [cvForm, setCvForm] = useState({ weightGrams: "", ratePerGram: "", date: "" });
  const [converting, setConverting] = useState(false);
  const [cvError, setCvError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams();
      if (status !== "all") p.set("status", status);
      if (book !== "all") p.set("book", book);
      if (type !== "all") p.set("type", type);
      const res = await fetch(`/api/bookings?${p.toString()}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to load");
      setRows(d.rows ?? []);
      setCommitted(d.committed ?? { buy: 0, sell: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [status, book, type]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/clients/list");
        const d = await res.json();
        if (res.ok) setClients((d.clients ?? d ?? []).map((c: ClientLite) => ({ id: c.id, name: c.name })));
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    if (searchParams.get("new") === "1") openAdd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function openAdd() {
    setEditId(null);
    setForm(blankForm());
    setSaveError(null);
    setOpen(true);
  }
  function openEdit(b: Booking) {
    setEditId(b.id);
    setForm({
      book: b.book, type: b.type, clientId: b.client_id ?? "",
      weightGrams: String(b.weight_grams ?? ""), ratePerGram: String(b.rate_per_gram ?? ""),
      bookingDate: b.booking_date, expectedDeliveryDate: b.expected_delivery_date ?? "",
      notes: b.notes ?? "",
    });
    setSaveError(null);
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        book: form.book, type: form.type, clientId: form.clientId || null,
        weightGrams: form.weightGrams === "" ? NaN : Number(form.weightGrams),
        ratePerGram: form.ratePerGram === "" ? NaN : Number(form.ratePerGram),
        bookingDate: form.bookingDate, expectedDeliveryDate: form.expectedDeliveryDate || null,
        notes: form.notes,
      };
      const res = await fetch(editId ? `/api/bookings/${editId}` : "/api/bookings", {
        method: editId ? "PATCH" : "POST",
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

  function openConvert(b: Booking) {
    setConvert(b);
    setCvForm({
      weightGrams: String(b.weight_grams ?? ""),
      ratePerGram: String(b.rate_per_gram ?? ""),
      date: b.expected_delivery_date || new Date().toISOString().slice(0, 10),
    });
    setCvError(null);
  }
  async function doConvert() {
    if (!convert) return;
    setConverting(true);
    setCvError(null);
    try {
      const res = await fetch(`/api/bookings/${convert.id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weightGrams: cvForm.weightGrams === "" ? undefined : Number(cvForm.weightGrams),
          ratePerGram: cvForm.ratePerGram === "" ? undefined : Number(cvForm.ratePerGram),
          date: cvForm.date,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to convert");
      setConvert(null);
      void load();
    } catch (e) {
      setCvError(e instanceof Error ? e.message : "Failed to convert");
    } finally {
      setConverting(false);
    }
  }

  async function cancelBooking(b: Booking) {
    if (typeof window === "undefined") return;
    const reason = window.prompt(`Cancel this ${b.type} booking? Optional reason:`, "");
    if (reason === null) return; // user hit cancel on the prompt
    try {
      const res = await fetch(`/api/bookings/${b.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to cancel");
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel");
    }
  }

  async function removeBooking(b: Booking) {
    if (typeof window !== "undefined" && !window.confirm("Delete this booking record permanently?")) return;
    try {
      const res = await fetch(`/api/bookings/${b.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed to delete");
      setRows((prev) => prev.filter((x) => x.id !== b.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  const selectCls = "rounded-md border bg-background px-2 py-1.5 text-sm";
  const amt = useMemo(() => {
    const w = Number(form.weightGrams) || 0;
    const r = Number(form.ratePerGram) || 0;
    return w && r ? w * r : 0;
  }, [form.weightGrams, form.ratePerGram]);

  return (
    <PageWrapper
      title="Bookings"
      description="Advance BUY/SELL bookings. A booking just reserves the terms — it affects nothing until you convert it into a transaction on delivery."
    >
      {/* Committed summary */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Committed BUY (pending)</div>
          <div className="mt-1 text-xl font-semibold text-emerald-600">{g(committed.buy)} g</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Committed SELL (pending)</div>
          <div className="mt-1 text-xl font-semibold text-amber-700">{g(committed.sell)} g</div>
        </CardContent></Card>
      </div>

      {/* Filters + action */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value as "all" | Status)} className={selectCls} style={{ borderColor: "var(--border)" }}>
          <option value="pending">Pending</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
          <option value="all">All statuses</option>
        </select>
        <select value={book} onChange={(e) => setBook(e.target.value as "all" | Book)} className={selectCls} style={{ borderColor: "var(--border)" }}>
          <option value="all">All books</option>
          <option value="official">Official</option>
          <option value="unofficial">Unofficial</option>
        </select>
        <select value={type} onChange={(e) => setType(e.target.value as "all" | TType)} className={selectCls} style={{ borderColor: "var(--border)" }}>
          <option value="all">Buy &amp; Sell</option>
          <option value="BUY">Buy</option>
          <option value="SELL">Sell</option>
        </select>
        <div className="flex-1" />
        <Button onClick={openAdd}><Plus className="mr-1.5 h-4 w-4" /> New booking</Button>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <Card className="mt-4">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Booked</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead>Book</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Weight</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="whitespace-nowrap">{b.booking_date}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{b.expected_delivery_date ?? "-"}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">{b.book}</TableCell>
                    <TableCell className={cn("font-medium", b.type === "BUY" ? "text-emerald-600" : "text-amber-700")}>{b.type}</TableCell>
                    <TableCell className="max-w-[140px] truncate">{b.clientName ?? "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">{g(b.weight_grams)} g</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(b.rate_per_gram)}</TableCell>
                    <TableCell className="text-right tabular-nums">{B}{fmt(b.amount_thb)}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_STYLE[b.status]}>{b.status}</Badge>
                      {b.status === "delivered" && b.converted_txn_id ? (
                        <Link href={`/transactions/${b.converted_txn_id}`} className="ml-2 text-xs text-primary underline-offset-2 hover:underline">
                          view txn
                        </Link>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      {b.status === "pending" ? (
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" onClick={() => openConvert(b)}>Convert</Button>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(b)}>Edit</Button>
                          <Button size="sm" variant="ghost" onClick={() => void cancelBooking(b)}>Cancel</Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void removeBooking(b)}>Delete</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                      {loading ? "Loading…" : "No bookings for this filter."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create / edit booking */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Edit booking" : "New booking"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Book (ledger)</span>
                <select value={form.book} onChange={(e) => setForm((f) => ({ ...f, book: e.target.value as Book }))} className={cn(selectCls, "h-9")} style={{ borderColor: "var(--border)" }}>
                  <option value="unofficial">Unofficial</option>
                  <option value="official">Official</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Type</span>
                <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as TType }))} className={cn(selectCls, "h-9")} style={{ borderColor: "var(--border)" }}>
                  <option value="SELL">Sell</option>
                  <option value="BUY">Buy</option>
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Client (optional)</span>
              <select value={form.clientId} onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))} className={cn(selectCls, "h-9")} style={{ borderColor: "var(--border)" }}>
                <option value="">None</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Weight (g)</span>
                <Input type="number" inputMode="decimal" value={form.weightGrams} onChange={(e) => setForm((f) => ({ ...f, weightGrams: e.target.value }))} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Rate / g</span>
                <Input type="number" inputMode="decimal" value={form.ratePerGram} onChange={(e) => setForm((f) => ({ ...f, ratePerGram: e.target.value }))} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Booking date</span>
                <Input type="date" value={form.bookingDate} onChange={(e) => setForm((f) => ({ ...f, bookingDate: e.target.value }))} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Expected delivery</span>
                <Input type="date" value={form.expectedDeliveryDate} onChange={(e) => setForm((f) => ({ ...f, expectedDeliveryDate: e.target.value }))} />
              </label>
            </div>
            <div className="text-xs text-muted-foreground">Amount: <span className="font-medium text-foreground">{B}{fmt(amt)}</span></div>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Notes (optional)</span>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </label>
            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving || form.weightGrams === "" || form.ratePerGram === ""}>
              {saving ? "Saving…" : editId ? "Save" : "Create booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert dialog */}
      <Dialog open={!!convert} onOpenChange={(o) => !o && setConvert(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert to transaction</DialogTitle>
          </DialogHeader>
          {convert ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {convert.type} · {convert.book} · {convert.clientName ?? "no client"}. Adjust the actual delivered
                figures if they differ, then confirm — this creates the real transaction and marks the booking delivered.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">Weight (g)</span>
                  <Input type="number" inputMode="decimal" value={cvForm.weightGrams} onChange={(e) => setCvForm((f) => ({ ...f, weightGrams: e.target.value }))} />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">Rate / g</span>
                  <Input type="number" inputMode="decimal" value={cvForm.ratePerGram} onChange={(e) => setCvForm((f) => ({ ...f, ratePerGram: e.target.value }))} />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">Delivery date</span>
                  <Input type="date" value={cvForm.date} onChange={(e) => setCvForm((f) => ({ ...f, date: e.target.value }))} />
                </label>
              </div>
              <div className="text-xs text-muted-foreground">
                Amount: <span className="font-medium text-foreground">{B}{fmt((Number(cvForm.weightGrams) || 0) * (Number(cvForm.ratePerGram) || 0))}</span>
              </div>
              {cvError && <p className="text-sm text-destructive">{cvError}</p>}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvert(null)} disabled={converting}>Cancel</Button>
            <Button onClick={() => void doConvert()} disabled={converting}>
              {converting ? "Converting…" : "Convert"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}

export default function BookingsPage() {
  return (
    <Suspense fallback={<PageWrapper title="Bookings"><div className="text-sm text-muted-foreground">Loading…</div></PageWrapper>}>
      <BookingsInner />
    </Suspense>
  );
}
