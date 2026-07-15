"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";
import { useAppUser } from "@/hooks/use-app-user";

type Book = "official" | "unofficial";

type InventoryState = { stockGm: number; wac: number; stockValueThb: number };
type Row = {
  id: string;
  date: string;
  type: "BUY" | "SELL";
  invoiceNumber: string | null;
  weightGm: number;
  ratePerGram: number;
  amountThb: number;
  profitLoss: number | null;
  runningStockGm: number;
};
type Totals = { buyGm: number; buyThb: number; sellGm: number; sellThb: number; realizedProfit: number; vatThb: number };
type Statement = { book: Book; from: string; to: string; opening: InventoryState; closing: InventoryState; rows: Row[]; totals: Totals };

type ReconSide = Totals & { closingStockGm: number; closingWac: number };
type Reconciliation = { from: string; to: string; official: ReconSide; unofficial: ReconSide; variance: { buyThb: number; sellThb: number; realizedProfit: number } };

const YEAR = new Date().getFullYear();

function gm(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function ReportsPage() {
  const { isAdmin } = useAppUser();
  const [book, setBook] = useState<Book>("official");
  const [from, setFrom] = useState(`${YEAR}-01-01`);
  const [to, setTo] = useState(`${YEAR}-12-31`);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [recon, setRecon] = useState<Reconciliation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ book, from, to });
      const stPromise = fetch(`/api/reports/book-statement?${q}`).then((r) => r.json());
      const rcPromise = isAdmin
        ? fetch(`/api/reports/reconciliation?${new URLSearchParams({ from, to })}`).then((r) => r.json())
        : Promise.resolve(null);
      const [st, rc] = await Promise.all([stPromise, rcPromise]);
      if (st?.error) throw new Error(st.error);
      setStatement(st as Statement);
      setRecon(rc && !rc.error ? (rc as Reconciliation) : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [book, from, to, isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const isUnofficial = book === "unofficial";
  const statementTitle = useMemo(
    () => (isUnofficial ? "Owner actual (Unofficial / vault)" : "Official statement (tax / audit)"),
    [isUnofficial]
  );

  return (
    <PageWrapper title="Reports" description="Per-book statements and the official-vs-actual reconciliation.">
      <div className="mb-4 flex flex-wrap items-end gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBook("official")}
            className={cn("rounded-md border px-3 py-1.5 text-sm", book === "official" ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}
          >
            Official
          </button>
          {isAdmin && (
            <button
              onClick={() => setBook("unofficial")}
              className={cn("rounded-md border px-3 py-1.5 text-sm", book === "unofficial" ? "border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" : "border-border hover:bg-muted")}
            >
              🔒 Unofficial
            </button>
          )}
        </div>
        <label className="text-sm">
          <span className="mr-1 text-muted-foreground">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1" />
        </label>
        <label className="text-sm">
          <span className="mr-1 text-muted-foreground">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1" />
        </label>
        <Button variant="outline" onClick={() => window.print()}>Print</Button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">{error}</div>
      )}

      {/* Reconciliation summary (admin) */}
      {isAdmin && recon && (
        <div className="mb-6 rounded-lg border border-border p-4">
          <h2 className="mb-3 text-sm font-medium">Reconciliation — actual (unofficial) vs declared (official)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr><th className="py-1">Metric</th><th className="py-1 text-right">Unofficial (actual)</th><th className="py-1 text-right">Official (declared)</th><th className="py-1 text-right">Variance</th></tr>
              </thead>
              <tbody>
                <tr className="border-t border-border"><td className="py-1.5">Buy value</td><td className="py-1.5 text-right">{formatCurrency(recon.unofficial.buyThb, "THB", "th-TH")}</td><td className="py-1.5 text-right">{formatCurrency(recon.official.buyThb, "THB", "th-TH")}</td><td className="py-1.5 text-right">{formatCurrency(recon.variance.buyThb, "THB", "th-TH")}</td></tr>
                <tr className="border-t border-border"><td className="py-1.5">Sell value</td><td className="py-1.5 text-right">{formatCurrency(recon.unofficial.sellThb, "THB", "th-TH")}</td><td className="py-1.5 text-right">{formatCurrency(recon.official.sellThb, "THB", "th-TH")}</td><td className="py-1.5 text-right">{formatCurrency(recon.variance.sellThb, "THB", "th-TH")}</td></tr>
                <tr className="border-t border-border font-medium"><td className="py-1.5">Realized P/L</td><td className="py-1.5 text-right">{formatCurrency(recon.unofficial.realizedProfit, "THB", "th-TH")}</td><td className="py-1.5 text-right">{formatCurrency(recon.official.realizedProfit, "THB", "th-TH")}</td><td className="py-1.5 text-right">{formatCurrency(recon.variance.realizedProfit, "THB", "th-TH")}</td></tr>
                <tr className="border-t border-border"><td className="py-1.5">Closing stock</td><td className="py-1.5 text-right">{gm(recon.unofficial.closingStockGm)}g</td><td className="py-1.5 text-right">{gm(recon.official.closingStockGm)}g</td><td className="py-1.5 text-right">{gm(recon.unofficial.closingStockGm - recon.official.closingStockGm)}g</td></tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Actual P/L is the unofficial figure. Official is the declared tax view. Variance = actual − declared.</p>
        </div>
      )}

      {/* Book statement */}
      <div className={cn("rounded-lg border p-4", isUnofficial ? "border-amber-400" : "border-border")}>
        <h2 className="mb-1 text-base font-medium">{statementTitle}</h2>
        <p className="mb-3 text-xs text-muted-foreground">{from} → {to}</p>

        {statement && (
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
            <div className="rounded-md bg-muted/50 p-2"><div className="text-xs text-muted-foreground">Opening stock</div><div className="font-medium tabular-nums">{gm(statement.opening.stockGm)}g @ {statement.opening.wac.toFixed(2)}</div></div>
            <div className="rounded-md bg-muted/50 p-2"><div className="text-xs text-muted-foreground">Closing stock</div><div className="font-medium tabular-nums">{gm(statement.closing.stockGm)}g @ {statement.closing.wac.toFixed(2)}</div></div>
            <div className="rounded-md bg-muted/50 p-2"><div className="text-xs text-muted-foreground">Realized P/L</div><div className={cn("font-semibold tabular-nums", statement.totals.realizedProfit >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600")}>{formatCurrency(statement.totals.realizedProfit, "THB", "th-TH")}</div></div>
            {!isUnofficial && <div className="rounded-md bg-muted/50 p-2"><div className="text-xs text-muted-foreground">VAT total</div><div className="font-medium tabular-nums">{formatCurrency(statement.totals.vatThb, "THB", "th-TH")}</div></div>}
          </div>
        )}

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="px-2 py-1.5">Date</th><th className="px-2 py-1.5">Invoice</th><th className="px-2 py-1.5">Type</th><th className="px-2 py-1.5 text-right">Weight</th><th className="px-2 py-1.5 text-right">Rate</th><th className="px-2 py-1.5 text-right">Amount</th><th className="px-2 py-1.5 text-right">P/L</th><th className="px-2 py-1.5 text-right">Stock after</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-2 py-6 text-center text-muted-foreground">Loading…</td></tr>
              ) : !statement || statement.rows.length === 0 ? (
                <tr><td colSpan={8} className="px-2 py-6 text-center text-muted-foreground">No transactions in this period.</td></tr>
              ) : (
                statement.rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="whitespace-nowrap px-2 py-1.5">{r.date}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono text-xs">{r.invoiceNumber ?? "—"}</td>
                    <td className="px-2 py-1.5"><span className={r.type === "BUY" ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}>{r.type}</span></td>
                    <td className="px-2 py-1.5 text-right">{gm(r.weightGm)}g</td>
                    <td className="px-2 py-1.5 text-right">{r.ratePerGram.toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right">{formatCurrency(r.amountThb, "THB", "th-TH")}</td>
                    <td className="px-2 py-1.5 text-right">{r.profitLoss != null ? <span className={r.profitLoss >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600"}>{formatCurrency(r.profitLoss, "THB", "th-TH")}</span> : "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{gm(r.runningStockGm)}g</td>
                  </tr>
                ))
              )}
            </tbody>
            {statement && statement.rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border font-medium">
                  <td className="px-2 py-1.5" colSpan={3}>Totals</td>
                  <td className="px-2 py-1.5 text-right">buy {gm(statement.totals.buyGm)}g · sell {gm(statement.totals.sellGm)}g</td>
                  <td className="px-2 py-1.5" />
                  <td className="px-2 py-1.5 text-right">{formatCurrency(statement.totals.sellThb - statement.totals.buyThb, "THB", "th-TH")}</td>
                  <td className="px-2 py-1.5 text-right">{formatCurrency(statement.totals.realizedProfit, "THB", "th-TH")}</td>
                  <td className="px-2 py-1.5" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </PageWrapper>
  );
}
