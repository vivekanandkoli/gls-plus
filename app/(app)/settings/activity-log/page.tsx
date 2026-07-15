"use client";

import { useCallback, useEffect, useState } from "react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { cn } from "@/lib/utils";

type Entry = {
  id: number;
  created_at: string;
  action: string;
  transaction_id: string | null;
  performer: { email: string } | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
};

const ACTION_STYLE: Record<string, string> = {
  created: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
  deleted: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
  edited: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300",
  stock_adjusted: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
};

export default function ActivityLogPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/activity-log?limit=200");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setEntries(data.entries as Entry[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load activity log");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageWrapper title="Activity log" description="Every change to every transaction — who did it, and when.">
      {error && <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">By</th>
              <th className="px-3 py-2">Transaction</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">Loading…</td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">No activity yet.</td></tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} className="border-t border-border">
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2"><span className={cn("rounded px-1.5 py-0.5 text-xs capitalize", ACTION_STYLE[e.action] ?? "bg-muted text-muted-foreground")}>{e.action.replace("_", " ")}</span></td>
                  <td className="px-3 py-2">{e.performer?.email ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{e.transaction_id ? e.transaction_id.slice(0, 8) : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PageWrapper>
  );
}
