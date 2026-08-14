/**
 * Per-book invoice numbering (separate sequence per book+type).
 *   official BUY  → IV-YYYYMMDD-NNN
 *   official SELL → UP-YYYYMMDD-NNN
 *   unofficial BUY  → UB-YYYYMMDD-NNN
 *   unofficial SELL → US-YYYYMMDD-NNN
 * Prefixes are owner-configurable in gls.settings.
 */

import { createSupabaseServiceClient } from "@/lib/supabase-service";
import type { Book } from "@/lib/opening-balances";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;
type TxType = "BUY" | "SELL";

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

async function loadPrefixes(supabase: ServiceClient) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("settings")
    .select(
      "invoice_prefix_official_buy,invoice_prefix_official_sell,invoice_prefix_unofficial_buy,invoice_prefix_unofficial_sell"
    )
    .limit(1)
    .maybeSingle();
  return {
    officialBuy: data?.invoice_prefix_official_buy ?? "IV",
    officialSell: data?.invoice_prefix_official_sell ?? "UP",
    unofficialBuy: data?.invoice_prefix_unofficial_buy ?? "UB",
    unofficialSell: data?.invoice_prefix_unofficial_sell ?? "US",
  };
}

/** Prefix for a (book, type) — matches the sequences below. */
export function invoicePrefixFor(
  book: Book,
  type: TxType,
  prefixes: { officialBuy: string; officialSell: string; unofficialBuy: string; unofficialSell: string }
): string {
  if (book === "official") return type === "BUY" ? prefixes.officialBuy : prefixes.officialSell;
  return type === "BUY" ? prefixes.unofficialBuy : prefixes.unofficialSell;
}

/**
 * Next sequential invoice number for a (book, type, date).
 * Count-based sequencing — correct for this single-writer app.
 */
export async function generateInvoiceNumber(
  supabase: ServiceClient,
  book: Book,
  type: TxType,
  date: string
): Promise<string> {
  const prefixes = await loadPrefixes(supabase);
  const day = date.replace(/-/g, "");
  const prefix = invoicePrefixFor(book, type, prefixes);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (supabase as any)
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("book", book)
    .eq("type", type)
    .eq("date", date);
  const seq = (count ?? 0) + 1;

  return `${prefix}-${day}-${pad3(seq)}`;
}
