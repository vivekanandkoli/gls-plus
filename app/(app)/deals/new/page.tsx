"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, formatCurrency } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase";
import { useAppUser } from "@/hooks/use-app-user";

type Book = "official" | "unofficial";
type ClientRow = { id: string; name: string };

function ClientPicker({ label, value, onChange }: { label: string; value: string | null; onChange: (id: string | null, name: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [search, setSearch] = useState("");
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabaseClient() as any;
      let q = supabase.from("clients").select("id,name").order("name");
      if (search.trim()) q = q.ilike("name", `%${search.trim()}%`);
      const { data } = await q.limit(50);
      setClients((data ?? []) as ClientRow[]);
    })();
  }, [open, search]);

  async function addClient() {
    const n = search.trim();
    if (!n) return;
    const res = await fetch("/api/clients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n }) });
    const data = await res.json();
    if (res.ok) { onChange(data.client.id, data.client.name); setName(data.client.name); setOpen(false); }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between">{name ?? (value ? "Selected" : `Select ${label}...`)}</Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${label}...`} value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>No clients found.</CommandEmpty>
            <CommandGroup heading="Clients">
              {clients.map((c) => (
                <CommandItem key={c.id} value={c.name} onSelect={() => { onChange(c.id, c.name); setName(c.name); setOpen(false); }}>{c.name}</CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Actions">
              <CommandItem value="__add__" onSelect={addClient}>+ Add “{search.trim()}”</CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function NewDealPage() {
  const router = useRouter();
  const { isAdmin } = useAppUser();

  const [book, setBook] = useState<Book>("official");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [weight, setWeight] = useState("");
  const [buyClient, setBuyClient] = useState<string | null>(null);
  const [buyRate, setBuyRate] = useState("");
  const [sellClient, setSellClient] = useState<string | null>(null);
  const [sellRate, setSellRate] = useState("");
  const [paymentMode, setPaymentMode] = useState("bank");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (book === "unofficial") setPaymentMode("cash"); }, [book]);
  useEffect(() => { if (!isAdmin && book === "unofficial") setBook("official"); }, [isAdmin, book]);

  const w = Number(weight) || 0;
  const br = Number(buyRate) || 0;
  const sr = Number(sellRate) || 0;
  const buyAmount = useMemo(() => w * br, [w, br]);
  const sellAmount = useMemo(() => w * sr, [w, sr]);
  const profit = useMemo(() => sellAmount - buyAmount, [sellAmount, buyAmount]);
  const isUnofficial = book === "unofficial";

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/transactions/paired", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          book, date, weightGrams: w,
          buyClientId: buyClient, buyRatePerGram: br,
          sellClientId: sellClient, sellRatePerGram: sr,
          paymentMode: isUnofficial ? "cash" : paymentMode,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Create failed");
      router.push(`/deals`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageWrapper title="New deal" description="A paired buy + sell of the same weight — creates two linked transactions.">
      <div className={cn("max-w-3xl space-y-5 rounded-lg border p-5", isUnofficial ? "border-dashed border-amber-400" : "border-border")}>
        {error && <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">{error}</div>}

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Book</label>
            <div className="flex gap-2">
              <button onClick={() => setBook("official")} className={cn("rounded-md border px-3 py-1.5 text-sm", book === "official" ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}>Official</button>
              {isAdmin && <button onClick={() => setBook("unofficial")} className={cn("rounded-md border px-3 py-1.5 text-sm", book === "unofficial" ? "border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" : "border-border hover:bg-muted")}>🔒 Unofficial</button>}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Weight (g)</label>
            <Input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="0" className="w-32" />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
            <div className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-400">Buy side (from wholesaler)</div>
            <div><label className="mb-1 block text-sm">Buy from</label><ClientPicker label="wholesaler" value={buyClient} onChange={(id) => setBuyClient(id)} /></div>
            <div><label className="mb-1 block text-sm">Buy rate (THB/g)</label><Input inputMode="decimal" value={buyRate} onChange={(e) => setBuyRate(e.target.value)} placeholder="0" /></div>
            <div className="text-sm text-muted-foreground">Buy amount: <span className="font-mono">{formatCurrency(buyAmount, "THB", "th-TH")}</span></div>
          </div>
          <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-4 dark:border-amber-900 dark:bg-amber-950/20">
            <div className="text-xs font-semibold uppercase text-amber-700 dark:text-amber-400">Sell side (to customer)</div>
            <div><label className="mb-1 block text-sm">Sell to</label><ClientPicker label="customer" value={sellClient} onChange={(id) => setSellClient(id)} /></div>
            <div><label className="mb-1 block text-sm">Sell rate (THB/g)</label><Input inputMode="decimal" value={sellRate} onChange={(e) => setSellRate(e.target.value)} placeholder="0" /></div>
            <div className="text-sm text-muted-foreground">Sell amount: <span className="font-mono">{formatCurrency(sellAmount, "THB", "th-TH")}</span></div>
          </div>
        </div>

        {!isUnofficial && (
          <div>
            <label className="mb-1 block text-sm font-medium">Payment mode</label>
            <div className="flex gap-2">
              {["bank", "qr", "cheque", "cash"].map((m) => (
                <button key={m} onClick={() => setPaymentMode(m)} className={cn("rounded-md border px-3 py-1.5 text-sm capitalize", paymentMode === m ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}>{m}</button>
              ))}
            </div>
          </div>
        )}

        {w > 0 && br > 0 && sr > 0 && (
          <div className={cn("rounded-lg border-2 p-3", profit >= 0 ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40" : "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40")}>
            <span className="text-sm font-semibold">Spread {formatCurrency(sr - br, "THB", "th-TH")}/g · Deal profit </span>
            <span className={cn("font-mono font-bold", profit >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>{formatCurrency(profit, "THB", "th-TH")}</span>
          </div>
        )}

        <div><label className="mb-1 block text-sm font-medium">Notes</label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></div>

        <div className="flex items-center justify-between">
          <Button variant="outline" asChild><Link href="/deals">Cancel</Link></Button>
          <Button onClick={submit} disabled={busy || !(w > 0 && br > 0 && sr > 0)}>{busy ? "Creating…" : "Create deal"}</Button>
        </div>
      </div>
    </PageWrapper>
  );
}
