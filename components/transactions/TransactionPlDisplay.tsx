"use client";

import { TableCell } from "@/components/ui/table";
import { cn, formatCurrency } from "@/lib/utils";
import {
  formatWacRate,
  previewSellPl,
  type WacPlEntry,
} from "@/lib/wac-ledger";

export function wacPlFromRow(row: {
  wac_at_sale?: number | null;
  cost_of_sale?: number | null;
  profit_loss?: number | null;
  pl_percent?: number | null;
}): WacPlEntry | undefined {
  if (row.wac_at_sale == null) return undefined;
  return {
    wacAtSale: row.wac_at_sale,
    costOfSale: row.cost_of_sale ?? null,
    profitLoss: row.profit_loss ?? null,
    plPercent: row.pl_percent ?? null,
    insufficientStock: false,
  };
}

// ─── Table list cells ──────────────────────────────────────────────────────

export function TransactionPlCells({
  type,
  pl,
  loading,
}: {
  type: "BUY" | "SELL";
  pl: WacPlEntry | undefined;
  loading?: boolean;
}) {
  if (loading && type === "SELL") {
    return (
      <>
        <TableCell className="text-right text-muted-foreground">…</TableCell>
        <TableCell className="text-right text-muted-foreground">…</TableCell>
        <TableCell className="text-right text-muted-foreground">…</TableCell>
      </>
    );
  }

  if (type === "BUY" || !pl?.wacAtSale) {
    return (
      <>
        <TableCell className="text-right text-muted-foreground">-</TableCell>
        <TableCell className="text-right text-muted-foreground">-</TableCell>
        <TableCell className="text-right text-muted-foreground">-</TableCell>
      </>
    );
  }

  const profit = pl.profitLoss ?? 0;
  const profitClass =
    profit > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : profit < 0
        ? "text-red-600 dark:text-red-400"
        : "";

  return (
    <>
      <TableCell className="text-right tabular-nums">{formatWacRate(pl.wacAtSale)}</TableCell>
      <TableCell className="text-right tabular-nums">
        {pl.costOfSale != null ? formatCurrency(pl.costOfSale, "THB", "th-TH") : "-"}
      </TableCell>
      <TableCell
        className={cn("text-right tabular-nums font-medium", profitClass)}
        title={pl.insufficientStock ? "Stock warning: insufficient stock" : undefined}
      >
        {pl.profitLoss != null ? formatCurrency(pl.profitLoss, "THB", "th-TH") : "-"}
        {pl.plPercent != null && (
          <span className="ml-1 text-xs opacity-80">
            ({pl.plPercent > 0 ? "+" : ""}{pl.plPercent.toFixed(2)}%)
          </span>
        )}
        {pl.insufficientStock ? (
          <span className="ml-1 text-amber-600 dark:text-amber-400" aria-label="Insufficient stock">
            ⚠
          </span>
        ) : null}
      </TableCell>
    </>
  );
}

// ─── Detail modal block ────────────────────────────────────────────────────

export function TransactionPlDetailBlock({
  type,
  pl,
}: {
  type: "BUY" | "SELL";
  pl: WacPlEntry | undefined;
}) {
  if (type === "BUY" || !pl?.wacAtSale) return null;

  const profit = pl.profitLoss ?? 0;
  const profitClass =
    profit > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : profit < 0
        ? "text-red-600 dark:text-red-400"
        : "";
  const arrow = profit > 0 ? "▲" : profit < 0 ? "▼" : "";

  return (
    <>
      <div className="flex items-start gap-3 px-3 py-2">
        <span className="w-36 shrink-0 text-muted-foreground">WAC at sale</span>
        <span className="font-medium tabular-nums">
          ฿{formatWacRate(pl.wacAtSale)} /gm
        </span>
      </div>
      <div className="flex items-start gap-3 px-3 py-2">
        <span className="w-36 shrink-0 text-muted-foreground">Cost of sale</span>
        <span className="font-medium tabular-nums">
          {pl.costOfSale != null ? formatCurrency(pl.costOfSale, "THB", "th-TH") : "-"}
        </span>
      </div>
      <div className="flex items-start gap-3 px-3 py-2">
        <span className="w-36 shrink-0 text-muted-foreground">Profit / Loss</span>
        <span className={cn("font-semibold tabular-nums", profitClass)}>
          {pl.profitLoss != null ? formatCurrency(pl.profitLoss, "THB", "th-TH") : "-"}
          {pl.plPercent != null && (
            <span className="ml-2 text-sm font-medium">
              ({pl.plPercent > 0 ? "+" : ""}{pl.plPercent.toFixed(2)}%) {arrow}
            </span>
          )}
        </span>
      </div>
      {pl.insufficientStock && (
        <div className="px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-400">
          Stock warning: insufficient stock
        </div>
      )}
    </>
  );
}

