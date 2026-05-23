"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Upload } from "lucide-react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { TransactionTypeBadge } from "@/components/TransactionTypeBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getSupabaseClient } from "@/lib/supabase";
import { formatSupabaseQueryError } from "@/lib/supabase-errors";
import { cn, embeddedClientName, formatCurrency } from "@/lib/utils";
import { PrintInvoiceButton } from "@/components/PrintInvoice";

// ─── Pagination ───────────────────────────────────────────────────────────────

function buildPageList(page: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }
  const items: (number | "…")[] = [0];
  const lo = Math.max(1, page - 2);
  const hi = Math.min(totalPages - 2, page + 2);
  if (lo > 1) items.push("…");
  for (let i = lo; i <= hi; i++) items.push(i);
  if (hi < totalPages - 2) items.push("…");
  items.push(totalPages - 1);
  return items;
}

function Pagination({
  page,
  totalPages,
  loading,
  onChange,
}: {
  page: number;
  totalPages: number;
  loading: boolean;
  onChange: (p: number) => void;
}) {
  const [jump, setJump] = useState("");
  const pages = useMemo(() => buildPageList(page, totalPages), [page, totalPages]);

  function handleJump(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const n = parseInt(jump, 10) - 1;
    if (!isNaN(n) && n >= 0 && n < totalPages) {
      onChange(n);
      setJump("");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {/* First */}
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        disabled={page === 0 || loading}
        onClick={() => onChange(0)}
        title="First page"
      >
        <ChevronsLeft className="h-4 w-4" />
      </Button>

      {/* Prev */}
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        disabled={page === 0 || loading}
        onClick={() => onChange(page - 1)}
        title="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      {/* Numbered pages */}
      {pages.map((p, idx) =>
        p === "…" ? (
          <span key={`e${idx}`} className="px-1 text-sm text-muted-foreground select-none">
            …
          </span>
        ) : (
          <Button
            key={p}
            variant={p === page ? "default" : "outline"}
            size="icon"
            className="h-8 w-8 text-xs"
            disabled={loading}
            onClick={() => onChange(p)}
          >
            {p + 1}
          </Button>
        )
      )}

      {/* Next */}
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        disabled={page >= totalPages - 1 || loading}
        onClick={() => onChange(page + 1)}
        title="Next page"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      {/* Last */}
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        disabled={page >= totalPages - 1 || loading}
        onClick={() => onChange(totalPages - 1)}
        title="Last page"
      >
        <ChevronsRight className="h-4 w-4" />
      </Button>

      {/* Jump to page */}
      {totalPages > 7 && (
        <div className="ml-2 flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Go to</span>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={jump}
            onChange={(e) => setJump(e.target.value)}
            onKeyDown={handleJump}
            placeholder={String(page + 1)}
            className="h-8 w-14 rounded-md border border-input bg-background px-2 text-center text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      )}
    </div>
  );
}

// ─── Stock Adjustment dialog ──────────────────────────────────────────────────

type AdjustMode = "set" | "delta";

function StockAdjustDialog({
  open,
  currentGrams,
  onClose,
  onSaved,
}: {
  open: boolean;
  currentGrams: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<AdjustMode>("set");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [grams, setGrams] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedGrams = parseFloat(grams);
  const isValid = !isNaN(parsedGrams) && date.length > 0;

  const previewBalance =
    isValid
      ? mode === "set"
        ? parsedGrams
        : currentGrams + parsedGrams
      : null;

  async function handleSave() {
    if (!isValid || previewBalance === null) return;
    setSaving(true);
    setError(null);
    try {
      const supabase = getSupabaseClient() as any;

      const { data: lastLedger } = await supabase
        .from("stock_ledger")
        .select("balance_grams")
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const latestBalance =
        typeof lastLedger?.balance_grams === "number" ? lastLedger.balance_grams : 0;

      const delta = mode === "set" ? parsedGrams - latestBalance : parsedGrams;
      const newBalance = mode === "set" ? parsedGrams : latestBalance + parsedGrams;

      // Legacy gls.stock_ledger (and import/migrate path) uses recorded_at only — no `date` column.
      // Delta is preserved in audit_log metadata.
      const payload: Record<string, unknown> = {
        transaction_id: null,
        balance_grams: newBalance,
        recorded_at: date,
      };

      const { error: insertErr } = await supabase.from("stock_ledger").insert(payload);
      if (insertErr) throw insertErr;

      const { error: auditErr } = await supabase.from("audit_log").insert({
        event_type: "stock_adjustment",
        description: `Manual stock adjustment: ${mode === "set" ? "set to" : "delta"} ${parsedGrams} g. New balance: ${newBalance.toFixed(4)} g.${notes.trim() ? " Reason: " + notes.trim() : ""}`,
        metadata: { mode, date, parsedGrams, delta, newBalance, notes: notes.trim() || null },
      });
      if (auditErr) console.warn("audit_log insert skipped:", auditErr);

      setGrams("");
      setNotes("");
      onClose();
      onSaved();
    } catch (e: unknown) {
      setError(formatSupabaseQueryError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) { setError(null); onClose(); }
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Adjust Stock Balance</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="text-muted-foreground">
            Current balance:{" "}
            <span className="font-semibold text-foreground">
              {currentGrams.toLocaleString()} g
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode("set")}
              className={cn(
                "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                mode === "set"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-muted"
              )}
            >
              Set exact balance
            </button>
            <button
              type="button"
              onClick={() => setMode("delta")}
              className={cn(
                "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                mode === "delta"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-muted"
              )}
            >
              Add / subtract
            </button>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-muted-foreground">
              {mode === "set" ? "New balance (grams)" : "Delta grams (negative to subtract)"}
            </label>
            <Input
              inputMode="decimal"
              placeholder={mode === "set" ? "e.g. 5000.00" : "e.g. -200.00 or +500.00"}
              value={grams}
              onChange={(e) => setGrams(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-muted-foreground">Date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-muted-foreground">
              Reason / notes (optional)
            </label>
            <Input
              placeholder="e.g. Physical count correction"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {previewBalance !== null && (
            <div className="rounded-md border bg-muted px-3 py-2 text-xs">
              New balance after adjustment:{" "}
              <span className="font-semibold">
                {previewBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })} g
              </span>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !isValid}>
            {saving ? "Saving..." : "Save adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type TxRow = {
  id: string;
  date: string;
  type: "BUY" | "SELL";
  invoice_number: string | null;
  weight_grams: number | null;
  rate_per_gram: number | null;
  amount_thb: number | null;
  client: { name: string } | { name: string }[] | null;
};

type TxDetail = TxRow & {
  vat_percent: number | null;
  notes: string | null;
  client_id: string | null;
};

const PAGE_SIZE = 50;

/** Fast pagination: exact counts force full scans on large tables. */
const LIST_COUNT: "planned" = "planned";

/** Standard debounce — prevents N queries per keystroke. */
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function toCsvDownload(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Transaction detail dialog ────────────────────────────────────────────────

function TransactionDetailDialog({
  txId,
  onClose,
  onDeleted,
}: {
  txId: string | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [tx, setTx] = useState<TxDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!txId) { setTx(null); return; }
    setLoading(true);
    const run = async () => {
      try {
        const supabase = getSupabaseClient() as any;
        const { data, error } = await supabase
          .from("transactions")
          .select(
            "id,date,type,invoice_number,weight_grams,rate_per_gram,amount_thb,vat_percent,notes,client_id,client:clients(name)"
          )
          .eq("id", txId)
          .single();
        if (!error) setTx(data as TxDetail);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [txId]);

  const handleDelete = async () => {
    if (!tx) return;
    setIsDeleting(true);
    try {
      const supabase = getSupabaseClient() as any;
      await supabase.from("stock_ledger").delete().eq("transaction_id", tx.id);
      await supabase.from("transactions").delete().eq("id", tx.id);
      setConfirmDelete(false);
      onClose();
      onDeleted();
    } finally {
      setIsDeleting(false);
    }
  };

  const clientName = tx ? (embeddedClientName(tx.client) ?? "-") : "-";

  return (
    <>
      <Dialog open={txId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm font-semibold">
              {loading ? "Loading…" : (tx?.invoice_number ?? "Transaction detail")}
            </DialogTitle>
          </DialogHeader>

          {loading && (
            <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
          )}

          {!loading && tx && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <TransactionTypeBadge type={tx.type} />
                <span className="text-sm text-muted-foreground">{tx.date}</span>
              </div>

              <div className="rounded-lg border divide-y text-sm">
                {[
                  ["Client", clientName],
                  ["Weight", tx.weight_grams != null ? `${tx.weight_grams.toLocaleString()} g` : "-"],
                  ["Rate", tx.rate_per_gram != null ? `${tx.rate_per_gram.toLocaleString()} THB/g` : "-"],
                  ["Amount", tx.amount_thb != null ? formatCurrency(tx.amount_thb, "THB", "th-TH") : "-"],
                  ["VAT", tx.vat_percent != null && tx.vat_percent > 0 ? `${tx.vat_percent}%` : "0%"],
                  ["Notes", tx.notes ?? "-"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start gap-3 px-3 py-2">
                    <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 flex-wrap">
            <Button
              variant="destructive"
              size="sm"
              disabled={loading || !tx}
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
            <div className="flex-1" />
            {tx && (
              <PrintInvoiceButton tx={{
                id: tx.id,
                date: tx.date,
                type: tx.type,
                invoice_number: tx.invoice_number,
                weight_grams: tx.weight_grams,
                rate_per_gram: tx.rate_per_gram,
                amount_thb: tx.amount_thb,
                vat_percent: tx.vat_percent,
                notes: tx.notes,
                clientName: clientName,
              }} />
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
            >
              Close
            </Button>
            <Button
              size="sm"
              disabled={loading || !tx}
              onClick={() => tx && router.push(`/transactions/${tx.id}/edit`)}
            >
              Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              {tx?.invoice_number
                ? `Invoice ${tx.invoice_number} will be permanently deleted.`
                : "This transaction will be permanently deleted."}
              {" "}This cannot be undone and will affect stock balances.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={handleDelete}
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TransactionsPage() {
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [invoiceQ, setInvoiceQ] = useState<string>("");
  const [amountMin, setAmountMin] = useState<string>("");
  const [amountMax, setAmountMax] = useState<string>("");
  const [type, setType] = useState<"ALL" | "BUY" | "SELL">("ALL");

  // Debounce all search inputs.
  const debouncedQ = useDebounce(q, 300);
  const debouncedInvoiceQ = useDebounce(invoiceQ, 300);
  const debouncedAmountMin = useDebounce(amountMin, 400);
  const debouncedAmountMax = useDebounce(amountMax, 400);

  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<TxRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Bulk selection state.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllPages, setSelectAllPages] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Detail modal state.
  const [detailTxId, setDetailTxId] = useState<string | null>(null);

  const [currentStockGrams, setCurrentStockGrams] = useState<number>(0);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / PAGE_SIZE)),
    [total]
  );

  const clientRel = debouncedQ.trim() ? "client:clients!inner(name)" : "client:clients(name)";

  const applyFilters = useCallback(
    (query: ReturnType<ReturnType<typeof getSupabaseClient>["from"]>) => {
      let q = query;
      if (from) q = q.gte("date", from);
      if (to) q = q.lte("date", to);
      if (type !== "ALL") q = q.eq("type", type);
      if (debouncedQ.trim()) q = q.ilike("clients.name", `%${debouncedQ.trim()}%`);
      if (debouncedInvoiceQ.trim()) q = q.ilike("invoice_number", `%${debouncedInvoiceQ.trim()}%`);
      const minAmt = parseFloat(debouncedAmountMin);
      const maxAmt = parseFloat(debouncedAmountMax);
      if (!isNaN(minAmt)) q = (q as any).gte("amount_thb", minAmt);
      if (!isNaN(maxAmt)) q = (q as any).lte("amount_thb", maxAmt);
      return q;
    },
    [from, to, type, debouncedQ, debouncedInvoiceQ, debouncedAmountMin, debouncedAmountMax]
  );

  const buildListQuery = useCallback(() => {
    const supabase = getSupabaseClient();
    const sel = `id,date,type,invoice_number,weight_grams,rate_per_gram,amount_thb,${clientRel}`;
    let q = supabase.from("transactions").select(sel, { count: LIST_COUNT });
    q = applyFilters(q);
    return q.order("date", { ascending: false }).order("id", { ascending: false });
  }, [applyFilters, clientRel]);

  /** Full rows for CSV export (no count — avoids extra planner work per batch). */
  const buildExportQuery = useCallback(() => {
    const supabase = getSupabaseClient();
    const sel = `id,date,type,invoice_number,weight_grams,rate_per_gram,amount_thb,vat_percent,notes,${clientRel}`;
    let q = supabase.from("transactions").select(sel);
    q = applyFilters(q);
    return q.order("date", { ascending: false }).order("id", { ascending: false });
  }, [applyFilters, clientRel]);

  /** ID-only for bulk delete (chunked). Uses inner join when client name filter is active. */
  const buildIdsQuery = useCallback(() => {
    const supabase = getSupabaseClient();
    const sel = debouncedQ.trim() ? `id, ${clientRel}` : "id";
    let q = supabase.from("transactions").select(sel);
    q = applyFilters(q);
    return q.order("date", { ascending: false }).order("id", { ascending: false });
  }, [applyFilters, clientRel, debouncedQ]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      try { getSupabaseClient(); } catch { setRows([]); setTotal(0); return; }

      const start = page * PAGE_SIZE;
      const end = start + PAGE_SIZE - 1;

      const { data, count, error } = await buildListQuery().range(start, end);
      if (error) throw error;

      const list = (data ?? []) as unknown as TxRow[];
      setRows(list);
      // Planned count can be null in edge cases — infer a sensible minimum.
      const n = count;
      if (typeof n === "number" && n >= 0) {
        setTotal(n);
      } else if (list.length > 0) {
        setTotal(Math.max(list.length + page * PAGE_SIZE, (page + 1) * PAGE_SIZE));
      } else {
        setTotal(0);
      }
    } finally {
      setLoading(false);
    }
  }, [buildListQuery, page]);

  const refreshStock = useCallback(async () => {
    let supabase: ReturnType<typeof getSupabaseClient>;
    try { supabase = getSupabaseClient(); } catch { setCurrentStockGrams(0); return; }

    const { data, error } = await (supabase as any)
      .from("stock_ledger")
      .select("balance_grams")
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) { console.warn(error); return; }
    setCurrentStockGrams(typeof data?.balance_grams === "number" ? data.balance_grams : 0);
  }, []);

  const handleBulkDelete = useCallback(async () => {
    setIsBulkDeleting(true);
    try {
      const supabase = getSupabaseClient() as any;

      let ids: string[];
      if (selectAllPages) {
        const idBatchSize = 1000;
        ids = [];
        let offset = 0;
        for (;;) {
          const { data: batch, error: fetchErr } = await buildIdsQuery().range(
            offset,
            offset + idBatchSize - 1
          );
          if (fetchErr) throw fetchErr;
          const rows = (batch ?? []) as { id: string }[];
          for (const r of rows) ids.push(r.id);
          if (rows.length < idBatchSize) break;
          offset += idBatchSize;
        }
      } else {
        ids = [...selectedIds];
      }

      if (ids.length === 0) return;

      // PostgREST rejects DELETE with no WHERE clause, so we batch by ID
      // (chunks of 100 to stay within URL length limits).
      const CHUNK = 100;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        await supabase.from("stock_ledger").delete().in("transaction_id", chunk);
        await supabase.from("transactions").delete().in("id", chunk);
      }

      setSelectedIds(new Set());
      setSelectAllPages(false);
      setBulkDeleteOpen(false);
      void Promise.all([refresh(), refreshStock()]);
    } catch (e) {
      console.error("Bulk delete failed:", e);
    } finally {
      setIsBulkDeleting(false);
    }
  }, [selectedIds, selectAllPages, refresh, refreshStock, buildIdsQuery]);

  // Reset page when filters change.
  useEffect(() => { setPage(0); }, [from, to, debouncedQ, debouncedInvoiceQ, debouncedAmountMin, debouncedAmountMax, type]);

  // On mount: load transactions + stock in parallel.
  // refreshStock is NOT in the dep array — it only fires on mount and after mutations,
  // not on every filter/page change (which would double every query).
  const stockLoadedRef = useRef(false);
  useEffect(() => {
    void refresh();
    if (!stockLoadedRef.current) {
      stockLoadedRef.current = true;
      void refreshStock();
    }
  }, [refresh]);

  const onExport = useCallback(async () => {
    setExporting(true);
    try {
      try { getSupabaseClient(); } catch { return; }
      const supabase = getSupabaseClient() as any;

      // Fetch all filtered transactions with extra fields.
      type ExportRow = TxRow & { vat_percent: number | null; notes: string | null };
      const all: ExportRow[] = [];
      const batchSize = 1000;
      let offset = 0;
      while (true) {
        const { data, error } = await buildExportQuery().range(
          offset,
          offset + batchSize - 1
        );
        if (error) throw error;
        const batch = (data ?? []) as ExportRow[];
        all.push(...batch);
        if (batch.length < batchSize) break;
        offset += batchSize;
      }

      // Fetch matching ledger entries for balance column.
      const ids = all.map((r) => r.id);
      const ledgerMap = new Map<string, number>();
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        const { data: lRows } = await supabase
          .from("stock_ledger")
          .select("transaction_id,balance_grams")
          .in("transaction_id", chunk);
        for (const l of (lRows ?? []) as { transaction_id: string; balance_grams: number }[]) {
          ledgerMap.set(l.transaction_id, l.balance_grams);
        }
      }

      const csv = Papa.unparse(
        all.map((r) => ({
          Date: r.date,
          Client: embeddedClientName(r.client) ?? "",
          Type: r.type,
          "Invoice #": r.invoice_number ?? "",
          "Weight (g)": r.weight_grams ?? "",
          "Rate (THB/g)": r.rate_per_gram ?? "",
          "Amount (THB)": r.amount_thb ?? "",
          "VAT %": r.vat_percent ?? 0,
          Notes: r.notes ?? "",
          "Balance after (g)": ledgerMap.get(r.id) ?? "",
        }))
      );
      toCsvDownload(`transactions-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    } finally {
      setExporting(false);
    }
  }, [buildExportQuery]);

  const allPageSelected =
    rows.length > 0 && rows.every((r) => selectedIds.has(r.id));

  const toggleSelectAll = useCallback(() => {
    setSelectAllPages(false);
    setSelectedIds((prev) => {
      if (allPageSelected) {
        const next = new Set(prev);
        rows.forEach((r) => next.delete(r.id));
        return next;
      }
      const next = new Set(prev);
      rows.forEach((r) => next.add(r.id));
      return next;
    });
  }, [rows, allPageSelected]);

  const toggleRow = useCallback((id: string) => {
    setSelectAllPages(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  return (
    <PageWrapper
      title="Transactions"
      description="Filter, search, and drill into buy and sell records."
    >
      <div className="sticky top-0 z-10 -mx-4 md:-mx-6 px-4 md:px-6 py-4 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <Card className="w-full">
              <CardHeader className="py-3 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm">Current Stock</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setAdjustOpen(true)}
                >
                  Adjust
                </Button>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="text-2xl font-semibold">
                  {currentStockGrams.toLocaleString()}{" "}
                  <span className="text-sm font-medium text-muted-foreground">grams</span>
                </div>
              </CardContent>
            </Card>

            <div className="flex shrink-0 items-center gap-2">
              {(selectedIds.size > 0 || selectAllPages) && (
                <Button
                  variant="destructive"
                  onClick={() => setBulkDeleteOpen(true)}
                >
                  Delete {selectAllPages ? `all ${total}` : selectedIds.size} selected
                </Button>
              )}
              <Button variant="outline" onClick={onExport} disabled={exporting}>
                {exporting ? "Exporting…" : "Export to CSV"}
              </Button>
              <Button variant="outline" asChild>
                <Link href="/transactions/import">
                  <Upload className="mr-2 h-4 w-4" />
                  Import Excel
                </Link>
              </Button>
              <Button asChild>
                <Link href="/transactions/new">New Transaction</Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-6">
            <div className="md:col-span-1">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From" />
            </div>
            <div className="md:col-span-1">
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} placeholder="To" />
            </div>
            <div className="md:col-span-1">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Client name…" />
            </div>
            <div className="md:col-span-1">
              <Input value={invoiceQ} onChange={(e) => setInvoiceQ(e.target.value)} placeholder="Invoice #…" />
            </div>
            <div className="md:col-span-1">
              <div className="flex gap-1">
                <Input type="number" value={amountMin} onChange={(e) => setAmountMin(e.target.value)} placeholder="Min THB" className="min-w-0" />
                <Input type="number" value={amountMax} onChange={(e) => setAmountMax(e.target.value)} placeholder="Max THB" className="min-w-0" />
              </div>
            </div>
            <div className="md:col-span-1">
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All</SelectItem>
                  <SelectItem value="BUY">BUY</SelectItem>
                  <SelectItem value="SELL">SELL</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Cross-page select-all banner */}
      {allPageSelected && !selectAllPages && total > rows.length && (
        <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm dark:border-blue-800 dark:bg-blue-950">
          <span className="text-muted-foreground">
            All <strong>{rows.length}</strong> transactions on this page are selected.
          </span>
          <button
            className="font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
            onClick={() => setSelectAllPages(true)}
          >
            Select all {total} transactions
          </button>
        </div>
      )}
      {selectAllPages && (
        <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm dark:border-blue-800 dark:bg-blue-950">
          <span className="text-muted-foreground">
            All <strong>{total}</strong> transactions are selected.
          </span>
          <button
            className="font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
            onClick={() => { setSelectAllPages(false); setSelectedIds(new Set()); }}
          >
            Clear selection
          </button>
        </div>
      )}

      <div className="mt-4 rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  className="rounded border-border"
                  checked={allPageSelected}
                  onChange={toggleSelectAll}
                  aria-label="Select all on page"
                />
              </TableHead>
              <TableHead className="w-[120px]">Date</TableHead>
              <TableHead>Client</TableHead>
              <TableHead className="w-[110px]">Type</TableHead>
              <TableHead>Invoice #</TableHead>
              <TableHead className="text-right">Weight (g)</TableHead>
              <TableHead className="text-right">Rate (THB/g)</TableHead>
              <TableHead className="text-right">Amount (THB)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow
                key={r.id}
                className="cursor-pointer"
                onClick={() => setDetailTxId(r.id)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="rounded border-border"
                    checked={selectedIds.has(r.id)}
                    onChange={() => toggleRow(r.id)}
                    aria-label={`Select ${r.invoice_number ?? r.id}`}
                  />
                </TableCell>
                <TableCell className="font-medium">{r.date}</TableCell>
                <TableCell>{embeddedClientName(r.client) ?? "-"}</TableCell>
                <TableCell>
                  <TransactionTypeBadge type={r.type} />
                </TableCell>
                <TableCell className="font-mono text-xs">{r.invoice_number ?? "-"}</TableCell>
                <TableCell className="text-right">
                  {typeof r.weight_grams === "number" ? r.weight_grams.toLocaleString() : "-"}
                </TableCell>
                <TableCell className="text-right">
                  {typeof r.rate_per_gram === "number" ? r.rate_per_gram.toLocaleString() : "-"}
                </TableCell>
                <TableCell className="text-right">
                  {typeof r.amount_thb === "number" ? formatCurrency(r.amount_thb, "THB", "th-TH") : "-"}
                </TableCell>
              </TableRow>
            ))}

            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center">
                  {loading ? "Loading…" : "No transactions found."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          {total.toLocaleString()} result{total !== 1 ? "s" : ""} · page {page + 1} of {totalPages}
          {(selectedIds.size > 0 || selectAllPages) && (
            <span className="ml-2 font-medium text-foreground">
              · {selectAllPages ? `all ${total}` : selectedIds.size} selected
            </span>
          )}
        </div>
        <Pagination
          page={page}
          totalPages={totalPages}
          loading={loading}
          onChange={(p) => setPage(p)}
        />
      </div>

      {/* Stock adjustment dialog */}
      <StockAdjustDialog
        open={adjustOpen}
        currentGrams={currentStockGrams}
        onClose={() => setAdjustOpen(false)}
        onSaved={() => { void refreshStock(); }}
      />

      {/* Transaction detail dialog */}
      <TransactionDetailDialog
        txId={detailTxId}
        onClose={() => setDetailTxId(null)}
        onDeleted={() => { void refresh(); void refreshStock(); }}
      />

      {/* Bulk delete confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectAllPages ? `all ${total}` : selectedIds.size} transaction{(selectAllPages ? total : selectedIds.size) !== 1 ? "s" : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectAllPages ? `all ${total}` : selectedIds.size} transaction{(selectAllPages ? total : selectedIds.size) !== 1 ? "s" : ""} and their stock ledger entries. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isBulkDeleting}
              onClick={handleBulkDelete}
            >
              {isBulkDeleting ? "Deleting…" : `Delete ${selectAllPages ? `all ${total}` : selectedIds.size}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageWrapper>
  );
}
