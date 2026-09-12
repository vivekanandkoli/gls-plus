"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FileText,
  Info,
  Printer,
  Search,
  X,
} from "lucide-react";
import { useReactToPrint } from "react-to-print";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { getSupabaseClient } from "@/lib/supabase";
import { cn, embeddedClientName, formatCurrency } from "@/lib/utils";
import {
  InvoiceDocument,
  type Settings,
  type TxDetail,
} from "@/components/PrintInvoice";

// ─── Types ────────────────────────────────────────────────────────────────────

type TxRow = {
  id: string;
  date: string;
  type: "BUY" | "SELL";
  invoice_number: string | null;
  weight_grams: number | null;
  rate_per_gram: number | null;
  amount_thb: number | null;
  vat_percent: number | null;
  notes: string | null;
  client: { name: string } | { name: string }[] | null;
};

// ─── Debounce hook ────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [dv, setDv] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return dv;
}

const PAGE_SIZE = 30;

const DEFAULT_SETTINGS: Settings = {
  company_name_en: "GLS PLUS CO., LTD.",
  company_name_th: "บริษัท จีแอลเอส พลัส จำกัด",
  address_en: "66/22 GEMOPOLIS INDUSTRIAL ESTATE SOI 31, KWAENG OOKMAI, KHET PRAWET, BANGKOK 10250",
  address_th: "66/22 ซ. 31 เจมโมโปลิส เขตประเวศ กรุงเทพฯ 10250",
  phone: "087-039-8795",
  email: "glsplusdb@gmail.com",
  tax_id: "0105563120430",
  invoice_footer_note: null,
  logo_data_url: null,
};

// ─── Invoice preview panel ────────────────────────────────────────────────────

