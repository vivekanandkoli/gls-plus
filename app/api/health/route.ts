import { NextResponse } from "next/server";

import { createSupabaseServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

/**
 * Public health check. Does a trivial DB read so hitting it counts as Supabase
 * activity (keeps the free-tier project from pausing) and doubles as an uptime
 * probe. Returns no business data. Whitelisted in proxy.ts.
 */
export async function GET() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;
    const { error } = await sb.from("settings").select("id").limit(1);
    const ok = !error;
    return NextResponse.json(
      { ok, db: ok, time: new Date().toISOString() },
      { status: ok ? 200 : 503 }
    );
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
