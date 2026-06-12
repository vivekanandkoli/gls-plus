/** Probe whether persisted WAC columns exist on gls.transactions. */
export async function checkWacColumnsAvailable(
  supabase: { from: (table: string) => { select: (cols: string) => { limit: (n: number) => PromiseLike<{ error: { message: string; code?: string } | null }> } } }
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("transactions")
      .select("wac_at_sale,cost_of_sale,profit_loss,pl_percent")
      .limit(1);

    if (!error) return true;

    const msg = error.message.toLowerCase();
    if (
      msg.includes("cost_of_sale") ||
      msg.includes("wac_at_sale") ||
      msg.includes("profit_loss") ||
      msg.includes("pl_percent") ||
      msg.includes("schema cache") ||
      msg.includes("does not exist") ||
      error.code === "PGRST204" ||
      error.code === "42703"
    ) {
      return false;
    }

    return false;
  } catch {
    return false;
  }
}

export const WAC_MIGRATION_SQL = `-- Run in Supabase SQL Editor (project schema: gls)

-- Ensure created_at exists for same-date WAC ordering
ALTER TABLE gls.transactions
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- WAC P&L columns for persisted calculation
ALTER TABLE gls.transactions
  ADD COLUMN IF NOT EXISTS wac_at_sale  numeric(12, 4),
  ADD COLUMN IF NOT EXISTS cost_of_sale numeric(14, 2),
  ADD COLUMN IF NOT EXISTS profit_loss  numeric(14, 2),
  ADD COLUMN IF NOT EXISTS pl_percent   numeric(8,  2);

CREATE INDEX IF NOT EXISTS idx_transactions_wac_pl
  ON gls.transactions (date, created_at, id)
  WHERE type = 'SELL';`;
