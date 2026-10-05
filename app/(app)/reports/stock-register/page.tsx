"use client";

import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Row = {
  srNo: number;
  date: string;
  name: string;
  invoiceBuy: string;
  invoiceSale: string;
  buyWt: number | null;
  sellWt: number | null;
  balance: number;
  buyRate: number | null;
  buyAmt: number | null;
  sellRate: number | null;
  sellAmt: number | null;
};

const n2 = (v: number | null) =>
  v == null ? "" : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n3 = (v: number | null) =>
  v == null ? "" : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 });

export default function StockRegisterPage() {
  const now = new Date().getUTCFullYear();
  const [year, setYear] = useState(now);
  const [book, setBook] = useState<"official" | "unofficial">("official");
  const [rows, setRows] = useState<Row[]>([]);
  const [opening, setOpening] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/stock-register?year=${year}&book=${book}`);
      const d = await res.json();
      if (res.ok) {
        setRows(d.rows ?? []);
        setOpening(Number(d.openingStock) || 0);
      }
    } finally {
      setLoading(false);
    }
  }, [year, book]);

  useEffect(() => { void load(); }, [load]);

  const exportXlsx = () => {
    window.location.href = `/api/reports/stock-register?year=${year}&book=${book}&format=xlsx`;
  };

  const head = (label: string, right = false) => (
    <TableHead className={cn("whitespace-nowrap", right && "text-right")}>{label}</TableHead>
  );

  return (
    <PageWrapper
      title="Stock Register"
      description="Full buy/sell register with running stock — the same layout as your spreadsheet."
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          Year
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value) || now)}
            className="w-24 rounded-md border bg-background px-2 py-1.5 text-sm"
            style={{ borderColor: "var(--border)" }}
          />
        </label>
        <div className="inline-flex rounded-md border p-0.5" style={{ borderColor: "var(--border)" }}>
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
        <div className="flex-1" />
        <Button variant="outline" onClick={exportXlsx} disabled={rows.length === 0}>
          <Download className="mr-1.5 h-4 w-4" /> Export to Excel
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {head("Sr. No.")}
                  {head("Date")}
                  {head("Name")}
                  {head("invoice BUY")}
                  {head("Invoice sale")}
                  {head("BUY", true)}
                  {head("SALE", true)}
                  {head("Balance", true)}
                  {head("BUY", true)}
                  {head("Rate", true)}
                  {head("Amount", true)}
                  {head("SALE", true)}
                  {head("Rate", true)}
                  {head("Amount", true)}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="bg-muted/40">
                  <TableCell colSpan={7} className="text-right text-xs font-medium text-muted-foreground">
                    Opening stock {year}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{n3(opening)}</TableCell>
                  <TableCell colSpan={6} />
                </TableRow>
                {rows.map((r) => (
                  <TableRow key={r.srNo}>
                    <TableCell className="text-muted-foreground">{r.srNo}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.date}</TableCell>
                    <TableCell className="max-w-[160px] truncate">{r.name}</TableCell>
                    <TableCell className="font-mono text-xs">{r.invoiceBuy}</TableCell>
                    <TableCell className="font-mono text-xs">{r.invoiceSale}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-700">{n2(r.buyWt)}</TableCell>
                    <TableCell className="text-right tabular-nums text-amber-700">{n2(r.sellWt)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums font-medium", r.balance < 0 && "text-red-600")}>{n3(r.balance)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{n2(r.buyWt)}</TableCell>
                    <TableCell className="text-right tabular-nums">{n2(r.buyRate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{n2(r.buyAmt)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{n2(r.sellWt)}</TableCell>
                    <TableCell className="text-right tabular-nums">{n2(r.sellRate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{n2(r.sellAmt)}</TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={14} className="py-10 text-center text-muted-foreground">
                      {loading ? "Loading…" : "No transactions for this year."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <p className="mt-2 text-xs text-muted-foreground">
        {rows.length.toLocaleString()} transactions · columns match your stock spreadsheet · use “Export to Excel” for the .xlsx.
      </p>
    </PageWrapper>
  );
}
