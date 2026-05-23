import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function TransactionTypeBadge({
  type,
  className,
  children,
}: {
  type: "BUY" | "SELL";
  className?: string;
  /** Visible label; defaults to the raw type (BUY / SELL) */
  children?: ReactNode;
}) {
  const isBuy = type === "BUY";
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] font-semibold uppercase tracking-wider tabular-nums",
        isBuy
          ? "border-emerald-600/50 bg-emerald-50/80 text-emerald-900 dark:border-emerald-500/50 dark:bg-emerald-950/40 dark:text-emerald-200"
          : "border-amber-600/50 bg-amber-50/80 text-amber-900 dark:border-amber-500/50 dark:bg-amber-950/40 dark:text-amber-200",
        className
      )}
      aria-label={isBuy ? "Purchase (buy)" : "Sale (sell)"}
    >
      {children ?? type}
    </Badge>
  );
}