// ─── Real-time preview card ────────────────────────────────────────────────

export function SellPlPreviewCard({
  weightGrams,
  ratePerGram,
  currentWac,
  stockGm,
  loading,
}: {
  weightGrams: number;
  ratePerGram: number;
  currentWac: number;
  stockGm?: number;
  loading?: boolean;
}) {
  const isEmpty = weightGrams <= 0 || ratePerGram <= 0;

  if (loading) {
    return (
      <div className="rounded-lg border bg-muted/50 px-4 py-3 text-sm text-muted-foreground animate-pulse">
        Loading WAC…
      </div>
    );
  }

  const amountThb = weightGrams * ratePerGram;
  const { profitLoss } = isEmpty
    ? { profitLoss: 0 }
    : previewSellPl(weightGrams, amountThb, currentWac);
  const costOfSale = isEmpty ? 0 : weightGrams * currentWac;
  const plPercent = !isEmpty && costOfSale > 0 ? (profitLoss / costOfSale) * 100 : 0;

  const isProfit = !isEmpty && profitLoss > 0;
  const isLoss = !isEmpty && profitLoss < 0;

  const bgClass = isEmpty
    ? "bg-muted/50 border-border"
    : isProfit
      ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800"
      : isLoss
        ? "bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-800"
        : "bg-muted/50 border-border";

  const plClass = isEmpty
    ? "text-muted-foreground"
    : isProfit
      ? "text-emerald-700 dark:text-emerald-300"
      : isLoss
        ? "text-red-700 dark:text-red-300"
        : "";

  const arrow = isEmpty ? "" : isProfit ? "▲" : isLoss ? "▼" : "";

  return (
    <div className={cn("rounded-lg border px-4 py-3 text-sm transition-colors", bgClass)}>
      <div className="flex items-center justify-between py-0.5">
        <span className="text-muted-foreground">Current WAC</span>
        <span className="tabular-nums font-medium">
          {isEmpty ? "-" : `฿${formatWacRate(currentWac)} /gm`}
        </span>
      </div>
      <div className="flex items-center justify-between py-0.5">
        <span className="text-muted-foreground">Cost of Sale</span>
        <span className="tabular-nums font-medium">
          {isEmpty ? "-" : formatCurrency(costOfSale, "THB", "th-TH")}
        </span>
      </div>
      <div className="flex items-center justify-between py-0.5">
        <span className="text-muted-foreground">Profit / Loss</span>
        <span className={cn("tabular-nums font-medium", plClass)}>
          {isEmpty ? "-" : formatCurrency(profitLoss, "THB", "th-TH")}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between border-t border-dashed pt-1.5">
        <span className="text-muted-foreground text-xs">P&amp;L %</span>
        <span className={cn("tabular-nums text-lg font-bold", plClass)}>
          {isEmpty ? "- %" : `${arrow} ${Math.abs(plPercent).toFixed(2)}%`}
        </span>
      </div>
      {stockGm != null && stockGm > 0 && !isEmpty && (
        <div className="mt-1 text-xs text-muted-foreground">
          Available stock: {stockGm.toFixed(3)} gm
        </div>
      )}
    </div>
  );
}

/** @deprecated Use SellPlPreviewCard instead */
export function SellPlPreviewBox({
  weightGrams,
  amountThb,
  currentWac,
  loading,
}: {
  weightGrams: number;
  amountThb: number;
  currentWac: number;
  loading?: boolean;
}) {
  const ratePerGram = weightGrams > 0 ? amountThb / weightGrams : 0;
  return (
    <SellPlPreviewCard
      weightGrams={weightGrams}
      ratePerGram={ratePerGram}
      currentWac={currentWac}
      loading={loading}
    />
  );
}
