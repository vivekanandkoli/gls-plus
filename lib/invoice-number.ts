import type { Book } from "@/lib/rbac";

export type TxType = "BUY" | "SELL";

/** Width of the per-day counter, e.g. UP260912001. */
const SEQ_WIDTH = 3;

/**
 * Each book/type pair owns its own series, so cash rows never consume a
 * declared invoice number: official PO/UP, unofficial CB/CS.
 */
export function invoicePrefix(book: Book, type: TxType): string {
  if (book === "unofficial") return type === "BUY" ? "CB" : "CS";
  return type === "BUY" ? "PO" : "UP";
}

/** `2026-09-12` → `260912` */
export function invoiceDatePart(date: string): string {
  const [y = "", m = "", d = ""] = date.split("-");
  return `${y.slice(2)}${m}${d}`;
}

/**
 * Next invoice number for a book/type/date, derived from the highest serial
 * already issued that day rather than the row count, so deleting a row can
 * never hand the same number out twice.
 */
export async function nextInvoiceNumber(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  book: Book,
  type: TxType,
  date: string
): Promise<string> {
  const prefix = `${invoicePrefix(book, type)}${invoiceDatePart(date)}`;
  const { data, error } = await supabase
    .from("transactions")
    .select("invoice_number")
    .like("invoice_number", `${prefix}%`);
  if (error) throw new Error(error.message);

  let highest = 0;
  for (const row of data ?? []) {
    const suffix = String(row.invoice_number ?? "").slice(prefix.length);
    if (!/^\d+$/.test(suffix)) continue;
    highest = Math.max(highest, Number(suffix));
  }

  return `${prefix}${String(highest + 1).padStart(SEQ_WIDTH, "0")}`;
}
