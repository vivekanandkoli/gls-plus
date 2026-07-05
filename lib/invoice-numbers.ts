/**
 * Per-book invoice numbering.
 *   official BUY  → IV-YYYYMMDD-NNN
 *   official SELL → UP-YYYYMMDD-NNN   (separate sequence from BUY)
 *   unofficial    → PV-YYYYMMDD-NNN   (single sequence across BUY + SELL)
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
    .select("invoice_prefix_official_buy,invoice_prefix_official_sell,invoice_prefix_unofficial")
    .limit(1)
    .maybeSingle();
  return {
    officialBuy: data?.invoice_prefix_official_buy ?? "IV",
    officialSell: data?.invoice_prefix_official_sell ?? "UP",
    unofficial: data?.invoice_prefix_unofficial ?? "PV",
  };
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

  let prefix: string;
  let seq: number;

  if (book === "official") {
    prefix = type === "BUY" ? prefixes.officialBuy : prefixes.officialSell;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (supabase as any)
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("book", "official")
      .eq("type", type)
      .eq("date", date);
    seq = (count ?? 0) + 1;
  } else {
    prefix = prefixes.unofficial;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (supabase as any)
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("book", "unofficial")
      .eq("date", date);
    seq = (count ?? 0) + 1;
  }

  return `${prefix}-${day}-${pad3(seq)}`;
}
