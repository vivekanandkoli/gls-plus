import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

/** POST /api/push/unsubscribe — remove this device's push subscription. */
export async function POST(req: Request) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  try {
    const body = await req.json().catch(() => null);
    const endpoint: string | undefined = body?.endpoint;
    if (!endpoint) {
      return NextResponse.json({ error: "endpoint required" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;
    const { error } = await sb.from("push_subscriptions").delete().eq("endpoint", endpoint);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to unsubscribe";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
