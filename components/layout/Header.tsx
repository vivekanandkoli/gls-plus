"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import { UserMenu } from "@/components/layout/UserMenu";
import { cn } from "@/lib/utils";

export function Header({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  const [searchKbd, setSearchKbd] = useState("Ctrl+K");

  useEffect(() => {
    const mac = /Mac|iPhone|iPod|iPad/i.test(
      typeof navigator !== "undefined" ? navigator.platform : ""
    );
    setSearchKbd(mac ? "⌘K" : "Ctrl+K");
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex min-h-14 md:min-h-16 flex-col gap-0 border-b px-4 py-3 md:flex-row md:items-center md:justify-between md:gap-3 md:px-6 md:py-0",
        "bg-background/80 shadow-[0_1px_0_rgba(28,25,23,0.06)] backdrop-blur-md supports-[backdrop-filter]:bg-background/72",
        "dark:shadow-[0_1px_0_rgba(245,240,232,0.06)]"
      )}
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 md:py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="h-6 w-0.5 shrink-0 rounded-full hidden sm:block"
            style={{ background: "var(--gold-gradient)" }}
            aria-hidden="true"
          />
          <h1
            className="text-lg md:text-xl font-semibold tracking-wide truncate"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {title}
          </h1>
        </div>
        {description ? (
          <p className="pl-0 text-sm text-muted-foreground sm:pl-[calc(0.75rem+2px)] md:max-w-2xl leading-snug">
            {description}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2 pt-2 md:pt-0">
        <span
          className="hidden sm:inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-widest whitespace-nowrap"
          style={{
            background: "var(--sidebar)",
            color: "#c9a227",
            border: "1px solid rgba(201,162,39,0.3)",
            letterSpacing: "0.12em",
          }}
        >
          GLS+
        </span>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("gls:open-command-palette"))}
          className={cn(
            "hidden sm:inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors",
            "hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          )}
          aria-label="Open search and navigation"
        >
          <Search className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          <span className="max-w-[7rem] truncate hidden md:inline">Search…</span>
          <kbd className="hidden md:inline rounded border border-border bg-background px-1 py-0.5 font-mono text-[10px] font-medium text-muted-foreground whitespace-nowrap">
            {searchKbd}
          </kbd>
        </button>
        <UserMenu />
      </div>
    </header>
  );
}
