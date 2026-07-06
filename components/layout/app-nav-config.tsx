"use client";

import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  BarChart3,
  FileSpreadsheet,
  FileText,
  HandCoins,
  LayoutDashboard,
  PlusCircle,
  ScrollText,
  Settings2,
  UserPlus,
  Users,
} from "lucide-react";

export type AppNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Extra cmdk search terms */
  keywords?: string[];
};

export const PRIMARY_NAV: AppNavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    keywords: ["home", "overview", "kpi"],
  },
  {
    href: "/transactions",
    label: "Transactions",
    icon: ArrowLeftRight,
    keywords: ["buy", "sell", "official", "unofficial", "book", "vault"],
  },
  {
    href: "/deals",
    label: "Deals",
    icon: HandCoins,
    keywords: ["buy", "sell", "trade", "paired"],
  },
  {
    href: "/invoices",
    label: "Invoices",
    icon: FileText,
    keywords: ["documents", "billing"],
  },
  {
    href: "/clients",
    label: "Clients",
    icon: Users,
    keywords: ["customers", "directory"],
  },
  {
    href: "/reports",
    label: "Reports",
    icon: BarChart3,
    keywords: ["analytics", "charts"],
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings2,
    keywords: ["preferences", "config"],
  },
];

export const QUICK_ACTIONS: AppNavItem[] = [
  {
    href: "/transactions/new",
    label: "New transaction",
    icon: PlusCircle,
    keywords: ["create", "buy", "sell", "official", "unofficial"],
  },
  {
    href: "/deals/new",
    label: "New deal",
    icon: PlusCircle,
    keywords: ["create", "paired", "trade"],
  },
  {
    href: "/transactions/import",
    label: "Import from Excel",
    icon: FileSpreadsheet,
    keywords: ["xlsx", "upload", "bulk"],
  },
  {
    href: "/clients/new",
    label: "New client",
    icon: UserPlus,
    keywords: ["add", "customer"],
  },
  {
    href: "/settings/audit-log",
    label: "Audit log",
    icon: ScrollText,
    keywords: ["history", "activity"],
  },
];
