"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeftRight,
  FileText,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase";
import { PRIMARY_NAV } from "@/components/layout/app-nav-config";
import { usePendingCount } from "@/hooks/use-app-user";

const MAIN = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/transactions", label: "Txns", icon: ArrowLeftRight },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/clients", label: "Clients", icon: Users },
];
const MAIN_HREFS = MAIN.map((m) => m.href);

/** Native-style bottom tab bar for the installed mobile app. Replaces the
 *  hamburger drawer on small screens; desktop keeps the sidebar. */
export function BottomTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const { count: pendingCount } = usePendingCount(true);

  const isActive = (href: string) =>
    pathname === href || (pathname?.startsWith(href + "/") ?? false);

  const moreItems = PRIMARY_NAV.filter((n) => !MAIN_HREFS.includes(n.href));
  const moreActive = moreItems.some((n) => isActive(n.href));

  async function signOut() {
    setMoreOpen(false);
    await getSupabaseClient().auth.signOut();
    router.refresh();
    router.push("/login");
  }

  const indicator = (
    <span
      className="absolute top-0 h-0.5 w-8 rounded-full"
      style={{ background: "var(--gold-gradient)" }}
      aria-hidden
    />
  );

  return (
    <>
      {/* "More" bottom sheet */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-label="More">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMoreOpen(false)} />
          <div
            className="pb-safe absolute inset-x-0 bottom-0 rounded-t-2xl bg-card shadow-2xl"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <div className="mx-auto mb-1 mt-2.5 h-1 w-10 rounded-full bg-muted" />
            <div className="grid grid-cols-3 gap-2 p-4">
              {moreItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-xs transition-colors",
                    isActive(href)
                      ? "border-primary/40 bg-primary/5 font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/50"
                  )}
                  style={{ borderColor: isActive(href) ? undefined : "var(--border)" }}
                >
                  <Icon className={cn("h-5 w-5", isActive(href) ? "text-primary" : "")} />
                  {label}
                </Link>
              ))}
              <button
                onClick={signOut}
                className="flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-xs text-muted-foreground transition-colors hover:bg-muted/50"
                style={{ borderColor: "var(--border)" }}
              >
                <LogOut className="h-5 w-5" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom tab bar */}
      <nav
        className="pb-safe md:hidden fixed inset-x-0 bottom-0 z-40 border-t bg-background/92 backdrop-blur-md supports-[backdrop-filter]:bg-background/80"
        style={{ borderColor: "var(--border)" }}
        aria-label="Primary"
      >
        <div className="grid grid-cols-5">
          {MAIN.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className="relative flex min-h-14 flex-col items-center justify-center gap-0.5 py-1.5"
              >
                {active && indicator}
                <Icon className={cn("h-[22px] w-[22px]", active ? "text-primary" : "text-muted-foreground")} />
                <span className={cn("text-[10px] leading-none", active ? "font-medium text-foreground" : "text-muted-foreground")}>
                  {label}
                </span>
                {href === "/transactions" && pendingCount > 0 && (
                  <span className="absolute right-[24%] top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">
                    {pendingCount > 9 ? "9+" : pendingCount}
                  </span>
                )}
              </Link>
            );
          })}
          <button
            onClick={() => setMoreOpen(true)}
            className="relative flex min-h-14 flex-col items-center justify-center gap-0.5 py-1.5"
            aria-label="More"
          >
            {moreActive && indicator}
            <MoreHorizontal className={cn("h-[22px] w-[22px]", moreActive ? "text-primary" : "text-muted-foreground")} />
            <span className={cn("text-[10px] leading-none", moreActive ? "font-medium text-foreground" : "text-muted-foreground")}>
              More
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
