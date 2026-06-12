import { NextResponse } from "next/server";

import { checkWacColumnsAvailable } from "@/lib/wac-columns";
import { resolveSupabaseDbUrl } from "@/lib/supabase-db-url";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

export async function GET() {
  try {
    const supabase = createSupabaseServiceClient();
    const hasColumns = await checkWacColumnsAvailable(supabase as never);
    const canMigrate = Boolean(resolveSupabaseDbUrl());

    return NextResponse.json({ hasColumns, canMigrate });
  } catch (e) {
    const message = e instanceof Error ? e.message : "WAC status check failed";
    return NextResponse.json(
      { hasColumns: false, canMigrate: false, error: message },
      { status: 500 }
    );
  }
}
