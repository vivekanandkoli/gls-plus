"use client";

import { useCallback, useEffect, useState } from "react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAppUser } from "@/hooks/use-app-user";

type LogEntry = {
  id: number;
  timestamp: string;
  action: string;
  transaction_id: string | null;
  performed_by: number | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
};

export default function ActivityLogPage() {
  const { isAdmin, loading: authLoading } = useAppUser();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/activity-log?limit=200");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setEntries(data.entries ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  if (authLoading) {
    return (
      <PageWrapper title="Activity log">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </PageWrapper>
    );
  }

  if (!isAdmin) {
    return (
      <PageWrapper title="Activity log">
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          Admin access required.
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper
      title="Transaction activity log"
      description="Audit trail of creates, edits, approvals, and deletions."
    >
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Transaction</TableHead>
              <TableHead>User ID</TableHead>
              <TableHead>Changes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap">
                  {new Date(e.timestamp).toLocaleString()}
                </TableCell>
                <TableCell className="capitalize">{e.action}</TableCell>
                <TableCell className="font-mono text-xs">
                  {e.transaction_id?.slice(0, 8) ?? "—"}
                </TableCell>
                <TableCell>{e.performed_by ?? "—"}</TableCell>
                <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                  {e.new_values
                    ? JSON.stringify(e.new_values)
                    : e.old_values
                      ? JSON.stringify(e.old_values)
                      : "—"}
                </TableCell>
              </TableRow>
            ))}
            {!loading && entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No activity recorded yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </PageWrapper>
  );
}
