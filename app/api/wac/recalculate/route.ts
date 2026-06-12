import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-server";
import { persistWacRecalculation } from "@/lib/wac-persist";
import { checkWacColumnsAvailable } from "@/lib/wac-columns";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await req.json().catch(() => null);
    const fromDate = typeof body?.fromDate === "string" ? body.fromDate : null;
    const fromId = typeof body?.fromId === "string" ? body.fromId : undefined;

    if (!fromDate || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
      return NextResponse.json({ error: "fromDate required (YYYY-MM-DD)" }, { status: 400 });
    }

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
      fromDate,
      fromId,
    });

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "WAC recalculation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
