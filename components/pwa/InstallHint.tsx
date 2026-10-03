"use client";

import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";

const DISMISS_KEY = "gls-ios-install-hint-dismissed";

/** iOS Safari has no automatic install prompt — show a one-time hint telling
 *  users how to add GLS Plus to the home screen. Hidden once installed or
 *  dismissed, and never shown on non-iOS or inside the installed app. */
export function InstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const ua = window.navigator.userAgent;
      const isIos = /iphone|ipad|ipod/i.test(ua);
      // iPadOS 13+ masquerades as Mac; detect the touch Mac too.
      const isIpadOs = ua.includes("Macintosh") && navigator.maxTouchPoints > 1;
      const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        // iOS-only flag set when launched from the home screen.
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      const dismissed = localStorage.getItem(DISMISS_KEY) === "1";

      if ((isIos || isIpadOs) && isSafari && !standalone && !dismissed) {
        setShow(true);
      }
    } catch {
      /* matchMedia / localStorage can throw in private mode — ignore */
    }
  }, []);

  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  return (
    <div
      className="fixed inset-x-3 z-50 rounded-xl border bg-card px-4 py-3 shadow-lg"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)", borderColor: "var(--border)" }}
      role="dialog"
      aria-label="Install GLS Plus"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 rounded-md bg-primary/10 p-1.5 text-primary">
          <Share className="h-4 w-4" />
        </div>
        <div className="flex-1 text-sm">
          <div className="font-medium text-card-foreground">Install GLS Plus</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Tap the <span className="font-medium">Share</span> button, then{" "}
            <span className="font-medium">Add to Home Screen</span> to use GLS Plus like an app.
          </p>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
