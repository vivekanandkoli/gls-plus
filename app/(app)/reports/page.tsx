import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Calculator,
  FileText,
  LineChart,
  TrendingUp,
  Users,
  Wallet,
  Layers,
  Banknote,
} from "lucide-react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { getAppUser } from "@/lib/auth-server";

const publicReportLinks = [
  {
    href: "/reports/top-buyers",
    label: "Top Clients",
    desc: "Ranked by volume sold — identify your highest-value relationships",
    icon: Users,
    gradient: "from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20",
    accent: "border-l-amber-500",
    iconBg: "bg-amber-100 dark:bg-amber-900/40",
    iconColor: "text-amber-700 dark:text-amber-400",
  },
  {
    href: "/reports/rate-trend",
    label: "Rate Trend",
    desc: "Buy & sell rates over time with min / max / avg breakdowns",
    icon: LineChart,
    gradient: "from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/20",
    accent: "border-l-blue-500",
    iconBg: "bg-blue-100 dark:bg-blue-900/40",
    iconColor: "text-blue-700 dark:text-blue-400",
  },
  {
    href: "/reports/monthly-volume",
    label: "Monthly Volume",
    desc: "BUY vs SELL grams per month — spot seasonal trends at a glance",
    icon: BarChart3,
    gradient: "from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20",
    accent: "border-l-emerald-500",
    iconBg: "bg-emerald-100 dark:bg-emerald-900/40",
    iconColor: "text-emerald-700 dark:text-emerald-400",
  },
  {
    href: "/reports/stock-movement",
    label: "Stock Movement",
    desc: "Running balance over time — track highs, lows and inventory health",
    icon: Layers,
    gradient: "from-yellow-50 to-amber-50 dark:from-yellow-950/30 dark:to-amber-950/20",
    accent: "border-l-yellow-500",
    iconBg: "bg-yellow-100 dark:bg-yellow-900/40",
    iconColor: "text-yellow-700 dark:text-yellow-400",
  },
  {
    href: "/reports/client-pl",
    label: "Client P/L",
    desc: "Net grams and THB per client — who's profitable, who needs attention",
    icon: Wallet,
    gradient: "from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/20",
    accent: "border-l-violet-500",
    iconBg: "bg-violet-100 dark:bg-violet-900/40",
    iconColor: "text-violet-700 dark:text-violet-400",
  },
  {
    href: "/reports/manage-pl",
    label: "Manage P/L",
    desc: "Import P/L workbook — per-transaction profit and overall year-end profit",
    icon: Calculator,
    gradient: "from-cyan-50 to-sky-50 dark:from-cyan-950/30 dark:to-sky-950/20",
    accent: "border-l-cyan-500",
    iconBg: "bg-cyan-100 dark:bg-cyan-900/40",
    iconColor: "text-cyan-700 dark:text-cyan-400",
  },
  {
    href: "/reports/revenue",
    label: "Revenue & Margin",
    desc: "SELL revenue vs BUY cost — gross margin and monthly P&L breakdown",
    icon: TrendingUp,
    gradient: "from-rose-50 to-pink-50 dark:from-rose-950/30 dark:to-pink-950/20",
    accent: "border-l-rose-500",
    iconBg: "bg-rose-100 dark:bg-rose-900/40",
    iconColor: "text-rose-700 dark:text-rose-400",
  },
  {
    href: "/reports/statements",
    label: "Statements",
    desc: "Monthly, client-wise & annual statements — export as PDF or Excel for CA",
    icon: FileText,
    gradient: "from-slate-50 to-zinc-50 dark:from-slate-950/30 dark:to-zinc-950/20",
    accent: "border-l-slate-500",
    iconBg: "bg-slate-100 dark:bg-slate-900/40",
    iconColor: "text-slate-700 dark:text-slate-400",
  },
];

const adminOnlyLinks = [
  {
    href: "/reports/cash",
    label: "💰 Cash Report",
    desc: "Internal cash-only transactions — P&L, stock, and client breakdown (admin only)",
    icon: Banknote,
    gradient: "from-zinc-50 to-zinc-100 dark:from-zinc-950/30 dark:to-zinc-900/20",
    accent: "border-l-zinc-400",
    iconBg: "bg-zinc-100 dark:bg-zinc-900/40",
    iconColor: "text-zinc-600 dark:text-zinc-400",
  },
];

export default async function ReportsPage() {
  // Check if user is admin to conditionally show admin-only links
  let isAdmin = false;
  try {
    const user = await getAppUser();
    isAdmin = user?.role === "admin";
  } catch {
    // non-fatal; just don't show admin links
  }

  const allLinks = isAdmin ? [...publicReportLinks, ...adminOnlyLinks] : publicReportLinks;

  return (
    <PageWrapper
      title="Reports"
      description="Analytics and exports for volume, rates, and profitability."
    >
      <p className="mb-6 text-sm text-muted-foreground">
        Choose a report to drill into performance, trends, and client insights.
      </p>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {allLinks.map((r) => {
          const Icon = r.icon;
          return (
            <Link key={r.href} href={r.href} className="group block">
              <div
                className={`relative flex h-full flex-col gap-3 overflow-hidden rounded-xl border border-l-4 bg-gradient-to-br p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${r.gradient} ${r.accent}`}
              >
                <div className="flex items-start justify-between">
                  <div className={`rounded-lg p-2.5 ${r.iconBg}`}>
                    <Icon className={`h-5 w-5 ${r.iconColor}`} />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/40 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-muted-foreground" />
                </div>
                <div>
                  <div className="font-semibold text-foreground">{r.label}</div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {r.desc}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </PageWrapper>
  );
}
