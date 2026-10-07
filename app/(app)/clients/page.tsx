"use client";

import Link from "next/link";
import { Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSupabaseClient } from "@/lib/supabase";
import { formatSupabaseQueryError } from "@/lib/supabase-errors";
import { cn } from "@/lib/utils";

type ClientRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  tax_id: string | null;
};

type SortKey = "name" | "phone" | "email" | "tax_id" | "buy" | "sell" | "last";

type TxLite = {
  client_id: string;
  type: "BUY" | "SELL";
  weight_grams: number | null;
  date: string;
};

export default function ClientsPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [txByClient, setTxByClient] = useState<
    Record<
      string,
      {
        buyGrams: number;
        sellGrams: number;
        lastDate: string | null;
      }
    >
  >({});

  const canQuery = useMemo(() => {
    try {
      getSupabaseClient();
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!canQuery) return;

    const run = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const supabase = getSupabaseClient() as any;
        let query = supabase.from("clients").select("id,name,phone,email,tax_id").order("name");
        if (q.trim()) query = query.ilike("name", `%${q.trim()}%`);
        const { data, error } = await query.limit(200);
        if (error) throw error;

        const list = (data ?? []) as ClientRow[];
        setClients(list);

        const ids = list.map((c) => c.id);
        if (ids.length === 0) {
          setTxByClient({});
          return;
        }

        const { data: tx, error: txErr } = await supabase
          .from("transactions")
          .select("client_id,type,weight_grams,date")
          .in("client_id", ids)
          .order("date", { ascending: false })
          .limit(5000);
        if (txErr) throw txErr;

        const agg: Record<
          string,
          { buyGrams: number; sellGrams: number; lastDate: string | null }
        > = {};
        for (const r of (tx ?? []) as TxLite[]) {
          const w = typeof r.weight_grams === "number" ? r.weight_grams : 0;
          const cur = agg[r.client_id] ?? { buyGrams: 0, sellGrams: 0, lastDate: null };
          if (!cur.lastDate) cur.lastDate = r.date;
          if (r.type === "BUY") cur.buyGrams += w;
          if (r.type === "SELL") cur.sellGrams += w;
          agg[r.client_id] = cur;
        }
        setTxByClient(agg);
      } catch (e) {
        console.error(e);
        setLoadError(formatSupabaseQueryError(e));
        setClients([]);
        setTxByClient({});
      } finally {
        setLoading(false);
      }
    };

    const t = setTimeout(() => void run(), 250);
    return () => clearTimeout(t);
  }, [canQuery, q]);

  async function handleDelete(c: ClientRow) {
    if (typeof window !== "undefined" && !window.confirm(`Delete client "${c.name}"? This cannot be undone.`)) {
      return;
    }
    setDeletingId(c.id);
    setActionError(null);
    try {
      const res = await fetch(`/api/clients/${c.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Failed to delete client");
      setClients((prev) => prev.filter((x) => x.id !== c.id));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to delete client");
    } finally {
      setDeletingId(null);
    }
  }

  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function toggleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir("asc");
    }
  }
  const sortArrow = (k: SortKey) => (sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : "");

  const sortedClients = useMemo(() => {
    const aggOf = (id: string) => txByClient[id] ?? { buyGrams: 0, sellGrams: 0, lastDate: null };
    const cmpStr = (a: string | null, b: string | null) => {
      const x = (a ?? "").toLowerCase();
      const y = (b ?? "").toLowerCase();
      // Empty values always sort last, regardless of direction, so blanks cluster.
      if (!x && y) return 1;
      if (x && !y) return -1;
      if (x === y) return 0;
      return (x < y ? -1 : 1) * (sortDir === "asc" ? 1 : -1);
    };
    const cmpNum = (a: number, b: number) => (a - b) * (sortDir === "asc" ? 1 : -1);
    const arr = [...clients];
    arr.sort((a, b) => {
      switch (sortKey) {
        case "name": return cmpStr(a.name, b.name);
        case "phone": return cmpStr(a.phone, b.phone);
        case "email": return cmpStr(a.email, b.email);
        case "tax_id": return cmpStr(a.tax_id, b.tax_id);
        case "buy": return cmpNum(aggOf(a.id).buyGrams, aggOf(b.id).buyGrams);
        case "sell": return cmpNum(aggOf(a.id).sellGrams, aggOf(b.id).sellGrams);
        case "last": return cmpStr(aggOf(a.id).lastDate, aggOf(b.id).lastDate);
        default: return 0;
      }
    });
    return arr;
  }, [clients, txByClient, sortKey, sortDir]);

  return (
    <PageWrapper
      title="Clients"
      description="Directory of buyers and sellers you trade with."
    >
      {loadError ? (
        <div
          className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {loadError}
        </div>
      ) : null}
      {actionError ? (
        <div
          className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {actionError}
        </div>
      ) : null}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search client name..."
            className="w-full md:w-80"
          />
          <div className="text-sm text-muted-foreground">
            {loading ? "Loading..." : `${clients.length} clients`}
          </div>
        </div>
        <Button asChild>
          <Link href="/clients/new">Add Client</Link>
        </Button>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
            Loading clients…
          </div>
        ) : clients.length === 0 ? (
          <EmptyState
            icon={<Users className="h-5 w-5" aria-hidden />}
            title={q.trim() ? "No matching clients" : "No clients yet"}
            description={
              q.trim()
                ? "Try a different search or clear the filter."
                : "Add your first client to link transactions, invoices, and reports."
            }
            action={
              q.trim() ? (
                <Button type="button" variant="outline" onClick={() => setQ("")}>
                  Clear search
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/clients/new">Add client</Link>
                </Button>
              )
            }
          />
        ) : (
          <>
          {/* Mobile: tap-friendly client list */}
          <div className="md:hidden rounded-xl border bg-card shadow-[var(--shadow-sm)]" style={{ borderColor: "var(--border)" }}>
            <ul className="divide-y px-4" style={{ borderColor: "var(--border)" }}>
              {sortedClients.map((c) => {
                const agg = txByClient[c.id] ?? { buyGrams: 0, sellGrams: 0, lastDate: null };
                return (
                  <li key={c.id} className="flex items-center gap-2">
                    <button
                      onClick={() => router.push(`/clients/${c.id}`)}
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 py-3 text-left active:bg-muted/50"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">{c.name}</div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          Tax ID: {c.tax_id || "-"}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {c.phone || c.email || "No contact info"}
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-[11px]">
                          <span className="text-emerald-600">BUY {agg.buyGrams.toLocaleString()}g</span>
                          <span className="text-amber-700">SELL {agg.sellGrams.toLocaleString()}g</span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-[11px] text-muted-foreground">
                        {agg.lastDate ?? "—"}
                      </div>
                    </button>
                    {!agg.lastDate ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 text-destructive hover:text-destructive"
                        disabled={deletingId === c.id}
                        onClick={() => void handleDelete(c)}
                      >
                        {deletingId === c.id ? "…" : "Delete"}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Desktop: full table */}
          <div className="hidden md:block rounded-lg border bg-card shadow-[var(--shadow-sm)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("name")}>Name{sortArrow("name")}</TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("tax_id")}>Tax ID{sortArrow("tax_id")}</TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("phone")}>Phone{sortArrow("phone")}</TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("email")}>Email{sortArrow("email")}</TableHead>
                  <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort("buy")}>Total BUY (g){sortArrow("buy")}</TableHead>
                  <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort("sell")}>Total SELL (g){sortArrow("sell")}</TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("last")}>Last Transaction{sortArrow("last")}</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedClients.map((c) => {
                  const agg = txByClient[c.id] ?? { buyGrams: 0, sellGrams: 0, lastDate: null };
                  return (
                    <TableRow
                      key={c.id}
                      className={cn("cursor-pointer")}
                      onClick={() => router.push(`/clients/${c.id}`)}
                    >
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className={cn("font-mono text-xs", !c.tax_id && "text-muted-foreground")}>
                        {c.tax_id || "-"}
                      </TableCell>
                      <TableCell>{c.phone ?? "-"}</TableCell>
                      <TableCell>{c.email ?? "-"}</TableCell>
                      <TableCell className="text-right">
                        {agg.buyGrams.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {agg.sellGrams.toLocaleString()}
                      </TableCell>
                      <TableCell>{agg.lastDate ?? "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/clients/${c.id}`);
                            }}
                          >
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                            disabled={!!agg.lastDate || deletingId === c.id}
                            title={agg.lastDate ? "Has transactions - cannot delete" : "Delete client"}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDelete(c);
                            }}
                          >
                            {deletingId === c.id ? "Deleting…" : "Delete"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          </>
        )}
      </div>
    </PageWrapper>
  );
}

