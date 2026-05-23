"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { ChevronDown, LogOut, Settings2, User as UserIcon } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getSupabaseClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export function UserMenu() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();

    function syncUser() {
      void supabase.auth.getUser().then((res: { data: { user: SupabaseUser | null } }) => {
        setEmail(res.data.user?.email ?? null);
      });
    }

    syncUser();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      syncUser();
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    setOpen(false);
    await getSupabaseClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const label = email ?? "Account";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        className={cn(
          "inline-flex min-h-10 max-w-[min(220px,55vw)] items-center gap-2 rounded-full border pl-3 pr-2 py-1.5 text-left text-xs font-medium transition-colors",
          "border-amber-700/25 bg-sidebar/80 text-foreground shadow-sm",
          "hover:border-amber-600/45 hover:bg-muted/80",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        )}
        style={{
          borderColor: "rgba(201, 162, 39, 0.35)",
          background: "var(--card)",
        }}
        aria-label="Open account menu"
      >
        <UserIcon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
        <span className="truncate">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0 overflow-hidden">
        <PopoverHeader className="px-4 pt-4 pb-2">
          <PopoverTitle className="text-sm">Signed in</PopoverTitle>
          <PopoverDescription className="truncate text-xs">
            {email ?? "Session active"}
          </PopoverDescription>
        </PopoverHeader>
        <div className="flex flex-col border-t border-border p-1">
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm text-foreground hover:bg-muted"
          >
            <Settings2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            Settings
          </Link>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
