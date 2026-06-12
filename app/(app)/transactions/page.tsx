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
import { TransactionStatusBadge } from "@/components/transactions/TransactionStatusBadge";
import { RejectTransactionDialog } from "@/components/transactions/RejectTransactionDialog";
import {
  TransactionPlCells,
  TransactionPlDetailBlock,
  wacPlFromRow,
} from "@/components/transactions/TransactionPlDisplay";
import { useTransactionWac } from "@/hooks/use-transaction-wac";
import { useAppUser } from "@/hooks/use-app-user";
import { isRateDeviationAlert, type AppUser, type TransactionStatus } from "@/lib/rbac";
import {
  canDeleteTransaction,
  canEditTransaction,
} from "@/lib/transaction-permissions";
import { WAC_MIGRATION_SQL } from "@/lib/wac-columns";
import type { WacPlEntry } from "@/lib/wac-ledger";

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
      const res = await fetch("/api/stock/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          grams: parsedGrams,
          date,
          notes: notes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Adjustment failed");
      }

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
  transaction_mode?: string | null;
  invoice_number: string | null;
  weight_grams: number | null;
  rate_per_gram: number | null;
  amount_thb: number | null;
  status?: TransactionStatus;
  created_by?: number | null;
  rejection_reason?: string | null;
  wac_at_sale?: number | null;
  cost_of_sale?: number | null;
  profit_loss?: number | null;
  pl_percent?: number | null;
  client: { name: string } | { name: string }[] | null;
};

type TxDetail = TxRow & {
  vat_percent: number | null;
  notes: string | null;
  client_id: string | null;
};

