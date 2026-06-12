"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { PRIMARY_NAV, QUICK_ACTIONS } from "@/components/layout/app-nav-config";
import { useAppUser } from "@/hooks/use-app-user";

const ADMIN_QUICK_ACTION_HREFS = new Set(["/transactions/import", "/settings/audit-log"]);

export function AppCommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { isAdmin } = useAppUser();

  const quickActions = isAdmin
    ? QUICK_ACTIONS
    : QUICK_ACTIONS.filter((item) => !ADMIN_QUICK_ACTION_HREFS.has(item.href));

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKey);
    function onPaletteOpen() {
      setOpen(true);
    }
    window.addEventListener("gls:open-command-palette", onPaletteOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("gls:open-command-palette", onPaletteOpen);
    };
  }, []);

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Go to"
      description="Search pages and actions"
      showCloseButton={false}
    >
      <Command className="**:data-[slot=input-group]:h-10!" loop>
        <CommandInput placeholder="Search pages…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          <CommandGroup heading="Quick actions">
            {quickActions.map((item) => {
              const Icon = item.icon;
              const value = `${item.label} ${item.href}`;
              return (
                <CommandItem
                  key={item.href}
                  value={value}
                  keywords={item.keywords}
                  onSelect={() => navigate(item.href)}
                >
                  <Icon className="opacity-60" aria-hidden />
                  {item.label}
                </CommandItem>
              );
            })}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Navigate">
            {PRIMARY_NAV.map((item) => {
              const Icon = item.icon;
              const value = `${item.label} ${item.href}`;
              return (
                <CommandItem
                  key={item.href}
                  value={value}
                  keywords={item.keywords}
                  onSelect={() => navigate(item.href)}
                >
                  <Icon className="opacity-60" aria-hidden />
                  {item.label}
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
