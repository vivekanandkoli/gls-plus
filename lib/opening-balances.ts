/**
 * Per-book, per-year opening balances for the two-ledger model.
 * Each book's WAC chain starts from its opening balance for the current year.
 */

import { openingFromRow, type OpeningBalance } from "@/lib/wac-ledger";

export type Book = "official" | "unofficial";

export const BOOKS: readonly Book[] = ["official", "unofficial"] as const;

export function currentYear(): number {
  return new Date().getFullYear();
}

/** Fetch the opening balance for a given (year, book). Falls back to zero. */
export async function fetchOpeningBalance(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  book: Book,
  year: number = currentYear()
): Promise<OpeningBalance> {
  const { data } = await supabase
    .from("opening_balances")
    .select("opening_stock_gm,opening_wac,opening_stock_value_thb")
    .eq("year", year)
    .eq("book", book)
    .maybeSingle();
  return openingFromRow(data);
}
