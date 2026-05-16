"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseClient } from "@/lib/supabase";
import { cn, formatCurrency } from "@/lib/utils";

type Client = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  tax_id: string | null;
  address: string | null;
  notes: string | null;
};

type Tx = {
  id: string;
  date: string;
  type: "BUY" | "SELL";
  invoice_number: string | null;
  weight_grams: number | null;
  rate_per_gram: number | null;
  amount_thb: number | null;
};

function monthKey(dateIso: string) {
  const d = new Date(dateIso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const editSchema = z.object({
  name: z.string().min(1, "Name is required"),
  tax_id: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  notes: z.string().optional(),
});
type EditValues = z.output<typeof editSchema>;

export default function ClientDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [tx, setTx] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const canQuery = useMemo(() => {
    try {
      getSupabaseClient();
      return true;
    } catch {
      return false;
    }
  }, []);

  const editForm = useForm<EditValues>({
    resolver: zodResolver(editSchema) as any,
    defaultValues: {
      name: "",
      tax_id: "",
      address: "",
      phone: "",
      email: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (!canQuery) return;
    const run = async () => {
      setLoading(true);
      try {
        const supabase = getSupabaseClient() as any;
        const { data: c, error: cErr } = await supabase
          .from("clients")
          .select("id,name,phone,email,tax_id,address,notes")
          .eq("id", params.id)
          .single();
        if (cErr) throw cErr;
        setClient(c as Client);
        editForm.reset({
          name: c.name ?? "",
          tax_id: c.tax_id ?? "",
          address: c.address ?? "",
          phone: c.phone ?? "",
          email: c.email ?? "",
          notes: c.notes ?? "",
        });

        const { data: t, error: tErr } = await supabase
          .from("transactions")
          .select("id,date,type,invoice_number,weight_grams,rate_per_gram,amount_thb")
          .eq("client_id", params.id)
          .order("date", { ascending: false })
          .order("id", { ascending: false })
          .limit(5000);
        if (tErr) throw tErr;
        setTx((t ?? []) as Tx[]);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [canQuery, params.id, editForm]);

  const stats = useMemo(() => {
    let buyGrams = 0;
    let sellGrams = 0;
    let buyThb = 0;
    let sellThb = 0;
    let buyRateSum = 0;
    let buyRateCount = 0;
    let sellRateSum = 0;
    let sellRateCount = 0;

    const monthly = new Map<string, { month: string; buy: number; sell: number }>();

    for (const r of tx) {
      const w = typeof r.weight_grams === "number" ? r.weight_grams : 0;
      const a = typeof r.amount_thb === "number" ? r.amount_thb : 0;
      const rate = typeof r.rate_per_gram === "number" ? r.rate_per_gram : null;

      const m = monthKey(r.date);
      const bucket = monthly.get(m) ?? { month: m, buy: 0, sell: 0 };
      if (r.type === "BUY") {
        buyGrams += w;
        buyThb += a;
        bucket.buy += w;
        if (rate !== null) {
          buyRateSum += rate;
          buyRateCount += 1;
        }
      } else {
        sellGrams += w;
        sellThb += a;
        bucket.sell += w;
        if (rate !== null) {
          sellRateSum += rate;
          sellRateCount += 1;
        }
      }
      monthly.set(m, bucket);
    }

    const chart = [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month));
    return {
      buyGrams,
      sellGrams,
      buyThb,
      sellThb,
      avgBuyRate: buyRateCount ? buyRateSum / buyRateCount : 0,
      avgSellRate: sellRateCount ? sellRateSum / sellRateCount : 0,
      chart,
    };
  }, [tx]);

  const onSaveEdit = async (values: EditValues) => {
    setSaving(true);
    try {
      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("clients")
        .update({
          name: values.name.trim(),
          tax_id: values.tax_id?.trim() || null,
          address: values.address?.trim() || null,
          phone: values.phone?.trim() || null,
          email: values.email?.trim() || null,
          notes: values.notes?.trim() || null,
        })
        .eq("id", params.id)
        .select("id,name,phone,email,tax_id,address,notes")
        .single();
      if (error) throw error;
      setClient(data as Client);
      setEditOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageWrapper title={client ? client.name : `Client ${params.id}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {loading ? "Loading..." : ""}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)} disabled={!client}>
            Edit Client
          </Button>
          <Button asChild>
            <Link href={`/transactions/new?client_id=${params.id}`}>
              New Transaction for this Client
            </Link>
          </Button>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Client Info</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 text-sm">
          <div>
            <div className="font-semibold">{client?.name ?? "-"}</div>
            <div className="text-muted-foreground">{client?.address ?? "-"}</div>
            <div className="text-muted-foreground">
              Tax ID: <span className="font-mono">{client?.tax_id ?? "-"}</span>
            </div>
          </div>
          <div className="md:text-right">
            <div>Phone: {client?.phone ?? "-"}</div>
            <div>Email: {client?.email ?? "-"}</div>
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <Card className="lg:col-span-1">
          <CardHeader className="py-4">
            <CardTitle className="text-sm">Total BUY grams</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-2xl font-semibold text-emerald-700">{stats.buyGrams.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">grams</div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader className="py-4">
            <CardTitle className="text-sm">Total SELL grams</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-2xl font-semibold text-amber-700">{stats.sellGrams.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">grams</div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader className="py-4">
            <CardTitle className="text-sm">Total BUY THB</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-2xl font-semibold">{formatCurrency(stats.buyThb, "THB", "th-TH")}</div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader className="py-4">
            <CardTitle className="text-sm">Total SELL THB</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-2xl font-semibold">{formatCurrency(stats.sellThb, "THB", "th-TH")}</div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader className="py-4">
            <CardTitle className="text-sm">Avg Buy Rate</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-2xl font-semibold">{stats.avgBuyRate ? stats.avgBuyRate.toFixed(2) : "—"}</div>
            <div className="text-xs text-muted-foreground">THB/g</div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader className="py-4">
            <CardTitle className="text-sm">Avg Sell Rate</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-2xl font-semibold">{stats.avgSellRate ? stats.avgSellRate.toFixed(2) : "—"}</div>
            <div className="text-xs text-muted-foreground">THB/g</div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Buy/Sell volume by month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="buy" name="BUY (g)" fill="#16a34a" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="sell" name="SELL (g)" fill="#B8860B" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Transaction history</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Date</TableHead>
                    <TableHead className="w-[110px]">Type</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tx.map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/transactions/${r.id}`)}
                    >
                      <TableCell className="font-medium">{r.date}</TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            r.type === "BUY"
                              ? "bg-emerald-600 text-white hover:bg-emerald-600"
                              : "bg-amber-600 text-white hover:bg-amber-600"
                          )}
                        >
                          {r.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.invoice_number ?? "-"}</TableCell>
                      <TableCell className="text-right">
                        {typeof r.weight_grams === "number" ? r.weight_grams.toLocaleString() : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {typeof r.rate_per_gram === "number" ? r.rate_per_gram.toLocaleString() : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {typeof r.amount_thb === "number"
                          ? formatCurrency(r.amount_thb, "THB", "th-TH")
                          : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {tx.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center">
                        {loading ? "Loading..." : "No transactions found."}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit client</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onSaveEdit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={editForm.control}
                  name="tax_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tax ID</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={editForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div />
              </div>

              <FormField
                control={editForm.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save changes"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}

