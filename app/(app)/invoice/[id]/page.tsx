"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "@/lib/supabase";
import { cn, embedFkOne, formatCurrency, thaiBahtText } from "@/lib/utils";

type Tx = {
  id: string;
  date: string;
  type: "BUY" | "SELL";
  invoice_number: string | null;
  weight_grams: number | null;
  rate_per_gram: number | null;
  amount_thb: number | null;
  vat_percent: number | null;
  notes: string | null;
  client: {
    name: string;
    address?: string | null;
    tax_id?: string | null;
  } | {
    name: string;
    address?: string | null;
    tax_id?: string | null;
  }[] | null;
};

export default function InvoicePage({ params }: { params: { id: string } }) {
  const printRef = useRef<HTMLDivElement>(null);

  const [tx, setTx] = useState<Tx | null>(null);
  const [loading, setLoading] = useState(true);

  const canQuery = useMemo(() => {
    try {
      getSupabaseClient();
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!canQuery) {
      setLoading(false);
      return;
    }
    const run = async () => {
      setLoading(true);
      try {
        const supabase = getSupabaseClient() as any;
        const { data, error } = await supabase
          .from("transactions")
          .select(
            "id,date,type,invoice_number,weight_grams,rate_per_gram,amount_thb,vat_percent,notes,client:clients(name,address,tax_id)"
          )
          .eq("id", params.id)
          .single();
        if (error) throw error;
        setTx(data as unknown as Tx);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [canQuery, params.id]);

  const onPrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: tx?.invoice_number ?? `invoice-${params.id}`,
  });

  const onDownloadPdf = () => {
    // Uses browser's “Save as PDF” in the print dialog.
    onPrint();
  };

  const customer = embedFkOne(tx?.client);
  const invoiceNo = tx?.invoice_number ?? "-";
  const invoiceDate = tx?.date ?? "-";
  const weight = tx?.weight_grams ?? 0;
  const rate = tx?.rate_per_gram ?? 0;
  const subTotal = tx?.amount_thb ?? weight * rate;
  const vatPercent = tx?.vat_percent ?? 0;
  const vatAmount = subTotal * (vatPercent / 100);
  const total = subTotal + vatAmount;

  return (
    <PageWrapper title={`Invoice ${params.id}`}>
      <div className="no-print mb-4 flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onDownloadPdf} disabled={!tx}>
          Download PDF
        </Button>
        <Button onClick={onPrint} disabled={!tx}>
          Print Invoice
        </Button>
      </div>

      <div
        ref={printRef}
        className="print-page mx-auto w-full max-w-[210mm] rounded-lg border bg-white p-6 text-black"
      >
        {/* Header (match scanned layout) */}
        <div className="relative">
          <div className="absolute right-0 top-0 border-2 border-black px-3 py-1 text-xs font-bold">
            ORIGINAL
          </div>

          <div className="flex items-start gap-3">
            <div className="h-14 w-14 border-2 border-black grid place-items-center font-black text-base leading-none">
              GLS
              <div className="text-[9px] font-semibold -mt-1">PLUS</div>
            </div>
            <div className="flex-1">
              <div className="text-[13px] font-bold leading-tight">
                GLS PLUS CO., LTD.
              </div>
              <div className="text-[10px] leading-snug">
                66/22 GEMOPOLIS INDUSTRIAL ESTATE SOI 31 KWAENG DOKMAI, KHET
                PRAWET BANGKOK 10250.
              </div>
              <div className="text-[10px] leading-snug">
                EMAIL: glsplusdb@gmail.com &nbsp;&nbsp; phone no 0870398795
              </div>
              <div className="text-[10px] leading-snug">
                Tax ID: 0105563120430 &nbsp;&nbsp; Head office
              </div>
            </div>
          </div>

          <div className="mt-2 text-center text-[12px] font-bold">
            ใบเสร็จรับเงิน / RECEIPT / TAX INVOICE
          </div>
        </div>

        {/* Customer + invoice meta */}
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <div className="text-[11px] leading-snug">
            <div className="font-semibold">Customer:</div>
            <div className="font-medium">
              {customer?.name ?? (loading ? "Loading..." : "-")}
            </div>
            <div className="text-[10px]">{customer?.address ?? ""}</div>
            <div className="text-[10px]">
              Tax ID: <span className="font-mono">{customer?.tax_id ?? "-"}</span>
            </div>
          </div>
          <div className="text-[11px] leading-snug md:text-right">
            <div>
              <span className="font-semibold">Invoice Number</span>{" "}
              <span className="font-mono font-semibold">{invoiceNo}</span>
            </div>
            <div>
              <span className="font-semibold">Date</span>{" "}
              <span className="font-medium">{invoiceDate}</span>
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="pt-3">
          <div className="text-[11px] font-semibold mb-1">Items</div>
          <div className="text-[10px] mb-1">in / Baht:</div>
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="border border-black">
                <th className="border border-black p-2 text-center w-[28px]">
                  #
                </th>
                <th className="border border-black p-2 text-center w-[80px]">
                  Code
                </th>
                <th className="border border-black p-2 text-left">
                  Perticulars
                </th>
                <th className="border border-black p-2 text-right w-[110px]">
                  Unit/Price
                </th>
                <th className="border border-black p-2 text-right w-[95px]">
                  Weight(g)
                </th>
                <th className="border border-black p-2 text-right w-[120px]">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border border-black">
                <td className="border border-black p-2 text-center">1</td>
                <td className="border border-black p-2 text-center">G9999</td>
                <td className="border border-black p-2">
                  Pure gold (99.99%)
                  {tx?.notes ? (
                    <div className="mt-1 text-[10px] text-black/70">
                      {tx.notes}
                    </div>
                  ) : null}
                </td>
                <td className="border border-black p-2 text-right">
                  {rate ? rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-"}
                </td>
                <td className="border border-black p-2 text-right">
                  {weight
                    ? weight.toLocaleString(undefined, {
                        minimumFractionDigits: 4,
                        maximumFractionDigits: 4,
                      })
                    : "-"}
                </td>
                <td className="border border-black p-2 text-right">
                  {subTotal.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
              </tr>
              {/* filler row for visual spacing */}
              <tr className="border border-black">
                <td className="border border-black p-6" colSpan={6} />
              </tr>
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="text-[10px] leading-snug">
            <div className="font-semibold">Amount in words</div>
            <div className="mt-1 border border-black p-2">
              {thaiBahtText(total)}
            </div>

            <div className="mt-2 grid grid-cols-2 gap-x-2 text-[10px]">
              <div className="font-semibold">Amount =</div>
              <div className="text-right">
                {Math.round(total).toLocaleString()} Baht
              </div>
            </div>
          </div>

          <div className="ml-auto w-full max-w-sm text-[10px]">
            <div className="grid grid-cols-2 border border-black">
              <div className="border-r border-black p-2 font-semibold">
                Sub Total
              </div>
              <div className="p-2 text-right">
                {subTotal.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>

              <div className="border-t border-r border-black p-2 font-semibold">
                Vat {vatPercent}%
              </div>
              <div className="border-t border-black p-2 text-right">
                {vatAmount.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>

              <div className="border-t border-r border-black p-2 font-semibold">
                Total
              </div>
              <div className="border-t border-black p-2 text-right font-semibold">
                {total.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 text-[10px]">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="font-semibold">Paid by</div>
              <div className="flex items-center gap-6">
                {["Cash", "Cheque", "Transfer"].map((m) => (
                  <div key={m} className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 border border-black" />
                    <span>{m}</span>
                  </div>
                ))}
              </div>

              <div className="pt-2">
                Received goods in good order and condition
              </div>

              <div className="mt-2 space-y-1">
                <div>Bank ................... Branch ...................</div>
                <div>
                  No ............................. Date ........../........../........
                </div>
                <div>Goods received by .............................................</div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3 text-center">
              {["Authorised signature", "Collector", "Date", "Delivery by"].map(
                (label) => (
                  <div key={label}>
                    <div className="h-10 border-b border-black" />
                    <div className="mt-1">{label}</div>
                  </div>
                )
              )}
            </div>
          </div>

          <div className="mt-2 text-[9px] leading-snug text-black/70">
            Note: This receipt will be valid only with authorised signature and
            bill collector&apos;s signature. If payment is made by cheque, this
            receipt is invalid until cheque is cleared.
          </div>

          <div className={cn("mt-2 text-[10px] text-black/60", loading && "italic")}>
            {loading ? "Loading invoice data..." : ""}
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}

