"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSupabaseClient } from "@/lib/supabase";

type AuditRow = {
  id: number;
  created_at: string;
  event_type: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
};

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  stock_adjustment: { label: "Stock Adjustment", color: "bg-amber-100 text-amber-800 border-amber-200" },
};

export default function AuditLogPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);

  const canQuery = useMemo(() => {
    try { getSupabaseClient(); return true; } catch { return false; }
  }, []);

  useEffect(() => {
    if (!canQuery) return;
    const run = async () => {
      setLoading(true);
      try {
        const supabase = getSupabaseClient() as any;
        const { data, error } = await supabase
          .from("audit_log")
          .select("id,created_at,event_type,description,metadata")
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) throw error;
        setRows((data ?? []) as AuditRow[]);
      } finally { setLoading(false); }
    };
    void run();
  }, [canQuery]);

  return (
    <PageWrapper title="Audit Log">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Records of manual stock adjustments and significant operations.
        </p>
        <Button variant="outline" asChild>
          <Link href="/settings">← Back to Settings</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Recent activity (last 200 events)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Timestamp</TableHead>
                  <TableHead className="w-[160px]">Event</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const meta = EVENT_LABELS[r.event_type];
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString("en-GB", {
                          dateStyle: "short",
                          timeStyle: "medium",
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge className={meta?.color ?? "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-100"}>
                          {meta?.label ?? r.event_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{r.description ?? "—"}</TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                      {loading ? "Loading…" : "No audit events recorded yet."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
