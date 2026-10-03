import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

/** POST /api/push/subscribe — store (or refresh) this device's push subscription. */
export async function POST(req: Request) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  try {
    const body = await req.json().catch(() => null);
    const sub = body?.subscription;
    const endpoint: string | undefined = sub?.endpoint;
    const p256dh: string | undefined = sub?.keys?.p256dh;
    const auth: string | undefined = sub?.keys?.auth;
    const userAgent =
      typeof body?.userAgent === "string" ? body.userAgent.slice(0, 300) : null;

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;
    const { error } = await sb
      .from("push_subscriptions")
      .upsert(
        { user_id: user.id, endpoint, p256dh, auth, user_agent: userAgent },
        { onConflict: "endpoint" }
      );
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to subscribe";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
