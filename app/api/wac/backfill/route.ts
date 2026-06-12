import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-server";
import { checkWacColumnsAvailable } from "@/lib/wac-columns";
import { persistWacRecalculation } from "@/lib/wac-persist";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

export async function POST() {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const supabase = createSupabaseServiceClient();
    const hasColumns = await checkWacColumnsAvailable(supabase as never);

    if (!hasColumns) {
      return NextResponse.json(
        {
          error:
            "WAC columns are missing on gls.transactions. Run scripts/add-transaction-wac-columns.sql in Supabase SQL Editor first.",
        },
        { status: 400 }
      );
    }

    const result = await persistWacRecalculation(supabase as never, {
      fromDate: "1970-01-01",
    });

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "WAC backfill failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
