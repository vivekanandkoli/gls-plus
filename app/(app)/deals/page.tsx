"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatCurrency } from "@/lib/utils";
import { useAppUser } from "@/hooks/use-app-user";
import type { DealRecord, PaymentMode } from "@/lib/deals-service";

// ── Types ─────────────────────────────────────────────────────────────────────
type DealRow = DealRecord & {
  buy_client: { id: number; name: string } | null;
  sell_client: { id: number; name: string } | null;
};

// ── Payment mode badge ────────────────────────────────────────────────────────
const PAYMENT_CONFIG: Record<PaymentMode, { icon: string; label: string; className: string }> = {
  cash: { icon: "💵", label: "CASH", className: "bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300" },
  bank: { icon: "🏦", label: "BANK", className: "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300" },
  qr: { icon: "📱", label: "QR", className: "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300" },
  cheque: { icon: "📄", label: "CHEQUE", className: "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/40 dark:text-purple-300" },
};

function PaymentBadge({ mode }: { mode: PaymentMode }) {
  const cfg = PAYMENT_CONFIG[mode] ?? PAYMENT_CONFIG.cash;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", cfg.className)}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "approved")
    return <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300">Approved</Badge>;
  if (status === "rejected")
    return <Badge className="bg-red-100 text-red-700 border border-red-300 dark:bg-red-900/40 dark:text-red-300">Rejected</Badge>;
  return <Badge className="bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-900/40 dark:text-amber-300">Pending</Badge>;
}

type FilterTab = "all" | "pending" | "approved" | "rejected";

