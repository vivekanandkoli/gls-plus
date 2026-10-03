"use client";

import { useEffect } from "react";

/** Registers the service worker so GLS Plus is an installable PWA.
 *  Only runs in the browser, in production, when the API is available. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration is best-effort; ignore failures */
      });
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
