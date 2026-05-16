"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  BarChart3,
  FileText,
  LayoutDashboard,
  Settings2,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard",    label: "Dashboard",    icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight  },
  { href: "/invoices",     label: "Invoices",     icon: FileText        },
  { href: "/clients",      label: "Clients",      icon: Users           },
  { href: "/reports",      label: "Reports",      icon: BarChart3       },
  { href: "/settings",     label: "Settings",     icon: Settings2       },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:border-r md:bg-sidebar md:text-sidebar-foreground"
      style={{ borderColor: "var(--sidebar-border)" }}
    >
      {/* Logo area */}
      <div
        className="flex items-center gap-3.5 px-5 py-4"
        style={{ borderBottom: "1px solid var(--sidebar-border)" }}
      >
        {/* Icon mark — transparent bg, glows on dark */}
        <div className="shrink-0 relative">
          <Image
            src="/logo-gls-transparent.png"
            alt="GLS Techno Thai logo"
            width={44}
            height={44}
            priority
            className="h-11 w-11 object-contain drop-shadow-[0_0_8px_rgba(201,162,39,0.5)]"
          />
        </div>

        {/* Wordmark */}
        <div className="flex flex-col justify-center gap-0.5 min-w-0">
          <span
            className="block font-bold leading-none tracking-[0.18em] truncate"
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "1.1rem",
              background: "var(--gold-gradient)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            GLS PLUS
          </span>
          <span
            className="block leading-none truncate"
            style={{
              fontSize: "0.6rem",
              letterSpacing: "0.28em",
              color: "rgba(245, 240, 232, 0.4)",
              fontFamily: "var(--font-sans)",
              fontWeight: 400,
              textTransform: "uppercase",
            }}
          >
            Techno Thai
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 p-3 flex-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors relative",
                active
                  ? "text-sidebar-accent-foreground bg-sidebar-accent"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
              )}
            >
              {/* Gold left-border on active */}
              {active && (
                <span
                  className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full"
                  style={{ background: "var(--gold-gradient)" }}
                />
              )}
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  active ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80"
                )}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer tagline */}
      <div
        className="px-5 py-4 text-xs"
        style={{
          borderTop: "1px solid var(--sidebar-border)",
          color: "rgba(245, 240, 232, 0.35)",
          letterSpacing: "0.08em",
        }}
      >
        EST. 2007 · BANGKOK
      </div>
    </aside>
  );
}
