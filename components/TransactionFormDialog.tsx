"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAppUser } from "@/hooks/use-app-user";
import { cn } from "@/lib/utils";

type Client = {
  id: string;
  name: string;
  tax_id?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
};

type Tx = {
  id: string;
  book: "official" | "unofficial";
  client_id: string | null;
  date: string;
  type: "BUY" | "SELL";
  invoice_number: string | null;
  weight_grams: number | null;
  rate_per_gram: number | null;
  amount_thb: number | null;
  payment_mode: string | null;
  vat_percent: number | null;
  notes: string | null;
  status: string;
  wac_at_sale: number | null;
  cost_of_sale: number | null;
  profit_loss: number | null;
};

const selectCls =
  "w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function blankForm(): Record<string, string> {
  return {
    book: "official",
    type: "BUY",
    status: "approved",
    date: new Date().toISOString().slice(0, 10),
    clientId: "",
    weightGrams: "",
    ratePerGram: "",
    amountThb: "",
    paymentMode: "bank",
    vatPercent: "",
    invoiceNumber: "",
    notes: "",
  };
}

/**
 * Create (`id: null`) or edit (`id: string`) a transaction in either ledger.
 * Both modes share one form so the two books stay in sync.
 */
export function TransactionFormDialog({
  id,
  clients,
  onClose,
  onSaved,
}: {
  id: string | null;
  clients: Client[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isCreate = id === null;
  const { isAdmin } = useAppUser();

  const [tx, setTx] = useState<Tx | null>(null);
  const [loading, setLoading] = useState(!isCreate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // form fields
  const [form, setForm] = useState<Record<string, string>>(() =>
    isCreate ? blankForm() : {}
  );
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Invoice numbers are generated per book/type/date unless the user types one.
  const [invoiceTouched, setInvoiceTouched] = useState(false);

  useEffect(() => {
    if (!isCreate || invoiceTouched || !form.date) return;
    let active = true;
    const params = new URLSearchParams({
      book: form.book,
      type: form.type,
      date: form.date,
    });
    fetch(`/api/transactions/next-invoice?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (!active || !d.invoiceNumber) return;
        setForm((f) => ({ ...f, invoiceNumber: d.invoiceNumber }));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isCreate, invoiceTouched, form.book, form.type, form.date]);

  useEffect(() => {
    if (id === null) return;
    let active = true;
    setLoading(true);
    setError(null);
    fetch(`/api/transactions/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        if (d.error) return setError(d.error);
        const t: Tx = d.transaction;
        setTx(t);
        setForm({
          book: t.book,
          type: t.type,
          status: t.status,
          date: t.date,
          clientId: t.client_id ?? "",
          weightGrams: String(t.weight_grams ?? ""),
          ratePerGram: String(t.rate_per_gram ?? ""),
          amountThb: String(t.amount_thb ?? ""),
          paymentMode: t.payment_mode ?? "bank",
          vatPercent: String(t.vat_percent ?? ""),
          invoiceNumber: t.invoice_number ?? "",
          notes: t.notes ?? "",
        });
      })
      .catch((e) => active && setError(String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  const isUnofficial = form.book === "unofficial";

  // Details of the currently selected client, to show inline on the form.
  const selectedClient = useMemo(
    () => clients.find((c) => c.id === form.clientId) ?? null,
    [clients, form.clientId]
  );
  const hasClientDetails =
    !!selectedClient &&
    !!(selectedClient.tax_id || selectedClient.address || selectedClient.phone || selectedClient.email);

  // keep amount in sync when weight/rate change
  const autoAmount = useMemo(() => {
    const w = Number(form.weightGrams) || 0;
    const r = Number(form.ratePerGram) || 0;
    return w && r ? (w * r).toFixed(2) : "";
  }, [form.weightGrams, form.ratePerGram]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        book: form.book,
        type: form.type,
        status: form.status,
        date: form.date,
        clientId: form.clientId || null,
        weightGrams: form.weightGrams === "" ? null : Number(form.weightGrams),
        ratePerGram: form.ratePerGram === "" ? null : Number(form.ratePerGram),
        amountThb: form.amountThb === "" ? null : Number(form.amountThb),
        paymentMode: isUnofficial ? "cash" : form.paymentMode,
        vatPercent: isUnofficial || form.vatPercent === "" ? null : Number(form.vatPercent),
        invoiceNumber: form.invoiceNumber.trim() || null,
        notes: form.notes.trim() || null,
      };
      const res = await fetch(
        isCreate ? "/api/transactions" : `/api/transactions/${id}`,
        {
          method: isCreate ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Save failed");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this transaction permanently? Stock & WAC will be recalculated.")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Delete failed");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isCreate ? "New transaction" : "Edit transaction"}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-4">
            {error ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Book (ledger)">
                <select className={selectCls} value={form.book} onChange={(e) => set("book", e.target.value)}>
                  <option value="official">Official (declared)</option>
                  <option value="unofficial">Unofficial (real vault, cash)</option>
                </select>
              </Field>
              <Field label="Type">
                <select className={selectCls} value={form.type} onChange={(e) => set("type", e.target.value)}>
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </Field>
              {!isCreate || isAdmin ? (
                <Field label="Status">
                  <select className={selectCls} value={form.status} onChange={(e) => set("status", e.target.value)}>
                    <option value="pending">pending</option>
                    <option value="approved">approved</option>
                    <option value="rejected">rejected</option>
                  </select>
                </Field>
              ) : null}

              <Field label="Date">
                <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
              </Field>
              <Field label="Client">
                <select className={selectCls} value={form.clientId} onChange={(e) => set("clientId", e.target.value)}>
                  <option value="">None</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={isCreate ? "Invoice # (auto)" : "Invoice #"}>
                <Input
                  value={form.invoiceNumber}
                  onChange={(e) => {
                    if (isCreate) setInvoiceTouched(true);
                    set("invoiceNumber", e.target.value);
                  }}
                  placeholder="e.g. UP260911001"
                />
              </Field>

              <Field label="Weight (g)">
                <Input type="number" step="0.001" value={form.weightGrams} onChange={(e) => set("weightGrams", e.target.value)} />
              </Field>
              <Field label="Rate (THB/g)">
                <Input type="number" step="0.0001" value={form.ratePerGram} onChange={(e) => set("ratePerGram", e.target.value)} />
              </Field>
              <Field label="Amount (THB)">
                <Input
                  type="number"
                  step="0.01"
                  value={form.amountThb}
                  onChange={(e) => set("amountThb", e.target.value)}
                  placeholder={autoAmount}
                />
              </Field>

              <Field label="Payment mode">
                <select
                  className={cn(selectCls, isUnofficial && "opacity-60")}
                  value={isUnofficial ? "cash" : form.paymentMode}
                  disabled={isUnofficial}
                  onChange={(e) => set("paymentMode", e.target.value)}
                >
                  <option value="bank">bank</option>
                  <option value="qr">qr</option>
                  <option value="cheque">cheque</option>
                  <option value="cash">cash</option>
                </select>
              </Field>
              {!isUnofficial ? (
                <Field label="VAT %">
                  <Input type="number" step="0.001" value={form.vatPercent} onChange={(e) => set("vatPercent", e.target.value)} />
                </Field>
              ) : null}
            </div>

            {selectedClient ? (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
                <div className="mb-1 font-medium text-muted-foreground">
                  Client details{!hasClientDetails ? " — none on file yet" : ""}
                </div>
                <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                  <div>
                    <span className="text-muted-foreground">Tax ID: </span>
                    <span className="font-mono">{selectedClient.tax_id || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Phone: </span>
                    <span>{selectedClient.phone || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Email: </span>
                    <span>{selectedClient.email || "—"}</span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-muted-foreground">Address: </span>
                    <span>{selectedClient.address || "—"}</span>
                  </div>
                </div>
                {!hasClientDetails ? (
                  <p className="mt-1.5 text-muted-foreground">
                    Add these on the client&apos;s page (Clients → open → Edit Client); they appear on the invoice.
                  </p>
                ) : null}
              </div>
            ) : null}

            <Field label="Notes">
              <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
            </Field>

            {isUnofficial ? (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Unofficial book is cash-only and excluded from tax statements. Payment mode is forced to cash.
              </p>
            ) : null}

            {isCreate ? (
              <p className="text-xs text-muted-foreground">
                {invoiceTouched
                  ? "Using the invoice number you typed instead of the generated one."
                  : "Invoice number is generated from the date and re-checked on save."}
                {!isAdmin ? " Saved as pending until an admin approves it." : null}
              </p>
            ) : null}

            {tx && tx.type === "SELL" && tx.profit_loss != null ? (
              <p className="text-xs text-muted-foreground">
                Current persisted WAC profit: {tx.profit_loss.toLocaleString()} THB (recomputes on save).
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter className="flex-row justify-between sm:justify-between">
          {isCreate ? (
            <span />
          ) : (
            <Button variant="destructive" onClick={handleDelete} disabled={saving || loading}>
              Delete
            </Button>
          )}
          <div className="flex gap-2">
            {!isCreate && tx?.invoice_number ? (
              <Button variant="outline" asChild>
                <Link href={`/invoice/${id}`} target="_blank" rel="noopener noreferrer">
                  <FileText className="mr-1.5 h-3.5 w-3.5" />
                  View Invoice
                </Link>
              </Button>
            ) : null}
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || loading}>
              {saving ? "Saving…" : isCreate ? "Create transaction" : "Save changes"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
