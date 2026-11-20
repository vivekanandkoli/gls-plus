"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { PageWrapper } from "@/components/layout/PageWrapper";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrency } from "@/lib/utils";
import { useAppUser } from "@/hooks/use-app-user";

type Data = {
  year: number;
  book: "official" | "unofficial";
  years: number[];
  opening: { stockGm: number; valueThb: number; wac: number };
  purchases: { weightGm: number; valueThb: number; valueInvoicedThb: number };
  sales: { weightGm: number; valueThb: number };
  closing: { stockGm: number; wac: number; valueThb: number };
  cogsWac: number;
  realizedProfit: number;
  ownerClosingRate: number | null;
  ownerClosingRateAuto: boolean;
  latestSellRate: number | null;
  txnCount: number;
};

type HistoryEntry = {
  id: number;
  created_at: string;
  action: string;
  entity_type: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  performed_by_email: string | null;
};

const baht = (n: number) => formatCurrency(Number(n) || 0, "THB", "th-TH");
const grams = (n: number) =>
  `${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} g`;
const rate4 = (n: number) =>
  Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** One line of a waterfall: label on the left, value right-aligned. */
function Line({
  op,
  label,
  value,
  sub,
  strong,
  color,
}: {
  op?: "+" | "−" | "=";
  label: string;
  value: string;
  sub?: string;
  strong?: boolean;
  color?: "green" | "red" | "muted";
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-2", strong && "border-t pt-3")}>
      <div className="flex items-baseline gap-2">
        {op ? <span className="w-3 text-muted-foreground">{op}</span> : <span className="w-3" />}
        <span className={cn("text-sm", strong ? "font-semibold text-foreground" : "text-muted-foreground")}>
          {label}
        </span>
      </div>
      <div className="text-right">
        <div
          className={cn(
            "tabular-nums",
            strong ? "text-base font-semibold" : "text-sm",
            color === "green" && "text-emerald-600",
            color === "red" && "text-red-600"
          )}
        >
          {value}
        </div>
        {sub ? <div className="text-[11px] tabular-nums text-muted-foreground">{sub}</div> : null}
      </div>
    </div>
  );
}