function InvoicePreviewPanel({
  tx,
  settings,
  onClose,
}: {
  tx: TxDetail;
  settings: Settings;
  onClose: () => void;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({ contentRef: printRef });

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold font-mono">{tx.invoice_number ?? "Invoice"}</span>
          <Badge className={cn(
            "text-xs",
            tx.type === "BUY"
              ? "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
              : "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100"
          )}>
            {tx.type}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => handlePrint()}>
            <Printer className="mr-1.5 h-3.5 w-3.5" />
            Print
          </Button>
          <Button size="sm" onClick={() => handlePrint()}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Save PDF
          </Button>
          <button
            onClick={onClose}
            className="ml-1 rounded p-1.5 hover:bg-muted transition-colors"
            aria-label="Close preview"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Save as PDF tip */}
      <div className="flex items-start gap-2 px-4 py-2 text-xs text-muted-foreground bg-muted/40 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
        <span>Click <strong>Save PDF</strong> or <strong>Print</strong> → in the print dialog select <strong>Save as PDF</strong> as the printer to download a PDF file.</span>
      </div>

      {/* Hidden DOM node used by react-to-print */}
      <div style={{ position: "absolute", left: "-9999px", top: 0 }}>
        <div ref={printRef}>
          <InvoiceDocument tx={tx} settings={settings} />
        </div>
      </div>

      {/* Live preview - scrollable */}
      <div className="flex-1 overflow-auto bg-muted/30 p-4">
        <div
          className="mx-auto rounded-lg border shadow-sm overflow-hidden"
          style={{ maxWidth: "680px", background: "#fff" }}
        >
          <InvoiceDocument tx={tx} settings={settings} />
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const [q, setQ] = useState("");
  const [invoiceQ, setInvoiceQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [type, setType] = useState<"ALL" | "BUY" | "SELL">("ALL");
  const debouncedQ = useDebounce(q, 300);
  const debouncedInvoiceQ = useDebounce(invoiceQ, 300);

  const [rows, setRows] = useState<TxRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  const [selectedTx, setSelectedTx] = useState<TxDetail | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const canQuery = useMemo(() => {
    try { getSupabaseClient(); return true; } catch { return false; }
  }, []);

  // Load company settings once.
  useEffect(() => {
    if (!canQuery) return;
    const run = async () => {
      try {
        const supabase = getSupabaseClient() as any;
        const { data } = await supabase
          .from("settings")
          .select("company_name_en,company_name_th,address_en,address_th,phone,email,tax_id,invoice_footer_note,logo_data_url")
          .limit(1)
          .maybeSingle();
        if (data) setSettings(data as Settings);
      } catch { /* ignore */ }
    };
    void run();
  }, [canQuery]);

  const buildQuery = useCallback(() => {
    const supabase = getSupabaseClient() as any;
    let q2 = supabase
      .from("transactions")
      .select(
        "id,date,type,invoice_number,weight_grams,rate_per_gram,amount_thb,vat_percent,notes,client:clients(name)",
        { count: "exact" }
      )
      .not("invoice_number", "is", null);

    if (from) q2 = q2.gte("date", from);
    if (to) q2 = q2.lte("date", to);
    if (type !== "ALL") q2 = q2.eq("type", type);
    if (debouncedQ.trim()) q2 = q2.ilike("clients.name", `%${debouncedQ.trim()}%`);
    if (debouncedInvoiceQ.trim()) q2 = q2.ilike("invoice_number", `%${debouncedInvoiceQ.trim()}%`);

    return q2.order("date", { ascending: false }).order("id", { ascending: false });
  }, [from, to, type, debouncedQ, debouncedInvoiceQ]);

  const load = useCallback(async () => {
    if (!canQuery) return;
    setLoading(true);
    try {
      const start = page * PAGE_SIZE;
      const { data, count, error } = await buildQuery().range(start, start + PAGE_SIZE - 1);
      if (error) throw error;
      setRows((data ?? []) as TxRow[]);
      setTotal(count ?? 0);
    } finally {
      setLoading(false);
    }
  }, [canQuery, buildQuery, page]);

  useEffect(() => { setPage(0); }, [from, to, type, debouncedQ, debouncedInvoiceQ]);
  useEffect(() => { void load(); }, [load]);

  // When a row is clicked, fetch full detail and open preview.
  const openInvoice = useCallback(async (row: TxRow) => {
    const clientName = embeddedClientName(row.client) ?? "-";
    setSelectedTx({
      id: row.id,
      date: row.date,
      type: row.type,
      invoice_number: row.invoice_number,
      weight_grams: row.weight_grams,
      rate_per_gram: row.rate_per_gram,
      amount_thb: row.amount_thb,
      vat_percent: row.vat_percent,
      notes: row.notes,
      clientName,
    });
  }, []);

  return (
    <PageWrapper
      title="Invoices"
      description="Preview and track issued documents linked to sales."
    >
      {/* Filters row */}
      <div className="mb-4 grid gap-2 sm:grid-cols-2 md:grid-cols-5">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Client name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="relative">
          <FileText className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 font-mono"
            placeholder="Invoice #…"
            value={invoiceQ}
            onChange={(e) => setInvoiceQ(e.target.value)}
          />
        </div>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} placeholder="To" />
        <Select value={type} onValueChange={(v) => setType(v as any)}>
          <SelectTrigger><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All</SelectItem>
            <SelectItem value="BUY">BUY</SelectItem>
            <SelectItem value="SELL">SELL</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Split layout: list + preview */}
      <div className={cn(
        "flex gap-4 transition-all",
        selectedTx ? "flex-col lg:flex-row" : ""
      )}>
        {/* Invoice list */}
        <div className={cn("min-w-0", selectedTx ? "lg:w-[420px] lg:shrink-0" : "w-full")}>
          <Card>
            <CardContent className="p-0">
              <div className="rounded-lg overflow-hidden border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[130px]">Invoice #</TableHead>
                      <TableHead className="w-[105px]">Date</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead className="w-[70px]">Type</TableHead>
                      <TableHead className="text-right">Amount (THB)</TableHead>
                      <TableHead className="w-[90px] text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const isActive = selectedTx?.id === r.id;
                      return (
                        <TableRow
                          key={r.id}
                          className={cn(
                            "cursor-pointer transition-colors",
                            isActive && "bg-primary/5 border-l-2 border-l-primary"
                          )}
                          onClick={() => openInvoice(r)}
                        >
                          <TableCell className="font-mono text-xs font-semibold">
                            {r.invoice_number ?? "-"}
                          </TableCell>
                          <TableCell className="text-sm">{r.date}</TableCell>
                          <TableCell className="text-sm truncate max-w-[140px]">
                            {embeddedClientName(r.client) ?? "-"}
                          </TableCell>
                          <TableCell>
                            <Badge className={cn(
                              "text-xs",
                              r.type === "BUY"
                                ? "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                : "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100"
                            )}>
                              {r.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {r.amount_thb != null ? formatCurrency(r.amount_thb, "THB", "th-TH") : "-"}
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              variant={isActive ? "default" : "outline"}
                              className="h-7 text-xs px-2"
                              onClick={() => openInvoice(r)}
                            >
                              <Printer className="h-3 w-3 mr-1" />
                              Open
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                          {loading ? "Loading…" : "No invoices found."}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground" style={{ borderColor: "var(--border)" }}>
                <span>{total.toLocaleString()} invoice{total !== 1 ? "s" : ""}</span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={page === 0 || loading}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    ← Prev
                  </Button>
                  <span className="px-2 text-xs">{page + 1} / {totalPages}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={page >= totalPages - 1 || loading}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next →
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Invoice preview panel */}
        {selectedTx && (
          <div className="flex-1 min-w-0 rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", minHeight: "600px" }}>
            <InvoicePreviewPanel
              tx={selectedTx}
              settings={settings}
              onClose={() => setSelectedTx(null)}
            />
          </div>
        )}

        {/* Empty state hint when nothing selected */}
        {!selectedTx && rows.length > 0 && (
          <div className="hidden lg:flex flex-col items-center justify-center flex-1 rounded-xl border border-dashed text-center p-12" style={{ borderColor: "var(--border)" }}>
            <FileText className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Select an invoice to preview</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Click any row on the left to open the invoice document</p>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
