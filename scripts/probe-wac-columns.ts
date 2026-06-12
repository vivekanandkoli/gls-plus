import { createClient } from "@supabase/supabase-js";

import { checkWacColumnsAvailable } from "../lib/wac-columns";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function main() {
  if (!url || !key) {
    console.error("Missing Supabase env vars");
    process.exit(1);
  }

  const gls = createClient(url, key, { db: { schema: "gls" } });
  const pub = createClient(url, key, { db: { schema: "public" } });

  const glsOk = await checkWacColumnsAvailable(gls as never);
  console.log("gls.hasColumns", glsOk);

  const { error: pubErr } = await pub
    .from("transactions")
    .select("wac_at_sale")
    .limit(1);
  console.log(
    "public.transactions_probe",
    pubErr ? pubErr.message : "table_or_column_ok"
  );

  if (!glsOk) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
