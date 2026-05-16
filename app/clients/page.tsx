"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

type ClientRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

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
  const [clients, setClients] = useState<ClientRow[]>([]);
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
      try {
        const supabase = getSupabaseClient() as any;
        let query = supabase.from("clients").select("id,name,phone,email").order("name");
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
      } finally {
        setLoading(false);
      }
    };

    const t = setTimeout(() => void run(), 250);
    return () => clearTimeout(t);
  }, [canQuery, q]);

  return (
    <PageWrapper title="Clients">
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

      <div className="mt-4 rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="text-right">Total BUY (g)</TableHead>
              <TableHead className="text-right">Total SELL (g)</TableHead>
              <TableHead>Last Transaction</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((c) => {
              const agg = txByClient[c.id] ?? { buyGrams: 0, sellGrams: 0, lastDate: null };
              return (
                <TableRow
                  key={c.id}
                  className={cn("cursor-pointer")}
                  onClick={() => router.push(`/clients/${c.id}`)}
                >
                  <TableCell className="font-medium">{c.name}</TableCell>
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
                  </TableCell>
                </TableRow>
              );
            })}
            {clients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center">
                  {loading ? "Loading..." : "No clients found."}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </PageWrapper>
  );
}