// ── Main component ────────────────────────────────────────────────────────────
export default function DealsPage() {
  const router = useRouter();
  const { isAdmin } = useAppUser();

  const [deals, setDeals] = useState<DealRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<FilterTab>("all");
  const [officialOnly, setOfficialOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  // Approve
  const [approveId, setApproveId] = useState<number | null>(null);
  const [approving, setApproving] = useState(false);

  // Reject
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  // Delete
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchDeals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (tab !== "all") params.set("status", tab);
      if (officialOnly) params.set("official_only", "true");

      const res = await fetch(`/api/deals?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Fetch failed");
      setDeals(data.deals ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [page, tab, officialOnly]);

  useEffect(() => { void fetchDeals(); }, [fetchDeals]);

  // Client-side search filter
  const filtered = useMemo(() => {
    if (!search.trim()) return deals;
    const q = search.toLowerCase();
    return deals.filter(
      (d) =>
        d.buy_invoice?.toLowerCase().includes(q) ||
        d.sell_invoice?.toLowerCase().includes(q) ||
        d.buy_client?.name?.toLowerCase().includes(q) ||
        d.sell_client?.name?.toLowerCase().includes(q) ||
        d.date?.includes(q)
    );
  }, [deals, search]);

  async function handleApprove() {
    if (!approveId) return;
    setApproving(true);
    try {
      const res = await fetch(`/api/deals/${approveId}/approve`, { method: "POST" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed"); }
      setApproveId(null);
      await fetchDeals();
    } finally { setApproving(false); }
  }

  async function handleReject() {
    if (!rejectId) return;
    setRejecting(true);
    try {
      const res = await fetch(`/api/deals/${rejectId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed"); }
      setRejectId(null);
      setRejectReason("");
      await fetchDeals();
    } finally { setRejecting(false); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/deals/${deleteId}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed"); }
      setDeleteId(null);
      await fetchDeals();
    } finally { setDeleting(false); }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const TABS: { value: FilterTab; label: string }[] = [
    { value: "all", label: "All" },
    { value: "pending", label: "Pending" },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected" },
  ];

  return (
    <PageWrapper title="Deals" description="One row per buy + sell pair.">
      {/* ── Header actions ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Filter tabs */}
          <div className="flex rounded-lg border bg-muted p-0.5">
            {TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => { setTab(t.value); setPage(0); }}
                className={cn(
                  "rounded-md px-3 py-1 text-sm font-medium transition-all",
                  tab === t.value
                    ? "bg-background shadow text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Official only toggle */}
          {isAdmin && (
            <button
              onClick={() => { setOfficialOnly(!officialOnly); setPage(0); }}
              className={cn(
                "rounded-lg border px-3 py-1 text-sm font-medium transition-all",
                officialOnly
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              )}
            >
              Official only
            </button>
          )}

          {/* Search */}
          <Input
            className="h-8 w-48 text-sm"
            placeholder="Search client, invoice..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Button asChild size="sm">
          <Link href="/deals/new">
            <Plus className="mr-1 h-4 w-4" />
            New Deal
          </Link>
        </Button>
      </div>

      {/* ── Table ── */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Wholesaler</TableHead>
                  <TableHead className="text-right">Weight (g)</TableHead>
                  {isAdmin && <TableHead className="text-right">Buy Rate</TableHead>}
                  <TableHead className="text-right">Sell Rate</TableHead>
                  {isAdmin && <TableHead className="text-right">Spread</TableHead>}
                  <TableHead className="text-right">Sell Amount</TableHead>
                  {isAdmin && <TableHead className="text-right">Profit (฿)</TableHead>}
                  {isAdmin && <TableHead className="text-right">Profit (%)</TableHead>}
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={99} className="py-10 text-center text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={99} className="py-10 text-center text-red-500">
                      {error}
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={99} className="py-10 text-center text-muted-foreground">
                      No deals found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((d) => {
                    const profit = typeof d.trading_profit === "number" ? d.trading_profit : 0;
                    const profitPct = typeof d.profit_pct === "number" ? d.profit_pct : 0;
                    const spread =
                      typeof d.sell_rate === "number" && typeof d.buy_rate === "number"
                        ? d.sell_rate - d.buy_rate
                        : null;
                    const isPositive = profit >= 0;

                    return (
                      <TableRow key={d.id} className="hover:bg-muted/30">
                        <TableCell className="font-medium whitespace-nowrap">{d.date}</TableCell>
                        <TableCell>{d.sell_client?.name ?? <span className="text-muted-foreground">-</span>}</TableCell>
                        <TableCell>{d.buy_client?.name ?? <span className="text-muted-foreground">-</span>}</TableCell>
                        <TableCell className="text-right font-mono">
                          {typeof d.weight_gm === "number"
                            ? d.weight_gm.toLocaleString(undefined, { minimumFractionDigits: 3 })
                            : "-"}
                        </TableCell>

                        {isAdmin && (
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">
                            {typeof d.buy_rate === "number"
                              ? d.buy_rate.toLocaleString(undefined, { minimumFractionDigits: 2 })
                              : "-"}
                          </TableCell>
                        )}

                        <TableCell className="text-right font-mono">
                          {typeof d.sell_rate === "number"
                            ? d.sell_rate.toLocaleString(undefined, { minimumFractionDigits: 2 })
                            : "-"}
                        </TableCell>

                        {isAdmin && (
                          <TableCell className="text-right font-mono text-xs">
                            {spread !== null
                              ? spread.toLocaleString(undefined, { minimumFractionDigits: 2 })
                              : "-"}
                          </TableCell>
                        )}

                        <TableCell className="text-right font-mono">
                          {typeof d.sell_amount === "number"
                            ? formatCurrency(d.sell_amount, "THB", "th-TH")
                            : "-"}
                        </TableCell>

                        {isAdmin && (
                          <TableCell
                            className={cn(
                              "text-right font-mono font-semibold",
                              isPositive ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
                            )}
                          >
                            {isPositive ? "+" : ""}
                            {formatCurrency(profit, "THB", "th-TH")}
                          </TableCell>
                        )}

                        {isAdmin && (
                          <TableCell
                            className={cn(
                              "text-right text-xs font-medium",
                              isPositive ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
                            )}
                          >
                            {profitPct.toFixed(2)}%
                          </TableCell>
                        )}

                        <TableCell>
                          <PaymentBadge mode={d.payment_mode as PaymentMode} />
                        </TableCell>

                        <TableCell>
                          <StatusBadge status={d.status} />
                        </TableCell>

                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {isAdmin && d.status === "pending" && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                                  onClick={() => setApproveId(d.id)}
                                >
                                  ✓
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-red-700 border-red-300 hover:bg-red-50"
                                  onClick={() => setRejectId(d.id)}
                                >
                                  ✕
                                </Button>
                              </>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-red-600"
                              onClick={() => setDeleteId(d.id)}
                            >
                              Del
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} deals total</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              ← Prev
            </Button>
            <span>
              Page {page + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1 || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </Button>
          </div>
        </div>
      )}

      {/* ── Approve confirm ── */}
      <AlertDialog open={approveId !== null} onOpenChange={() => setApproveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve deal #{approveId}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will approve the deal. Non-cash deals affect WAC calculations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApprove} disabled={approving}>
              {approving ? "Approving..." : "Approve"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Reject dialog ── */}
      <Dialog open={rejectId !== null} onOpenChange={() => { setRejectId(null); setRejectReason(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject deal #{rejectId}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              Reason for rejection (optional):
            </div>
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. incorrect rate"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectId(null); setRejectReason(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejecting}
            >
              {rejecting ? "Rejecting..." : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ── */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete deal #{deleteId}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageWrapper>
  );
}
