"use client";

import { useRef, useEffect, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { Printer, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Settings = {
  company_name_en: string | null;
  company_name_th: string | null;
  address_en: string | null;
  address_th: string | null;
  phone: string | null;
  email: string | null;
  tax_id: string | null;
  invoice_footer_note: string | null;
  logo_data_url: string | null;
};

export type TxDetail = {
  id: string;
  date: string;
  type: "BUY" | "SELL";
  invoice_number: string | null;
  weight_grams: number | null;
  rate_per_gram: number | null;
  amount_thb: number | null;
  vat_percent: number | null;
  notes: string | null;
  clientName: string;
  clientAddress?: string | null;
  clientTaxId?: string | null;
};

// ─── Amount in words ──────────────────────────────────────────────────────────

const ones = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function wordsUnder1000(n: number): string {
  if (n === 0) return "";
  if (n < 20) return ones[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
  return ones[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + wordsUnder1000(n % 100) : "");
}

function amountInWords(amount: number): string {
  const n = Math.round(amount);
  if (n === 0) return "zero baht";
  const parts: string[] = [];
  if (n >= 1_000_000) { parts.push(wordsUnder1000(Math.floor(n / 1_000_000)) + " million"); }
  const rem1 = n % 1_000_000;
  if (rem1 >= 1000) { parts.push(wordsUnder1000(Math.floor(rem1 / 1000)) + " thousand"); }
  const rem2 = rem1 % 1000;
  if (rem2 > 0) { parts.push(wordsUnder1000(rem2)); }
  const words = parts.join(" and ");
  // Capitalise first letter
  return words.charAt(0).toUpperCase() + words.slice(1) + " baht only";
}

function fmtNum(n: number | null | undefined, decimals = 2): string {
  if (n == null) return "-";
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch { return iso; }
}

// ─── Invoice document ─────────────────────────────────────────────────────────

export function InvoiceDocument({ tx, settings }: { tx: TxDetail; settings: Settings }) {
  const subtotal = tx.amount_thb ?? 0;
  const vatRate = tx.vat_percent ?? 0;
  const vatAmt = subtotal * (vatRate / 100);
  const total = subtotal + vatAmt;
  const words = amountInWords(total);

  const companyEn = settings.company_name_en ?? "GLS PLUS CO., LTD.";
  const companyTh = settings.company_name_th ?? "บริษัท จีแอลเอส พลัส จำกัด";
  const addressEn = settings.address_en ?? "66/22 GEMOPOLIS INDUSTRIAL ESTATE SOI 31, KWAENG OOKMAI, KHET PRAWET, BANGKOK 10250";
  const addressTh = settings.address_th ?? "66/22 ซ. 31 เจมโมโปลิส เขตประเวศ กรุงเทพฯ 10250";
  const phone = settings.phone ?? "087-039-8795";
  const email = settings.email ?? "glsplusdb@gmail.com";
  const taxId = settings.tax_id ?? "0105563120430";

  const particulars = tx.type === "BUY"
    ? "Pure gold (99.99%) Purchase"
    : "Pure gold (99.99%) Sale";

  const s: Record<string, React.CSSProperties> = {
    page: {
      fontFamily: "'Arial', 'Helvetica', sans-serif",
      fontSize: "11px",
      color: "#111",
      background: "#fff",
      padding: "28px 32px",
      maxWidth: "780px",
      margin: "0 auto",
      lineHeight: 1.4,
    },
    headerRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: "12px",
    },
    companyBlock: { flex: 1, paddingRight: "20px" },
    companyNameTh: { fontSize: "14px", fontWeight: 700, color: "#111", marginBottom: "1px" },
    companyNameEn: { fontSize: "13px", fontWeight: 700, color: "#111" },
    addressText: { fontSize: "10px", color: "#333", marginTop: "3px", lineHeight: 1.5 },
    docTypeBlock: { textAlign: "right", minWidth: "200px" },
    docTypeLabel: {
      fontSize: "16px", fontWeight: 800, color: "#111", letterSpacing: "0.04em",
      textTransform: "uppercase" as const, lineHeight: 1.2,
    },
    docTypeSub: { fontSize: "11px", fontWeight: 600, color: "#555", marginTop: "1px" },
    originalBadge: {
      display: "inline-block",
      border: "2px solid #b8860b",
      color: "#b8860b",
      fontWeight: 700,
      fontSize: "10px",
      padding: "1px 8px",
      letterSpacing: "0.1em",
      marginTop: "6px",
    },
    dividerGold: { borderTop: "2px solid #c9a227", margin: "10px 0" },
    dividerThin: { borderTop: "1px solid #ccc", margin: "8px 0" },
    customerRow: {
      display: "grid",
      gridTemplateColumns: "1fr auto",
      gap: "16px",
      marginBottom: "10px",
    },
    labelSmall: { fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em", color: "#666", textTransform: "uppercase" as const },
    fieldValue: { fontSize: "11px", fontWeight: 600, color: "#111" },
    fieldValueMono: { fontSize: "11px", fontWeight: 600, color: "#111", fontFamily: "monospace" },
    infoGrid: { display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 8px", fontSize: "11px" },
    table: { width: "100%", borderCollapse: "collapse" as const, marginTop: "8px" },
    th: {
      background: "#1c1917", color: "#f5f0e8",
      padding: "6px 8px", textAlign: "left" as const,
      fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em",
      textTransform: "uppercase" as const,
    },
    thRight: {
      background: "#1c1917", color: "#f5f0e8",
      padding: "6px 8px", textAlign: "right" as const,
      fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em",
      textTransform: "uppercase" as const,
    },
    td: { padding: "8px", borderBottom: "1px solid #e8dfc8", verticalAlign: "top" as const },
    tdRight: { padding: "8px", borderBottom: "1px solid #e8dfc8", textAlign: "right" as const, fontFamily: "monospace" },
    totalsRow: { display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "11px" },
    totalsLabel: { color: "#555" },
    totalsValue: { fontFamily: "monospace", fontWeight: 600 },
    totalFinalRow: {
      display: "flex", justifyContent: "space-between",
      padding: "6px 0", borderTop: "2px solid #c9a227", marginTop: "4px",
      fontSize: "13px", fontWeight: 800,
    },
    wordsBox: {
      border: "1px solid #e8dfc8",
      borderRadius: "4px",
      padding: "6px 10px",
      fontSize: "10px",
      color: "#333",
      marginTop: "8px",
      background: "#faf8f5",
    },
    paymentRow: {
      display: "flex", alignItems: "center", gap: "20px",
      fontSize: "11px", marginTop: "8px", flexWrap: "wrap" as const,
    },
    checkbox: {
      display: "inline-block", width: "10px", height: "10px",
      border: "1px solid #333", marginRight: "4px", verticalAlign: "middle",
    },
    bankRow: {
      display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "8px",
      marginTop: "6px", fontSize: "10px",
    },
    bankField: { borderBottom: "1px solid #999", paddingBottom: "2px", color: "#555" },
    sigRow: {
      display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px",
      marginTop: "16px", textAlign: "center" as const, fontSize: "10px",
    },
    sigBox: { borderTop: "1px solid #333", paddingTop: "4px", color: "#555" },
    noteText: { fontSize: "9px", color: "#666", lineHeight: 1.5 },
    receivedBox: {
      border: "1px solid #ccc", borderRadius: "4px",
      padding: "6px 10px", fontSize: "10px", color: "#333",
      marginTop: "6px",
    },
  };

  return (
    <div style={s.page}>
      {/* ── Header ── */}
      <div style={s.headerRow}>
        {/* Left: Company info */}
        <div style={s.companyBlock}>
          {settings.logo_data_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.logo_data_url} alt="logo" style={{ height: "44px", marginBottom: "6px" }} />
          )}
          <div style={s.companyNameTh}>{companyTh}</div>
          <div style={s.companyNameEn}>{companyEn}</div>
          <div style={s.addressText}>{addressTh}</div>
          <div style={s.addressText}>{addressEn}</div>
          <div style={s.addressText}>Email: {email} &nbsp; Tel: {phone}</div>
          <div style={s.addressText}>เลขประจำตัวผู้เสียภาษี / Tax ID: <strong>{taxId}</strong> (สำนักงานใหญ่ / Head Office)</div>
        </div>

        {/* Right: Document type */}
        <div style={s.docTypeBlock}>
          <div style={s.docTypeLabel}>Receipt /</div>
          <div style={s.docTypeLabel}>Tax Invoice</div>
          <div style={s.docTypeSub}>ใบเสร็จรับเงิน / ใบกำกับภาษี</div>
          <div style={s.originalBadge}>ORIGINAL</div>
        </div>
      </div>

      <div style={s.dividerGold} />

      {/* ── Customer block ── */}
      <div style={s.customerRow}>
        {/* Left: Customer details */}
        <div>
          <div style={s.infoGrid}>
            <span style={{ ...s.labelSmall, marginTop: "2px" }}>ลูกค้า / Customer:</span>
            <span style={s.fieldValue}>{tx.clientName}</span>
            {tx.clientAddress && (
              <>
                <span style={{ ...s.labelSmall, marginTop: "2px" }}>ที่อยู่ / Address:</span>
                <span style={{ fontSize: "10px", color: "#333" }}>{tx.clientAddress}</span>
              </>
            )}
            {tx.clientTaxId && (
              <>
                <span style={{ ...s.labelSmall, marginTop: "2px" }}>เลขภาษี / Tax ID:</span>
                <span style={s.fieldValueMono}>{tx.clientTaxId}</span>
              </>
            )}
          </div>
        </div>

        {/* Right: Invoice # and date */}
        <div style={{ minWidth: "180px" }}>
          <div style={s.infoGrid}>
            <span style={s.labelSmall}>เลขที่ / Invoice No:</span>
            <span style={{ ...s.fieldValueMono, color: "#b8860b" }}>{tx.invoice_number ?? "-"}</span>
            <span style={s.labelSmall}>วันที่ / Date:</span>
            <span style={s.fieldValue}>{formatDate(tx.date)}</span>
          </div>
        </div>
      </div>

      <div style={s.dividerThin} />

      {/* ── Line items table ── */}
      <table style={s.table}>
        <thead>
          <tr>
            <th style={{ ...s.th, width: "70px" }}>รหัส<br />Code</th>
            <th style={s.th}>รายการ / Particulars</th>
            <th style={{ ...s.thRight, width: "120px" }}>น้ำหนัก (กรัม)<br />Weight (gram)</th>
            <th style={{ ...s.thRight, width: "110px" }}>ราคา/หน่วย<br />Unit/Price</th>
            <th style={{ ...s.thRight, width: "110px" }}>จำนวนเงิน<br />Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={s.td}>G9999</td>
            <td style={s.td}>
              <div style={{ fontWeight: 600 }}>{particulars}</div>
              {tx.notes && <div style={{ fontSize: "10px", color: "#666", marginTop: "2px" }}>{tx.notes}</div>}
            </td>
            <td style={s.tdRight}>{fmtNum(tx.weight_grams, 4)}</td>
            <td style={s.tdRight}>{fmtNum(tx.rate_per_gram, 2)}</td>
            <td style={s.tdRight}>{fmtNum(subtotal, 2)}</td>
          </tr>
          {/* Blank filler rows for visual space */}
          {[1, 2].map((i) => (
            <tr key={i}>
              <td style={{ ...s.td, height: "24px" }}></td>
              <td style={s.td}></td>
              <td style={s.tdRight}></td>
              <td style={s.tdRight}></td>
              <td style={s.tdRight}></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Totals + Amount in words ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: "6px", gap: "16px" }}>
        {/* Amount in words */}
        <div style={{ flex: 1 }}>
          <div style={s.wordsBox}>
            <span style={{ color: "#666", fontSize: "9px", letterSpacing: "0.06em" }}>จำนวนเงิน (ตัวอักษร) / Amount in words: </span>
            <span style={{ fontWeight: 600 }}>{words}</span>
          </div>
        </div>

        {/* Totals block */}
        <div style={{ minWidth: "220px" }}>
          <div style={s.totalsRow}>
            <span style={s.totalsLabel}>ยอดรวม / Sub Total</span>
            <span style={s.totalsValue}>{fmtNum(subtotal)}</span>
          </div>
          <div style={s.totalsRow}>
            <span style={s.totalsLabel}>ภาษีมูลค่าเพิ่ม / Vat ({vatRate}%)</span>
            <span style={s.totalsValue}>{fmtNum(vatAmt)}</span>
          </div>
          <div style={s.totalFinalRow}>
            <span>ยอดรวมสุทธิ / Total</span>
            <span style={{ color: "#b8860b" }}>{fmtNum(total)}</span>
          </div>
        </div>
      </div>

      <div style={{ ...s.dividerThin, marginTop: "10px" }} />

      {/* ── Payment method ── */}
      <div>
        <span style={{ ...s.labelSmall, marginRight: "8px" }}>ชำระโดย / Paid by:</span>
        <div style={s.paymentRow}>
          <label><span style={s.checkbox} />เงินสด / Cash</label>
          <label><span style={s.checkbox} />เช็ค / Cheque</label>
          <label><span style={s.checkbox} />โอนเงิน / Transfer</label>
        </div>
        <div style={s.bankRow}>
          <div><div style={s.labelSmall}>ธนาคาร / Bank</div><div style={s.bankField}>&nbsp;</div></div>
          <div><div style={s.labelSmall}>สาขา / Branch</div><div style={s.bankField}>&nbsp;</div></div>
          <div><div style={s.labelSmall}>เลขที่ / No.</div><div style={s.bankField}>&nbsp;</div></div>
          <div><div style={s.labelSmall}>วันที่ / Date</div><div style={s.bankField}>&nbsp;</div></div>
        </div>
      </div>

      <div style={{ ...s.dividerThin, marginTop: "10px" }} />

      {/* ── Received goods + Signatures ── */}
      <div style={s.receivedBox}>
        ได้รับสินค้าถูกต้องครบถ้วน / Received goods in good order and condition
      </div>

      <div style={s.sigRow}>
        <div>
          <div style={{ height: "32px" }} />
          <div style={s.sigBox}>ผู้มีอำนาจลงนาม<br />Authorised Signature</div>
        </div>
        <div>
          <div style={{ height: "32px" }} />
          <div style={s.sigBox}>ผู้รับเงิน / Collector</div>
        </div>
        <div>
          <div style={{ height: "32px" }} />
          <div style={s.sigBox}>วันที่ / Date</div>
        </div>
        <div>
          <div style={{ height: "32px" }} />
          <div style={s.sigBox}>ผู้ส่งสินค้า / Delivery by</div>
        </div>
      </div>

      {/* ── Footer note ── */}
      <div style={{ ...s.dividerThin, marginTop: "10px" }} />
      <div style={s.noteText}>
        หมายเหตุ: ใบเสร็จรับเงินฉบับนี้จะสมบูรณ์เมื่อมีลายมือชื่อผู้มีอำนาจและผู้รับเงินเท่านั้น<br />
        Note: This receipt will be valid only with authorised signature and bill collector's signature.<br />
        หากชำระด้วยเช็ค ใบเสร็จนี้จะสมบูรณ์เมื่อเช็คผ่านการเรียกเก็บเงินแล้ว<br />
        If payment is made by cheque, this receipt is invalid until cheque is cleared.
        {settings.invoice_footer_note && (
          <><br />{settings.invoice_footer_note}</>
        )}
      </div>
    </div>
  );
}

// ─── Print button ─────────────────────────────────────────────────────────────

export function PrintInvoiceButton({ tx }: { tx: TxDetail }) {
  const printRef = useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState<Settings>({
    company_name_en: "GLS PLUS CO., LTD.",
    company_name_th: "บริษัท จีแอลเอส พลัส จำกัด",
    address_en: null,
    address_th: null,
    phone: null,
    email: null,
    tax_id: null,
    invoice_footer_note: null,
    logo_data_url: null,
  });

  useEffect(() => {
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
  }, []);

  const handlePrint = useReactToPrint({ contentRef: printRef });

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => handlePrint()}>
        <Printer className="mr-2 h-3.5 w-3.5" />
        Print Invoice
      </Button>

      <div style={{ position: "absolute", left: "-9999px", top: 0 }}>
        <div ref={printRef}>
          <InvoiceDocument tx={tx} settings={settings} />
        </div>
      </div>
    </>
  );
}

