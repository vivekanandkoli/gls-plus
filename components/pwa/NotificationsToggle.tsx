"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";

import { Button } from "@/components/ui/button";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/** Lets a user enable/disable web-push on the current device. */
export function NotificationsToggle() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(ok);
    if (!ok) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => {});
  }, []);

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapid) throw new Error("Notifications aren’t configured on the server yet.");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setMsg("Permission was blocked. Allow notifications for GLS Plus in your device settings, then try again.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), userAgent: navigator.userAgent }),
      });
      if (!res.ok) throw new Error("Could not save the subscription.");
      setSubscribed(true);
      setMsg("Notifications are on for this device.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not enable notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setMsg("Notifications are off for this device.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not turn off notifications.");
    } finally {
      setBusy(false);
    }
  }

  if (supported === false) {
    return (
      <p className="text-sm text-muted-foreground">
        Push notifications aren’t available in this browser. On iPhone, add GLS Plus to your
        Home Screen (Share → Add to Home Screen) and open it from there.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {subscribed ? (
        <Button variant="outline" onClick={disable} disabled={busy}>
          <BellOff className="mr-2 h-4 w-4" />
          {busy ? "Working…" : "Turn off notifications"}
        </Button>
      ) : (
        <Button onClick={enable} disabled={busy}>
          <Bell className="mr-2 h-4 w-4" />
          {busy ? "Working…" : "Enable notifications"}
        </Button>
      )}
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
