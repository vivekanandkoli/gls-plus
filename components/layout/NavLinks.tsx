"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { PRIMARY_NAV } from "@/components/layout/app-nav-config";
import { usePendingCount } from "@/hooks/use-app-user";

export function NavLinks({
  onNavigate,
  className,
  linkClassName,
  activeClassName,
  inactiveClassName,
}: {
  onNavigate?: () => void;
  className?: string;
  linkClassName?: string;
  activeClassName?: string;
  inactiveClassName?: string;
}) {
  const pathname = usePathname();
  const { count: pendingCount } = usePendingCount(true);

  return (
    <nav className={className}>
      {PRIMARY_NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname?.startsWith(href + "/");
        const showBadge = href === "/deals" && pendingCount > 0;
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              linkClassName,
              active ? activeClassName : inactiveClassName
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{label}</span>
            {showBadge && (
              <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">
                {pendingCount > 99 ? "99+" : pendingCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
