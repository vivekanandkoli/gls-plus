import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-server";
import { applyWacColumnMigration } from "@/lib/wac-migrate";
import { checkWacColumnsAvailable } from "@/lib/wac-columns";
import { resolveSupabaseDbUrl } from "@/lib/supabase-db-url";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      password?: unknown;
    };
    const passwordFromBody =
      typeof body.password === "string" ? body.password : undefined;
    const dbUrl = resolveSupabaseDbUrl(passwordFromBody);
    const supabase = createSupabaseServiceClient();
    const hasColumnsBefore = await checkWacColumnsAvailable(supabase as never);

    if (hasColumnsBefore) {
      return NextResponse.json({ ok: true, alreadyApplied: true });
    }

    if (!dbUrl) {
      return NextResponse.json(
        {
          error:
            "Add SUPABASE_DB_URL or SUPABASE_DB_PASSWORD to .env.local, pass password in the request body, or run scripts/add-transaction-wac-columns.sql in the SQL Editor.",
        },
        { status: 503 }
      );
    }

    await applyWacColumnMigration(dbUrl);

    const hasColumnsAfter = await checkWacColumnsAvailable(supabase as never);

    if (!hasColumnsAfter) {
      return NextResponse.json(
        {
          error:
            "Migration ran but WAC columns are still not visible. Wait a few seconds and retry, or reload the Supabase API schema.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, alreadyApplied: false });
  } catch (e) {
    const message = e instanceof Error ? e.message : "WAC migration failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
