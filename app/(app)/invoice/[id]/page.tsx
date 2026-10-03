"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useReactToPrint } from "react-to-print";
import { Download, Printer } from "lucide-react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "@/lib/supabase";
import { embedFkOne } from "@/lib/utils";
import {
  InvoiceDocument,
  InvoicePrintSet,
  type Settings,
  type TxDetail,
} from "@/components/PrintInvoice";

type ClientRel = { name: string; address: string | null; tax_id: string | null };

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
  client: ClientRel | ClientRel[] | null;
};

const DEFAULT_SETTINGS: Settings = {
  company_name_en: "GLS PLUS CO., LTD.",
  company_name_th: "บริษัท จีแอลเอส พลัส จำกัด",
  address_en: "66/22 GEMOPOLIS INDUSTRIAL ESTATE SOI 31 KWAENG DOKMAI, KHET PRAWET BANGKOK 10250",
  address_th: "66/22 ซ. 31 เจมโมโปลิส เขตประเวศ กรุงเทพฯ 10250",
  phone: "087-039-8795",
  email: "glsplusdb@gmail.com",
  tax_id: "0105563120430",
  invoice_footer_note: null,
  logo_data_url: null,
};

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const printRef = useRef<HTMLDivElement>(null);

  const [tx, setTx] = useState<TxDetail | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      setError(null);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabase = getSupabaseClient() as any;

        const { data, error: txErr } = await supabase
          .from("transactions")
          .select(
            "id,date,type,invoice_number,weight_grams,rate_per_gram,amount_thb,vat_percent,notes,client:clients(name,address,tax_id)"
          )
          .eq("id", id)
          .single();
        if (txErr) throw txErr;

        const row = data as TxRow;
        const client = embedFkOne(row.client);
        setTx({
          id: row.id,
          date: row.date,
          type: row.type,
          invoice_number: row.invoice_number,
          weight_grams: row.weight_grams,
          rate_per_gram: row.rate_per_gram,
          amount_thb: row.amount_thb,
          vat_percent: row.vat_percent,
          notes: row.notes,
          clientName: client?.name ?? "-",
          clientAddress: client?.address ?? null,
          clientTaxId: client?.tax_id ?? null,
        });

        // Company settings (real column names → invoice Settings shape).
        const { data: s } = await supabase
          .from("settings")
          .select("company_name,company_name_th,address_1,address_2,phone,email,tax_id,invoice_footer,logo_url")
          .limit(1)
          .maybeSingle();
        if (s) {
          const addressEn = [s.address_1, s.address_2].filter(Boolean).join(", ");
          setSettings((prev) => ({
            company_name_en: s.company_name || prev.company_name_en,
            company_name_th: s.company_name_th || prev.company_name_th,
            address_en: addressEn || prev.address_en,
            address_th: prev.address_th,
            phone: s.phone || prev.phone,
            email: s.email || prev.email,
            tax_id: s.tax_id || prev.tax_id,
            invoice_footer_note: s.invoice_footer || prev.invoice_footer_note,
            logo_data_url: s.logo_url || prev.logo_data_url,
          }));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load invoice");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [canQuery, id]);

  const onPrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: tx?.invoice_number ?? `invoice-${id}`,
  });

  return (
    <PageWrapper title={tx?.invoice_number ? `Invoice ${tx.invoice_number}` : "Invoice"}>
      <div className="no-print mb-4 flex items-center justify-end gap-2">
        <Button variant="outline" onClick={() => onPrint()} disabled={!tx}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Save PDF
        </Button>
        <Button onClick={() => onPrint()} disabled={!tx}>
          <Printer className="mr-1.5 h-3.5 w-3.5" />
          Print
        </Button>
      </div>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
      {loading && !tx ? (
        <p className="text-sm text-muted-foreground">Loading invoice…</p>
      ) : null}

      {tx ? (
        <>
          {/* On-screen preview (single document). */}
          <div className="mx-auto overflow-hidden rounded-lg border bg-white shadow-sm" style={{ maxWidth: "800px" }}>
            <InvoiceDocument tx={tx} settings={settings} copyLabel="ORIGINAL" />
          </div>

          {/* Hidden node used for printing: ORIGINAL + COPY. */}
          <div style={{ position: "absolute", left: "-9999px", top: 0 }}>
            <div ref={printRef}>
              <InvoicePrintSet tx={tx} settings={settings} />
            </div>
          </div>
        </>
      ) : null}
    </PageWrapper>
  );
}
