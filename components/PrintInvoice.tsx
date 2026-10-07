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
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
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

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function wordsUnder100(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return TENS[t] + (o ? "-" + ONES[o] : "");
}

function wordsUnder1000(n: number): string {
  if (n < 100) return wordsUnder100(n);
  return ONES[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + wordsUnder100(n % 100) : "");
}

function intToWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  if (n >= 1_000_000) {
    parts.push(wordsUnder1000(Math.floor(n / 1_000_000)) + " Million");
    n %= 1_000_000;
  }
  if (n >= 1000) {
    parts.push(wordsUnder1000(Math.floor(n / 1000)) + " Thousand");
    n %= 1000;
  }
  if (n > 0) parts.push(wordsUnder1000(n));
  return parts.join(" ");
}

/**
 * Thai currency words: Baht for the whole part, Satang for the 2-decimal part.
 * e.g. 1,234.56 -> "One Thousand Two Hundred Thirty-Four Baht and Fifty-Six Satang"
 *      125,050  -> "One Hundred Twenty-Five Thousand Fifty Baht"
 */
function amountInWords(amount: number): string {
  const cents = Math.round((amount || 0) * 100);
  const baht = Math.floor(cents / 100);
  const satang = cents % 100;
  const bahtWords = `${intToWords(baht)} Baht`;
  if (satang > 0) {
    return `${bahtWords} and ${intToWords(satang)} Satang`;
  }
  return bahtWords;
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

export type CopyLabel = "ORIGINAL" | "COPY";

export function InvoiceDocument({
  tx,
  settings,
  copyLabel = "ORIGINAL",
}: {
  tx: TxDetail;
  settings: Settings;
  copyLabel?: CopyLabel;
}) {
  const subtotal = tx.amount_thb ?? 0;
  const vatRate = tx.vat_percent ?? 0;
  const vatAmt = subtotal * (vatRate / 100);
  const total = subtotal + vatAmt;
  const words = amountInWords(total);

  const companyEn = settings.company_name_en ?? "GLS PLUS CO., LTD.";
  const companyTh = settings.company_name_th ?? "บริษัท จีแอลเอส พลัส จำกัด";
  const addressEn = settings.address_en ?? "66/22 GEMOPOLIS INDUSTRIAL ESTATE SOI 31 KWAENG DOKMAI, KHET PRAWET BANGKOK 10250";
  const addressTh = settings.address_th ?? "66/22 ซ. 31 เจมโมโปลิส เขตประเวศ กรุงเทพฯ 10250";
  const phone = settings.phone ?? "087-039-8795";
  const email = settings.email ?? "glsplusdb@gmail.com";
  const taxId = settings.tax_id ?? "0105563120430";
  // Company bank details for incoming payments (shown on SELL invoices).
  // Fall back to the known account so the invoice is correct even before Settings is filled.
  const bankName = settings.bank_name?.trim() ? settings.bank_name : "Kasikorn Bank";
  const bankAccName = settings.bank_account_name?.trim() ? settings.bank_account_name : "GLS PLUS CO. LTD";
  const bankAccNo = settings.bank_account_number?.trim() ? settings.bank_account_number : "1663787469";
  const hasBankDetails = Boolean(bankName || bankAccName || bankAccNo);
  // Fall back to the bundled company logo when no custom logo is stored in settings.
  const logoSrc = settings.logo_data_url?.trim() ? settings.logo_data_url : "/logo.png";

  const particulars = tx.type === "BUY"
    ? "Pure gold (99.99%) Purchase"
    : "Pure gold (99.99%) Sale";

  const s: Record<string, React.CSSProperties> = {
    page: {
      fontFamily: "'Arial', 'Helvetica', sans-serif",
      fontSize: "11px",
      color: "#111",
      background: "#fff",
      maxWidth: "800px",
      margin: "0 auto",
      lineHeight: 1.4,
    },
    // Formal double frame around the document. On print it fills the printable
    // area (see globals.css) so the margins are even on all four sides.
    frame: {
      border: "3px double #1c1917",
      padding: "22px 26px",
      boxSizing: "border-box" as const,
    },
    headerRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: "16px",
      marginBottom: "10px",
    },
    // Left: logo with the "GLS PLUS" wordmark beneath it.
    brandBlock: {
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "center",
      width: "76px",
      flexShrink: 0,
    },
    brandName: {
      fontSize: "11px",
      fontWeight: 800,
      letterSpacing: "0.16em",
      color: "#1c1917",
      marginTop: "4px",
      whiteSpace: "nowrap" as const,
    },
    // Middle: company name + addresses, kept compact.
    companyBlock: { flex: 1 },
    companyNameTh: { fontSize: "13px", fontWeight: 700, color: "#111" },
    companyNameEn: { fontSize: "13px", fontWeight: 700, color: "#111" },
    addressText: { fontSize: "10px", color: "#333", marginTop: "2px", lineHeight: 1.45 },
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
    payToBox: {
      border: "1px solid #c9a227",
      borderRadius: "4px",
      padding: "7px 10px",
      marginTop: "10px",
      background: "#faf8f5",
      fontSize: "10px",
      color: "#333",
    },
    payToTitle: {
      fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em",
      color: "#8a6d1b", textTransform: "uppercase" as const, marginBottom: "3px",
    },
    payToGrid: {
      display: "grid", gridTemplateColumns: "auto 1fr", gap: "1px 10px",
      fontSize: "10px",
    },
    payToLabel: { color: "#777" },
    payToValue: { fontWeight: 700, color: "#111" },
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
    <div className="print-page" style={s.page}>
      <div className="invoice-frame" style={s.frame}>
      {/* ── Header ── */}
      <div style={s.headerRow}>
        {/* Left: logo with the GLS PLUS wordmark beneath it. */}
        <div style={s.brandBlock}>
          {logoSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoSrc}
              alt="logo"
              style={{ height: "52px", width: "52px", objectFit: "contain" }}
            />
          )}
          <div style={s.brandName}>GLS PLUS</div>
        </div>

        {/* Middle: company name + addresses, condensed. */}
        <div style={s.companyBlock}>
          <div>
            <span style={s.companyNameTh}>{companyTh}</span>{" "}
            <span style={s.companyNameEn}>{companyEn}</span>
          </div>
          <div style={s.addressText}>{addressEn}</div>
          <div style={s.addressText}>{addressTh}</div>
          <div style={s.addressText}>Email: {email} &nbsp;·&nbsp; Tel: {phone}</div>
          <div style={s.addressText}>
            เลขประจำตัวผู้เสียภาษี / Tax ID: <strong>{taxId}</strong> &nbsp;·&nbsp; สำนักงานใหญ่ / Head Office
          </div>
        </div>

        {/* Right: Document type */}
        <div style={s.docTypeBlock}>
          {tx.type === "BUY" ? (
            <>
              <div style={s.docTypeLabel}>Purchase Receipt /</div>
              <div style={s.docTypeSub}>ใบเสร็จรับเงิน</div>
            </>
          ) : (
            <>
              <div style={s.docTypeLabel}>Receipt /</div>
              <div style={s.docTypeLabel}>Tax Invoice</div>
              <div style={s.docTypeSub}>ใบเสร็จรับเงิน / ใบกำกับภาษี</div>
            </>
          )}
          <div style={s.originalBadge}>{copyLabel}</div>
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
            <th style={{ ...s.thRight, width: "110px" }}>ราคา/หน่วย<br />Unit/Price</th>
            <th style={{ ...s.thRight, width: "120px" }}>น้ำหนัก (กรัม)<br />Weight (gram)</th>
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
            <td style={s.tdRight}>{fmtNum(tx.rate_per_gram, 2)}</td>
            <td style={s.tdRight}>{fmtNum(tx.weight_grams, 4)}</td>
            <td style={s.tdRight}>{fmtNum(subtotal, 2)}</td>
          </tr>
          {/* Blank filler rows for visual space (hidden when printing so both copies fit one A4 each) */}
          {[1, 2].map((i) => (
            <tr key={i} className="invoice-filler-row">
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

      {/* ── Pay-to / company bank details (SELL invoices only) ── */}
      {tx.type === "SELL" && hasBankDetails && (
        <div style={s.payToBox}>
          <div style={s.payToTitle}>โอนเงินเข้าบัญชี / Payment - transfer to</div>
          <div style={s.payToGrid}>
            <span style={s.payToLabel}>ธนาคาร / Bank:</span>
            <span style={s.payToValue}>{bankName}</span>
            <span style={s.payToLabel}>ชื่อบัญชี / A/C Name:</span>
            <span style={s.payToValue}>{bankAccName}</span>
            <span style={s.payToLabel}>เลขที่บัญชี / A/C No.:</span>
            <span style={{ ...s.payToValue, fontFamily: "monospace", letterSpacing: "0.04em" }}>{bankAccNo}</span>
          </div>
        </div>
      )}

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
          <div className="invoice-sig-gap" style={{ height: "32px" }} />
          <div style={s.sigBox}>ผู้มีอำนาจลงนาม<br />Authorised Signature</div>
        </div>
        <div>
          <div className="invoice-sig-gap" style={{ height: "32px" }} />
          <div style={s.sigBox}>ผู้รับเงิน / Collector</div>
        </div>
        <div>
          <div className="invoice-sig-gap" style={{ height: "32px" }} />
          <div style={s.sigBox}>วันที่ / Date</div>
        </div>
        <div>
          <div className="invoice-sig-gap" style={{ height: "32px" }} />
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
    </div>
  );
}

/**
 * What actually goes on paper: the customer's ORIGINAL followed by the owner's
 * COPY, split across two sheets.
 */
export function InvoicePrintSet({ tx, settings }: { tx: TxDetail; settings: Settings }) {
  return (
    <>
      <InvoiceDocument tx={tx} settings={settings} copyLabel="ORIGINAL" />
      <InvoiceDocument tx={tx} settings={settings} copyLabel="COPY" />
    </>
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
    bank_name: null,
    bank_account_name: null,
    bank_account_number: null,
  });

  useEffect(() => {
    const run = async () => {
      try {
        const supabase = getSupabaseClient() as any;
        const { data } = await supabase
          .from("settings")
          .select("company_name_en,company_name_th,address_en,address_th,phone,email,tax_id,invoice_footer_note,logo_data_url,bank_name,bank_account_name,bank_account_number")
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
          <InvoicePrintSet tx={tx} settings={settings} />
        </div>
      </div>
    </>
  );
}

