import webpush from "web-push";

import { createSupabaseServiceClient } from "@/lib/supabase-service";

let configured: boolean | null = null;

/** Configure web-push from VAPID env vars once. Returns false if not set. */
function configure(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:glsplusdb@gmail.com";
  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch {
    configured = false;
  }
  return configured;
}

export type PushPayload = { title: string; body: string; url?: string };

/**
 * Send a web-push notification to every active admin's subscribed devices.
 * Best-effort: never throws, and prunes dead subscriptions. Safe to await
 * inside an API route without risking the main operation.
 */
export async function notifyAdmins(payload: PushPayload): Promise<void> {
  try {
    if (!configure()) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;

    const { data: admins } = await sb
      .from("users")
      .select("id")
      .eq("role", "admin")
      .eq("is_active", true);
    const ids = (admins ?? []).map((a: { id: number }) => a.id);
    if (ids.length === 0) return;

    const { data: subs } = await sb
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .in("user_id", ids);
    if (!subs || subs.length === 0) return;

    const body = JSON.stringify(payload);
    await Promise.all(
      subs.map(
        async (s: { id: string; endpoint: string; p256dh: string; auth: string }) => {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              body
            );
          } catch (e: unknown) {
            const code = (e as { statusCode?: number })?.statusCode;
            if (code === 404 || code === 410) {
              await sb.from("push_subscriptions").delete().eq("id", s.id);
            }
          }
        }
      )
    );
  } catch {
    /* notifications are best-effort; never break the caller */
  }
}