export default function WacExplainedPage() {
  const now = new Date().getUTCFullYear();
  const { isAdmin } = useAppUser();
  const [year, setYear] = useState(now);
  const [book, setBook] = useState<"official" | "unofficial">("official");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Owner/period method inputs (editable, to reconcile to a spreadsheet).
  const [ownerRate, setOwnerRate] = useState<string>("4510");
  const [ownerOpening, setOwnerOpening] = useState<string>("");
  const [autoRate, setAutoRate] = useState<boolean>(true);

  // Apply-to-app flow (admin only).
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/wac-explained?year=${year}&book=${book}`);
      const d: Data = await res.json();
      if (!res.ok) throw new Error((d as { error?: string }).error || "Failed to load");
      setData(d);
      // Seed the owner-method inputs. Opening value from the app. For the
      // closing rate: if a rate is applied, reflect its mode; otherwise default
      // to AUTO (follow the latest sell rate), falling back to 4510.
      setOwnerOpening(String(d.opening.valueThb));
      if (d.ownerClosingRate != null) {
        setAutoRate(d.ownerClosingRateAuto);
        setOwnerRate(String(d.ownerClosingRate));
      } else {
        setAutoRate(true);
        setOwnerRate(d.latestSellRate != null ? String(d.latestSellRate) : "4510");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [year, book]);

  async function applyOwnerMethod() {
    if (!data) return;
    setApplying(true);
    setApplyMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/reports/apply-owner-method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          book,
          year,
          openingStockGm: data.opening.stockGm,
          openingStockValue: Number(ownerOpening) || 0,
          closingRateAuto: autoRate,
          closingRate: autoRate ? data.latestSellRate ?? 0 : Number(ownerRate) || 0,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to apply");
      setApplyMsg(
        `Applied. ${book} ${year} now reports profit the spreadsheet way — declared profit ${baht(d.periodProfit ?? 0)} (WAC was ${baht(d.wacProfit ?? 0)})${
          d.closingRateAuto ? ", closing rate following the latest sell automatically" : ""
        }. The dashboard and reports now use these values.`
      );
      setConfirmOpen(false);
      await load();
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setConfirmOpen(false);
    } finally {
      setApplying(false);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  const owner = useMemo(() => {
    if (!data) return null;
    const rate = autoRate ? data.latestSellRate ?? 0 : Number(ownerRate) || 0;
    const openingVal = ownerOpening === "" ? data.opening.valueThb : Number(ownerOpening) || 0;
    const closingValueOwner = data.closing.stockGm * rate;
    const cogsOwner = openingVal + data.purchases.valueThb - closingValueOwner;
    const profitOwner = data.sales.valueThb - cogsOwner;
    return {
      rate,
      openingVal,
      closingValueOwner,
      cogsOwner,
      profitOwner,
      diffVsWac: profitOwner - data.realizedProfit,
    };
  }, [data, ownerRate, ownerOpening, autoRate]);

  const loadHistory = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch(
        `/api/activity-log?entityType=owner_method,opening_balance&entityId=${book}-${year}&limit=20`
      );
      const d = await res.json();
      if (res.ok) setHistory(d.entries ?? []);
    } catch {
      /* non-fatal */
    }
  }, [isAdmin, book, year]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  return (
    <PageWrapper
      title="WAC & Profit Explained"
      description="Exactly how the dashboard's weighted-average cost (WAC) and profit are calculated — every value and formula."
    >
      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          Year
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value) || now)}
            className="rounded-md border bg-card px-2 py-1.5 text-sm"
          >
            {(data?.years ?? [now]).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <div className="inline-flex rounded-md border p-0.5">
          {(["official", "unofficial"] as const).map((b) => (
            <button
              key={b}
              onClick={() => setBook(b)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm capitalize transition-colors",
                book === b ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {applyMsg ? (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{applyMsg}</div>
      ) : null}

      {loading && !data ? (
        <div className="space-y-4">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* ── Card A: the app's WAC method ── */}
          <Card>
            <CardContent className="p-5">
              <div className="mb-1 flex items-center gap-2">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  App method
                </span>
                <h3 className="text-base font-semibold">Weighted Average Cost (WAC)</h3>
              </div>
              <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                Every BUY blends into one running average cost. Each SELL&apos;s cost = weight × the WAC at
                that moment; profit = sale − that cost. Unsold stock stays valued at cost (WAC).
              </p>

              <Line op="+" label="Opening stock value" value={baht(data.opening.valueThb)}
                sub={`${grams(data.opening.stockGm)} @ ${rate4(data.opening.wac)}`} />
              <Line op="+" label="Purchases (at cost)" value={baht(data.purchases.valueThb)}
                sub={`${grams(data.purchases.weightGm)} bought`} />
              <Line op="−" label="Closing stock value" value={baht(data.closing.valueThb)}
                sub={`${grams(data.closing.stockGm)} @ WAC ${rate4(data.closing.wac)}`} />
              <Line op="=" label="Cost of goods sold (COGS)" value={baht(data.cogsWac)} strong />

              <div className="mt-3 rounded-lg bg-muted/40 p-3">
                <Line label="Sales (revenue)" value={baht(data.sales.valueThb)}
                  sub={`${grams(data.sales.weightGm)} sold`} />
                <Line op="−" label="COGS (from above)" value={baht(data.cogsWac)} />
                <Line
                  op="="
                  label="Realized profit / loss"
                  value={baht(data.realizedProfit)}
                  strong
                  color={data.realizedProfit >= 0 ? "green" : "red"}
                />
              </div>

              <div className="mt-3 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                <div className="font-medium text-foreground">Current WAC</div>
                Closing value ÷ closing weight = {baht(data.closing.valueThb)} ÷ {grams(data.closing.stockGm)} ={" "}
                <span className="font-semibold text-foreground">{rate4(data.closing.wac)} / g</span>
                <div className="mt-1">This is the figure shown on the dashboard. Based on {data.txnCount} approved transactions.</div>
                {isAdmin ? (
                  <div className="mt-2">
                    Opening value look wrong?{" "}
                    <Link href="/settings/opening-balances" className="font-medium text-primary hover:underline">
                      Edit opening balance →
                    </Link>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {/* ── Card B: owner / period method ── */}
          <Card>
            <CardContent className="p-5">
              <div className="mb-1 flex items-center gap-2">
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  Spreadsheet method
                </span>
                <h3 className="text-base font-semibold">Owner / period method</h3>
                {data.ownerClosingRate != null ? (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                    Applied
                  </span>
                ) : null}
              </div>
              <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                Same sales and purchases, but closing stock is marked to a <strong>rate you choose</strong> (your
                spreadsheet&apos;s yellow cell) instead of WAC. Edit the two values to match your sheet.
              </p>

              <div className="mb-3 grid grid-cols-2 gap-3">
                <label className="text-xs text-muted-foreground">
                  <span className="flex items-center justify-between gap-1">
                    <span>Closing rate (THB/g)</span>
                    <span className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={autoRate}
                        onChange={(e) => setAutoRate(e.target.checked)}
                        className="h-3 w-3"
                      />
                      <span className="text-[10px]">auto</span>
                    </span>
                  </span>
                  <input
                    type="number"
                    value={autoRate ? (data.latestSellRate ?? "") : ownerRate}
                    onChange={(e) => setOwnerRate(e.target.value)}
                    disabled={autoRate}
                    className="mt-1 w-full rounded-md border bg-card px-2 py-1.5 text-sm text-foreground disabled:opacity-60"
                  />
                  {autoRate ? (
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      Follows latest sell
                      {data.latestSellRate != null ? ` (${rate4(data.latestSellRate)})` : " — no sells yet"}
                    </span>
                  ) : null}
                </label>
                <label className="text-xs text-muted-foreground">
                  Opening stock value (THB)
                  <input
                    type="number"
                    value={ownerOpening}
                    onChange={(e) => setOwnerOpening(e.target.value)}
                    className="mt-1 w-full rounded-md border bg-card px-2 py-1.5 text-sm text-foreground"
                  />
                </label>
              </div>

              {owner ? (
                <>
                  <Line op="+" label="Opening stock value" value={baht(owner.openingVal)} />
                  <Line op="+" label="Purchases (at cost)" value={baht(data.purchases.valueThb)} />
                  <Line
                    op="−"
                    label="Closing stock value"
                    value={baht(owner.closingValueOwner)}
                    sub={`${grams(data.closing.stockGm)} @ ${rate4(owner.rate)}`}
                  />
                  <Line op="=" label="Cost of goods sold (COGS)" value={baht(owner.cogsOwner)} strong />

                  <div className="mt-3 rounded-lg bg-muted/40 p-3">
                    <Line label="Sales (revenue)" value={baht(data.sales.valueThb)} />
                    <Line op="−" label="COGS (from above)" value={baht(owner.cogsOwner)} />
                    <Line
                      op="="
                      label="Profit / loss"
                      value={baht(owner.profitOwner)}
                      strong
                      color={owner.profitOwner >= 0 ? "green" : "red"}
                    />
                  </div>

                  <div className="mt-3 rounded-lg border border-dashed p-3 text-xs">
                    <div className="font-medium text-foreground">Difference vs the app (WAC)</div>
                    <div className="mt-1 text-muted-foreground">
                      {baht(owner.profitOwner)} − {baht(data.realizedProfit)} ={" "}
                      <span className={cn("font-semibold", owner.diffVsWac >= 0 ? "text-emerald-600" : "text-red-600")}>
                        {baht(owner.diffVsWac)}
                      </span>
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      Almost all of this is the closing-stock revaluation: {grams(data.closing.stockGm)} ×
                      ({rate4(owner.rate)} − WAC {rate4(data.closing.wac)}) ={" "}
                      {baht(data.closing.stockGm * (owner.rate - data.closing.wac))}. The rest is any difference in
                      the opening value you entered.
                    </div>
                  </div>

                  {isAdmin ? (
                    <div className="mt-4 border-t pt-3">
                      <Button
                        className="w-full"
                        onClick={() => setConfirmOpen(true)}
                        disabled={
                          applying ||
                          !ownerOpening ||
                          (autoRate ? data.latestSellRate == null : !ownerRate)
                        }
                      >
                        Apply this method to the whole app
                      </Button>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Makes <strong>{book} {year}</strong> report profit this way everywhere (dashboard &amp; reports),
                        and re-bases every transaction&apos;s WAC to the opening value above.
                      </p>
                    </div>
                  ) : null}
                </>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {isAdmin && history.length > 0 ? (
        <Card className="mt-6">
          <CardContent className="p-5">
            <h3 className="mb-1 text-sm font-semibold">Change history</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Every change to the opening value and closing rate for {book} {year}, with who made it.
            </p>
            <ul className="divide-y text-sm">
              {history.map((h) => {
                const nv = (h.new_values ?? {}) as Record<string, unknown>;
                const openingVal = nv.opening_stock_value_thb;
                const closing = nv.closing_rate;
                const auto = nv.closing_rate_auto;
                return (
                  <li key={h.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
                    <div className="min-w-0">
                      <span className="font-medium capitalize text-foreground">{h.action}</span>{" "}
                      <span className="text-muted-foreground">
                        {h.entity_type === "owner_method" ? "owner method" : "opening balance"}
                      </span>
                      <div className="text-xs text-muted-foreground">
                        {h.performed_by_email ?? "system"} · {new Date(h.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right text-xs tabular-nums text-muted-foreground">
                      {openingVal != null ? <div>opening {baht(Number(openingVal))}</div> : null}
                      {closing != null ? (
                        <div>
                          closing {rate4(Number(closing))}
                          {auto ? " (auto)" : ""}
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <p className="mt-4 text-xs text-muted-foreground">
        Neither method is &ldquo;wrong&rdquo; — WAC values unsold stock at actual average cost (realized margin only);
        the owner method marks unsold stock to a chosen market rate (books an unrealized gain). Once applied, the
        dashboard shows the owner/period profit for that book &amp; year.
      </p>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply the spreadsheet method to the whole app?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>
                  This changes the reported profit for the <strong>{book}</strong> book,{" "}
                  <strong>{year}</strong>, everywhere in the app (dashboard &amp; reports):
                </div>
                {data ? (
                  <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                    <li>
                      Opening stock value set to <strong>{baht(Number(ownerOpening) || 0)}</strong>{" "}
                      ({grams(data.opening.stockGm)} @ {rate4((Number(ownerOpening) || 0) / (data.opening.stockGm || 1))}/g)
                      — this re-bases <strong>every {year} {book} transaction&apos;s WAC</strong>.
                    </li>
                    <li>
                      Closing stock valued at{" "}
                      <strong>{rate4(owner ? owner.rate : 0)}/g</strong>
                      {autoRate ? " — automatically following the latest sell rate going forward" : " (fixed)"}.
                    </li>
                    <li>
                      Declared profit becomes{" "}
                      <strong className={cn(owner && owner.profitOwner >= 0 ? "text-emerald-600" : "text-red-600")}>
                        {owner ? baht(owner.profitOwner) : "—"}
                      </strong>{" "}
                      (was {baht(data.realizedProfit)} on WAC).
                    </li>
                  </ul>
                ) : null}
                <div className="text-xs text-muted-foreground">
                  Per-sale cost stays weighted-average. You can change these values again any time.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applying}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void applyOwnerMethod();
              }}
              disabled={applying}
            >
              {applying ? "Applying…" : "Yes, apply to all transactions"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageWrapper>
  );
}
