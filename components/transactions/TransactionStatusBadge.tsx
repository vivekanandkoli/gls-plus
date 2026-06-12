import { cn } from "@/lib/utils";
import type { TransactionStatus } from "@/lib/rbac";

const STATUS_CONFIG: Record<
  TransactionStatus,
  { label: string; emoji: string; className: string }
> = {
  pending: {
    label: "Pending",
    emoji: "🟡",
    className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  },
  approved: {
    label: "Approved",
    emoji: "✅",
    className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  },
  rejected: {
    label: "Rejected",
    emoji: "❌",
    className: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100",
  },
};

export function TransactionStatusBadge({
  status,
  className,
}: {
  status: TransactionStatus;
  className?: string;
}) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        cfg.className,
        className
      )}
    >
      <span aria-hidden>{cfg.emoji}</span>
      {cfg.label}
    </span>
  );
}