type StatusFilter = "ALL" | TransactionStatus;

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
  wacDbEnabled,
  plById,
  appUser,
  isAdmin,
  onClose,
  onDeleted,
  onUpdated,
}: {
  txId: string | null;
  wacDbEnabled: boolean;
  plById: Map<string, WacPlEntry>;
  appUser: AppUser | null;
  isAdmin: boolean;
  onClose: () => void;
  onDeleted: () => void;
  onUpdated: () => void;
}) {
  const router = useRouter();
  const [tx, setTx] = useState<TxDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!txId) { setTx(null); return; }
    setLoading(true);
    const run = async () => {
      try {
        const supabase = getSupabaseClient() as any;
        const wacSelect = wacDbEnabled
          ? ",wac_at_sale,cost_of_sale,profit_loss,pl_percent"
          : "";
        const { data, error } = await supabase
          .from("transactions")
          .select(
            `id,date,type,invoice_number,weight_grams,rate_per_gram,amount_thb,vat_percent,notes,client_id,status,created_by,rejection_reason${wacSelect},client:clients(name)`
          )
          .eq("id", txId)
          .single();
        if (!error) setTx(data as TxDetail);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [txId, wacDbEnabled]);

  const handleDelete = async () => {
    if (!tx) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/transactions/${tx.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      setConfirmDelete(false);
      onClose();
      onDeleted();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleApprove = async () => {
    if (!tx) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/transactions/${tx.id}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Approve failed");
      onClose();
      onUpdated();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (reason: string) => {
    if (!tx) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/transactions/${tx.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Reject failed");
      setRejectOpen(false);
      onClose();
      onUpdated();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleResubmit = () => {
    if (tx) router.push(`/transactions/${tx.id}/edit`);
  };

  const txRecord = tx
    ? {
        ...tx,
        status: (tx.status ?? "pending") as TransactionStatus,
        created_by: tx.created_by ?? null,
      }
    : null;
  const canEdit = txRecord && appUser ? canEditTransaction(appUser, txRecord) : false;
  const canDelete = txRecord && appUser ? canDeleteTransaction(appUser, txRecord) : false;
  const canApprove = isAdmin && tx?.status === "pending";
  const canReject = isAdmin && tx?.status === "pending";
  const canResubmit =
    !isAdmin && tx?.status === "rejected" && tx.created_by === appUser?.id;

  const clientName = tx ? (embeddedClientName(tx.client) ?? "-") : "-";
  const pl = tx
    ? wacDbEnabled
      ? wacPlFromRow(tx)
      : plById.get(tx.id)
    : undefined;

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
              <div className="flex flex-wrap items-center gap-2">
                <TransactionTypeBadge type={tx.type} />
                <TransactionStatusBadge status={(tx.status ?? "pending") as TransactionStatus} />
                <span className="text-sm text-muted-foreground">{tx.date}</span>
              </div>

              {tx.status === "rejected" && tx.rejection_reason && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
                  <span className="font-medium">Rejection reason: </span>
                  {tx.rejection_reason}
                </div>
              )}

              {actionError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {actionError}
                </div>
              )}

              <div className="rounded-lg border divide-y text-sm">
                {[
                  ["Client", clientName],
                  ["Weight", tx.weight_grams != null ? `${tx.weight_grams.toLocaleString()} g` : "-"],
                  ["Rate", tx.rate_per_gram != null ? `${tx.rate_per_gram.toLocaleString()} THB/g` : "-"],
                  ["Amount", tx.amount_thb != null ? formatCurrency(tx.amount_thb, "THB", "th-TH") : "-"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start gap-3 px-3 py-2">
                    <span className="w-36 shrink-0 text-muted-foreground">{label}</span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
                <TransactionPlDetailBlock type={tx.type} pl={pl} />
                {[
                  ["VAT", tx.vat_percent != null && tx.vat_percent > 0 ? `${tx.vat_percent}%` : "0%"],
                  ["Notes", tx.notes ?? "-"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start gap-3 px-3 py-2">
                    <span className="w-36 shrink-0 text-muted-foreground">{label}</span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 flex-wrap">
            {canDelete && (
              <Button
                variant="destructive"
                size="sm"
                disabled={loading || !tx}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
            )}
            <div className="flex-1" />
            {canReject && (
              <Button
                variant="outline"
                size="sm"
                disabled={loading || actionLoading}
                onClick={() => setRejectOpen(true)}
              >
                Reject
              </Button>
            )}
            {canApprove && (
              <Button
                size="sm"
                disabled={loading || actionLoading}
                onClick={() => void handleApprove()}
              >
                {actionLoading ? "Working…" : "Approve"}
              </Button>
            )}
            {canResubmit && (
              <Button size="sm" onClick={handleResubmit}>
                Resubmit
              </Button>
            )}
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
              disabled={loading || !tx || !canEdit}
              onClick={() => tx && router.push(`/transactions/${tx.id}/edit`)}
            >
              Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RejectTransactionDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        onConfirm={handleReject}
        loading={actionLoading}
      />

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
  const { user: appUser, isAdmin, loading: authLoading } = useAppUser();
  const [wacDbEnabled, setWacDbEnabled] = useState(false);
  const [wacCanMigrateEnv, setWacCanMigrateEnv] = useState(false);
  const [wacDbPassword, setWacDbPassword] = useState("");
  const [wacBackfilling, setWacBackfilling] = useState(false);
  const [wacSetupError, setWacSetupError] = useState<string | null>(null);
  const useDbWac = wacDbEnabled === true;
  const { plById, currentWac, loading: wacLoading, refresh: refreshWac } = useTransactionWac(!useDbWac);

  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [invoiceQ, setInvoiceQ] = useState<string>("");
  const [amountMin, setAmountMin] = useState<string>("");
  const [amountMax, setAmountMax] = useState<string>("");
  const [type, setType] = useState<"ALL" | "BUY" | "SELL">("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  // Admin-only: show cash transactions (default hidden)
  const [showCash, setShowCash] = useState(false);
  const [bulkApproving, setBulkApproving] = useState(false);

  // Dual stock from WAC endpoint
  const [physicalStockGm, setPhysicalStockGm] = useState<number | null>(null);
  const [officialStockGm, setOfficialStockGm] = useState<number | null>(null);

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("status");
    if (status === "pending" || status === "approved" || status === "rejected") {
      setStatusFilter(status);
    }
  }, []);

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
      if (statusFilter !== "ALL") q = q.eq("status", statusFilter);
      if (debouncedQ.trim()) q = q.ilike("clients.name", `%${debouncedQ.trim()}%`);
      if (debouncedInvoiceQ.trim()) q = q.ilike("invoice_number", `%${debouncedInvoiceQ.trim()}%`);
      const minAmt = parseFloat(debouncedAmountMin);
      const maxAmt = parseFloat(debouncedAmountMax);
      if (!isNaN(minAmt)) q = (q as any).gte("amount_thb", minAmt);
      if (!isNaN(maxAmt)) q = (q as any).lte("amount_thb", maxAmt);
      // Cash visibility: non-admins never see cash; admins see it only when showCash is on
      if (!isAdmin || !showCash) q = (q as any).neq("transaction_mode", "cash");
      return q;
    },
    [from, to, type, statusFilter, debouncedQ, debouncedInvoiceQ, debouncedAmountMin, debouncedAmountMax, isAdmin, showCash]
  );

  const wacSelect = useDbWac ? ",wac_at_sale,cost_of_sale,profit_loss,pl_percent" : "";

  const buildListQuery = useCallback(() => {
    const supabase = getSupabaseClient();
    const sel = `id,date,type,transaction_mode,invoice_number,weight_grams,rate_per_gram,amount_thb,status,created_by,rejection_reason${wacSelect},${clientRel}`;
    let q = supabase.from("transactions").select(sel, { count: LIST_COUNT });
    q = applyFilters(q);
    return q.order("date", { ascending: false }).order("id", { ascending: false });
  }, [applyFilters, clientRel, wacSelect]);

  /** Full rows for CSV export (no count — avoids extra planner work per batch). */
  const buildExportQuery = useCallback(() => {
    const supabase = getSupabaseClient();
    const sel = `id,date,type,invoice_number,weight_grams,rate_per_gram,amount_thb,vat_percent,notes,status,created_by${wacSelect},${clientRel}`;
    let q = supabase.from("transactions").select(sel);
    q = applyFilters(q);
    return q.order("date", { ascending: false }).order("id", { ascending: false });
  }, [applyFilters, clientRel, wacSelect]);

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
    } catch (e) {
      console.warn("Failed to load transactions:", e);
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [buildListQuery, page]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/wac/status");
        const body = await res.json().catch(() => ({}));
        const ok = res.ok && body?.hasColumns === true;
        setWacDbEnabled(ok);
        setWacCanMigrateEnv(body?.canMigrate === true);
      } catch {
        setWacDbEnabled(false);
      }
    })();
  }, []);

  const runWacBackfill = useCallback(async (backfillOnly = false) => {
    setWacBackfilling(true);
    setWacSetupError(null);
    try {
      if (!backfillOnly) {
        const migrateRes = await fetch("/api/wac/migrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            password: wacDbPassword.trim() || undefined,
          }),
        });
        const migrateBody = await migrateRes.json().catch(() => ({}));
        if (migrateRes.status === 503) {
          throw new Error(
            typeof migrateBody?.error === "string"
              ? migrateBody.error
              : "Enter your database password below, add SUPABASE_DB_PASSWORD to .env.local, or run the SQL in Supabase SQL Editor."
          );
        }
        if (!migrateRes.ok) {
          throw new Error(
            typeof migrateBody?.error === "string"
              ? migrateBody.error
              : "Migration failed"
          );
        }
      }

      const res = await fetch("/api/wac/backfill", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof body?.error === "string"
            ? body.error
            : backfillOnly
              ? "Backfill failed — run the SQL in Supabase SQL Editor first, then retry."
              : "Backfill failed";
        throw new Error(msg);
      }

      const statusRes = await fetch("/api/wac/status");
      const statusBody = await statusRes.json().catch(() => ({}));
      setWacDbEnabled(statusRes.ok && statusBody?.hasColumns === true);
      void refresh();
      void refreshWac();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Setup failed";
      setWacSetupError(message);
    } finally {
      setWacBackfilling(false);
    }
  }, [refresh, refreshWac, wacDbPassword]);

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

    // Also refresh dual-stock from WAC endpoint
    try {
      const res = await fetch("/api/inventory/current-wac");
      if (res.ok) {
        const body = await res.json();
        if (typeof body?.physical_stock_gm === "number") setPhysicalStockGm(body.physical_stock_gm);
        if (typeof body?.official_stock_gm === "number") setOfficialStockGm(body.official_stock_gm);
      }
    } catch { /* ignore */ }
  }, []);

  const handleBulkDelete = useCallback(async () => {
    setIsBulkDeleting(true);
    try {
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

      for (const id of ids) {
        const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Delete failed for ${id}`);
        }
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

  const handleBulkApprove = useCallback(async () => {
    const ids = selectAllPages
      ? rows.filter((r) => r.status === "pending").map((r) => r.id)
      : [...selectedIds].filter((id) => {
          const row = rows.find((r) => r.id === id);
          return row?.status === "pending";
        });

    if (ids.length === 0) return;
    setBulkApproving(true);
    try {
      const res = await fetch("/api/transactions/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bulk approve failed");
      setSelectedIds(new Set());
      setSelectAllPages(false);
      void Promise.all([refresh(), refreshStock(), refreshWac()]);
    } catch (e) {
      console.error("Bulk approve failed:", e);
    } finally {
      setBulkApproving(false);
    }
  }, [selectedIds, selectAllPages, rows, refresh, refreshStock, refreshWac]);

  // Reset page when filters change.
  useEffect(() => { setPage(0); }, [from, to, debouncedQ, debouncedInvoiceQ, debouncedAmountMin, debouncedAmountMax, type, statusFilter, showCash]);

  // Reload list when switching to DB-backed WAC columns.
  useEffect(() => {
    if (!useDbWac) return;
    void refresh();
  }, [useDbWac, refresh]);

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
          "WAC at sale (฿/gm)": r.wac_at_sale ?? "",
          "Cost of sale (฿)": r.cost_of_sale ?? "",
          "Profit / Loss (฿)": r.profit_loss ?? "",
          "P&L %": r.pl_percent ?? "",
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
      {wacDbEnabled === false && isAdmin && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <p className="font-medium">WAC columns not in database yet</p>
          <p className="mt-1 text-amber-900/90 dark:text-amber-200/90">
            Profit/Loss is computed in the browser until DB columns exist. Paste the SQL below in{" "}
            <a
              href="https://supabase.com/dashboard/project/zmmoeslgjisvhuhixpau/sql/new"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Supabase SQL Editor
            </a>
            , then click <strong>Backfill only</strong>. Or enter your database password below and
            click <strong>Setup WAC</strong> (password is used once for migration, not stored).
          </p>
          {!wacCanMigrateEnv && (
            <div className="mt-3 max-w-md">
              <label htmlFor="wac-db-password" className="text-xs font-medium">
                Database password (Supabase → Project Settings → Database)
              </label>
              <Input
                id="wac-db-password"
                type="password"
                autoComplete="off"
                placeholder="postgres database password"
                className="mt-1 bg-background"
                value={wacDbPassword}
                onChange={(e) => setWacDbPassword(e.target.value)}
              />
            </div>
          )}
          <pre className="mt-2 max-h-32 overflow-auto rounded border bg-background/80 p-2 text-xs">{WAC_MIGRATION_SQL}</pre>
          {wacSetupError && (
            <p className="mt-2 text-red-700 dark:text-red-300">{wacSetupError}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void navigator.clipboard.writeText(WAC_MIGRATION_SQL)}
            >
              Copy SQL
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={wacBackfilling}
              onClick={() => void runWacBackfill(true)}
            >
              {wacBackfilling ? "Backfilling…" : "Backfill only (after SQL)"}
            </Button>
            <Button
              size="sm"
              disabled={wacBackfilling || (!wacCanMigrateEnv && !wacDbPassword.trim())}
              onClick={() => void runWacBackfill(false)}
            >
              {wacBackfilling ? "Setting up WAC…" : "Setup WAC (migrate + backfill)"}
            </Button>
          </div>
        </div>
      )}

      <div className="sticky top-0 z-10 -mx-4 md:-mx-6 px-4 md:px-6 py-4 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <Card className="w-full">
              <CardHeader className="py-3 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm">Stock</CardTitle>
                {isAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setAdjustOpen(true)}
                  >
                    Adjust
                  </Button>
                )}
              </CardHeader>
              <CardContent className="pb-3">
                {/* Show dual stock when available (after transaction_mode column exists) */}
                {isAdmin && physicalStockGm !== null && officialStockGm !== null ? (
                  <div className="flex gap-6">
                    <div>
                      <div className="text-xs text-muted-foreground">Physical</div>
                      <div className="text-xl font-semibold">
                        {physicalStockGm.toLocaleString(undefined, { maximumFractionDigits: 3 })}{" "}
                        <span className="text-xs font-medium text-muted-foreground">gm</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Official</div>
                      <div className="text-xl font-semibold">
                        {officialStockGm.toLocaleString(undefined, { maximumFractionDigits: 3 })}{" "}
                        <span className="text-xs font-medium text-muted-foreground">gm</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-2xl font-semibold">
                    {currentStockGrams.toLocaleString()}{" "}
                    <span className="text-sm font-medium text-muted-foreground">grams</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex shrink-0 items-center gap-2">
              {isAdmin && (selectedIds.size > 0 || selectAllPages) && (
                <>
                  <Button
                    variant="outline"
                    disabled={bulkApproving}
                    onClick={() => void handleBulkApprove()}
                  >
                    {bulkApproving ? "Approving…" : "Approve selected"}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setBulkDeleteOpen(true)}
                  >
                    Delete {selectAllPages ? `all ${total}` : selectedIds.size} selected
                  </Button>
                </>
              )}
              {!isAdmin && (selectedIds.size > 0 || selectAllPages) && (
                <Button
                  variant="destructive"
                  onClick={() => setBulkDeleteOpen(true)}
                >
                  Delete {selectAllPages ? `all ${total}` : selectedIds.size} selected
                </Button>
              )}
              {isAdmin && (
                <>
                  <Button variant="outline" onClick={onExport} disabled={exporting}>
                    {exporting ? "Exporting…" : "Export to CSV"}
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href="/transactions/import">
                      <Upload className="mr-2 h-4 w-4" />
                      Import Excel
                    </Link>
                  </Button>
                </>
              )}
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

          <div className="flex flex-wrap items-center gap-1">
            {(["ALL", "pending", "approved", "rejected"] as StatusFilter[]).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={statusFilter === s ? "default" : "outline"}
                className="h-8 text-xs capitalize"
                onClick={() => setStatusFilter(s)}
              >
                {s === "ALL" ? "All" : s}
              </Button>
            ))}
            {/* Admin-only cash toggle */}
            {isAdmin && (
              <Button
                size="sm"
                variant={showCash ? "default" : "outline"}
                className={cn("h-8 text-xs ml-2", showCash && "bg-zinc-600 hover:bg-zinc-700 text-white border-zinc-600")}
                onClick={() => setShowCash((v) => !v)}
              >
                💰 {showCash ? "Hide cash" : "Show cash"}
              </Button>
            )}
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
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead>Invoice #</TableHead>
              <TableHead className="text-right">Weight (g)</TableHead>
              <TableHead className="text-right">Rate (THB/g)</TableHead>
              <TableHead className="text-right">Amount (THB)</TableHead>
              <TableHead className="text-right">WAC at sale (฿/gm)</TableHead>
              <TableHead className="text-right">Cost of Sale (฿)</TableHead>
              <TableHead className="text-right">Profit / Loss (฿ / %)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const isOwnPending =
                !isAdmin &&
                r.status === "pending" &&
                appUser?.id != null &&
                r.created_by === appUser.id;
              const showRateAlert =
                isAdmin &&
                r.status === "pending" &&
                isRateDeviationAlert(r.type, r.rate_per_gram, currentWac);

              return (
              <TableRow
                key={r.id}
                className={cn(
                  "cursor-pointer",
                  r.transaction_mode === "cash"
                    ? "bg-zinc-50/80 text-zinc-500 dark:bg-zinc-900/30 dark:text-zinc-400"
                    : isOwnPending && "bg-amber-50/80 dark:bg-amber-950/30"
                )}
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
                  {r.transaction_mode === "cash" ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                      💰 CASH
                    </span>
                  ) : (
                    <TransactionTypeBadge type={r.type} />
                  )}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-col gap-1">
                    <TransactionStatusBadge status={(r.status ?? "pending") as TransactionStatus} />
                    {showRateAlert && (
                      <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300">
                        Rate alert
                      </span>
                    )}
                    {isAdmin && r.status === "pending" && (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={async (e) => {
                            e.stopPropagation();
                            await fetch(`/api/transactions/${r.id}/approve`, { method: "POST" });
                            void refresh();
                            void refreshStock();
                          }}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px]"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailTxId(r.id);
                          }}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
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
                <TransactionPlCells
                  type={r.type}
                  pl={useDbWac ? wacPlFromRow(r) : plById.get(r.id)}
                  loading={!useDbWac && wacLoading}
                />
              </TableRow>
            );
            })}

            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="py-10 text-center">
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
        wacDbEnabled={useDbWac}
        plById={plById}
        appUser={appUser}
        isAdmin={isAdmin}
        onClose={() => setDetailTxId(null)}
        onDeleted={() => {
          void refresh();
          void refreshStock();
          if (!useDbWac) void refreshWac();
        }}
        onUpdated={() => {
          void refresh();
          void refreshStock();
          if (!useDbWac) void refreshWac();
        }}
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
