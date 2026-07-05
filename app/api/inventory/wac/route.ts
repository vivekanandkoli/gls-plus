import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { currentBookWac } from "@/lib/book-wac";

export const dynamic = "force-dynamic";

/**
 * GET /api/inventory/wac
 * Live WAC + stock for both books. `official` = tax view, `unofficial` = the
 * real vault (owner's actual). Used by the SELL preview and the dashboard.
 */
export async function GET() {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  try {
    const supabase = createSupabaseServiceClient();
    const [official, unofficial] = await Promise.all([
      currentBookWac(supabase, "official"),
      currentBookWac(supabase, "unofficial"),
    ]);
    return NextResponse.json({ official, unofficial });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load WAC";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
