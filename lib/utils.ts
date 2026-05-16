import { clsx, type ClassValue } from "clsx";
import { format } from "date-fns";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** PostgREST many-to-one embeds return a single object; older code sometimes treats it as an array. */
export function embedFkOne<T>(row: T | T[] | null | undefined): T | null {
  if (row == null) return null;
  if (Array.isArray(row)) return row[0] ?? null;
  return row;
}

/** Shorthand for `client:clients(...)` embeds on transactions. */
export function embeddedClientName(
  client: { name: string } | { name: string }[] | null | undefined
): string | null {
  const c = embedFkOne(client);
  return c?.name ?? null;
}

export function formatCurrency(
  amount: number,
  currency: string = "USD",
  locales: string | string[] = "en-US"
) {
  return new Intl.NumberFormat(locales, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(iso: string, pattern: string = "PPP") {
  return format(new Date(iso), pattern);
}

export function generateInvoiceNumber(date: Date = new Date()) {
  // e.g. INV-20260427-4821
  const stamp = format(date, "yyyyMMdd");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `INV-${stamp}-${rand}`;
}

// Thai Baht text (basic, for receipts/invoices).
// Example: 1234.50 => "หนึ่งพันสองร้อยสามสิบสี่บาทห้าสิบสตางค์"
export function thaiBahtText(amount: number) {
  if (!Number.isFinite(amount)) return "";
  const fixed = Math.round(amount * 100) / 100;
  const baht = Math.floor(fixed);
  const satang = Math.round((fixed - baht) * 100);

  const digit = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
  const unit = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];

  function readInt(n: number): string {
    if (n === 0) return digit[0];
    let text = "";
    const s = String(n);
    for (let i = 0; i < s.length; i++) {
      const d = Number(s[i]);
      const pos = s.length - i - 1;
      if (d === 0) continue;

      if (pos === 0) {
        if (d === 1 && s.length > 1) text += "เอ็ด";
        else text += digit[d];
      } else if (pos === 1) {
        if (d === 1) text += "สิบ";
        else if (d === 2) text += "ยี่สิบ";
        else text += digit[d] + "สิบ";
      } else {
        text += digit[d] + unit[pos % 6];
      }

      // handle ล้าน blocks
      if (pos > 0 && pos % 6 === 0) text += "ล้าน";
    }
    return text;
  }

  const bahtText = readInt(baht) + "บาท";
  if (satang === 0) return bahtText + "ถ้วน";
  return bahtText + readInt(satang) + "สตางค์";
}
