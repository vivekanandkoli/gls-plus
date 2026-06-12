import postgres from "postgres";

const MIGRATION_SQL = `
ALTER TABLE gls.transactions
  ADD COLUMN IF NOT EXISTS wac_at_sale numeric(12, 4),
  ADD COLUMN IF NOT EXISTS cost_of_sale numeric(14, 2),
  ADD COLUMN IF NOT EXISTS profit_loss numeric(14, 2);

CREATE INDEX IF NOT EXISTS idx_transactions_wac_pl
  ON gls.transactions (date, id)
  WHERE type = 'SELL';
`;

export async function applyWacColumnMigration(dbUrl: string): Promise<void> {
  const sql = postgres(dbUrl, { ssl: "require", max: 1 });
  try {
    await sql.unsafe(MIGRATION_SQL);
    await sql`NOTIFY pgrst, 'reload schema'`;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
