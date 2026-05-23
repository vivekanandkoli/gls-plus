"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  LogOut,
  Menu,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase";
import { PRIMARY_NAV } from "@/components/layout/app-nav-config";

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleSignOut() {
    setOpen(false);
    await getSupabaseClient().auth.signOut();
    router.refresh();
    router.push("/login");
  }

  return (
    <>
      {/* Hamburger bar — only visible on mobile */}
      <header
        className="md:hidden sticky top-0 z-30 flex h-14 items-center justify-between px-4 border-b backdrop-blur-md supports-[backdrop-filter]:bg-sidebar/90"
        style={{ background: "var(--sidebar)", borderColor: "var(--sidebar-border)" }}
      >
        <div className="flex items-center gap-3">
          <Image
            src="/logo-gls-transparent.png"
            alt="GLS logo"
            width={32}
            height={32}
            className="h-8 w-8 object-contain"
          />
          <span
            className="text-sm font-bold tracking-widest"
            style={{ fontFamily: "var(--font-heading)", color: "#c9a227", letterSpacing: "0.15em" }}
          >
            GLS PLUS
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="inline-flex h-11 w-11 items-center justify-center rounded-md transition-colors focus-visible:outline-offset-2"
          style={{ color: "var(--sidebar-foreground)" }}
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      {/* Backdrop */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <nav
        className={cn(
          "md:hidden fixed inset-y-0 left-0 z-50 w-72 flex flex-col transition-transform duration-300",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ background: "var(--sidebar)", borderRight: "1px solid var(--sidebar-border)" }}
      >
        {/* Header */}
        <div
          className="flex h-14 items-center justify-between px-5"
          style={{ borderBottom: "1px solid var(--sidebar-border)" }}
        >
          <div className="flex items-center gap-3">
            <Image
              src="/logo-gls-transparent.png"
              alt="GLS logo"
              width={32}
              height={32}
              className="h-8 w-8 object-contain"
            />
            <div>
              <div
                className="text-sm font-bold tracking-widest"
                style={{ fontFamily: "var(--font-heading)", color: "#c9a227", letterSpacing: "0.15em" }}
              >
                GLS PLUS
              </div>
              <div className="text-[9px] tracking-widest" style={{ color: "rgba(245,240,232,0.4)", letterSpacing: "0.2em" }}>
                TECHNO THAI
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md transition-colors focus-visible:outline-offset-2"
            style={{ color: "rgba(245,240,232,0.6)" }}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Nav items */}
        <div className="flex flex-col gap-0.5 p-3 flex-1">
          {PRIMARY_NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname?.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  "group flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-all duration-200 ease-out relative",
                  active
                    ? "text-sidebar-accent-foreground bg-sidebar-accent"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
                )}
              >
                {active && (
                  <span
                    className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full"
                    style={{ background: "var(--gold-gradient)" }}
                  />
                )}
                <Icon className={cn("h-4 w-4 shrink-0", active ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/50")} />
                {label}
              </Link>
            );
          })}
        </div>

        {/* Footer — sign-out */}
        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{ borderTop: "1px solid var(--sidebar-border)" }}
        >
          <span
            className="text-xs"
            style={{ color: "rgba(245,240,232,0.3)", letterSpacing: "0.08em" }}
          >
            EST. 2007 · BANGKOK
          </span>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Sign out of GLS Plus"
            className="flex min-h-11 items-center gap-1.5 rounded-md px-3 text-xs transition-colors hover:bg-sidebar-accent/60 focus-visible:outline-offset-2"
            style={{ color: "rgba(245,240,232,0.5)" }}
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </nav>
    </>
  );
}
