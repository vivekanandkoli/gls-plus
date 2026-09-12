"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { CalendarIcon } from "lucide-react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatCurrency } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase";
import { useAppUser } from "@/hooks/use-app-user";
import type { PaymentMode } from "@/lib/deals-service";

type ClientRow = { id: number; name: string };

const PAYMENT_MODES: { value: PaymentMode; label: string; icon: string }[] = [
  { value: "bank", label: "Bank Transfer", icon: "🏦" },
  { value: "qr", label: "QR Code", icon: "📱" },
  { value: "cheque", label: "Cheque", icon: "📄" },
  { value: "cash", label: "Cash", icon: "💵" },
];

const schema = z.object({
  date: z.date(),
  weightGm: z.coerce.number().gt(0, "Weight must be > 0"),
  buyClientId: z.number().nullable(),
  buyRate: z.coerce.number().gt(0, "Buy rate must be > 0"),
  sellClientId: z.number().nullable(),
  sellRate: z.coerce.number().gt(0, "Sell rate must be > 0"),
  paymentMode: z.enum(["cash", "bank", "qr", "cheque"]),
  notes: z.string().optional(),
});

type FormValues = z.output<typeof schema>;

// ── Client selector component ─────────────────────────────────────────────────
function ClientSelector({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [savingClient, setSavingClient] = useState(false);

  const selected = clients.find((c) => c.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const run = async () => {
      try {
        const supabase = getSupabaseClient() as any;
        let q = supabase.from("clients").select("id,name").order("name");
        if (search.trim()) q = q.ilike("name", `%${search.trim()}%`);
        const { data } = await q.limit(50);
        if (!cancelled) setClients((data ?? []) as ClientRow[]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [open, search]);

  async function handleAddClient() {
    const name = newName.trim();
    if (!name) return;
    setSavingClient(true);
    try {
      const supabase = getSupabaseClient() as any;
      const { data } = await supabase
        .from("clients")
        .upsert({ name }, { onConflict: "name" })
        .select("id,name")
        .single();
      setClients((prev) => {
        const next = prev.filter((c) => c.id !== data.id);
        next.unshift(data as ClientRow);
        return next;
      });
      onChange(data.id);
      setAddOpen(false);
      setNewName("");
    } finally {
      setSavingClient(false);
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            {selected?.name ?? `Select ${label}...`}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command>
            <CommandInput
              placeholder={`Search ${label}...`}
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>
                {loading ? "Loading..." : "No clients found."}
              </CommandEmpty>
              <CommandGroup heading="Clients">
                {clients.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={c.name}
                    onSelect={() => { onChange(c.id); setOpen(false); }}
                  >
                    {c.name}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup heading="Actions">
                <CommandItem
                  value="__add_new__"
                  onSelect={() => { setOpen(false); setAddOpen(true); setNewName(search.trim()); }}
                >
                  + Add new client
                </CommandItem>
                {value !== null && (
                  <CommandItem
                    value="__clear__"
                    onSelect={() => { onChange(null); setOpen(false); }}
                  >
                    Clear selection
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add new client</DialogTitle></DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Client name"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddClient} disabled={savingClient || !newName.trim()}>
              {savingClient ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Live profit preview card ──────────────────────────────────────────────────
function ProfitPreview({
  weightGm,
  buyRate,
  sellRate,
}: {
  weightGm: number;
  buyRate: number;
  sellRate: number;
}) {
  const buyAmount = weightGm > 0 && buyRate > 0 ? weightGm * buyRate : 0;
  const sellAmount = weightGm > 0 && sellRate > 0 ? weightGm * sellRate : 0;
  const spread = sellRate - buyRate;
  const profit = sellAmount - buyAmount;
  const profitPct = buyAmount > 0 ? (profit / buyAmount) * 100 : 0;
  const isProfit = profit > 0;
  const isValid = weightGm > 0 && buyRate > 0 && sellRate > 0;

  if (!isValid) return null;

  return (
    <div
      className={cn(
        "rounded-lg border-2 p-4 transition-all",
        isProfit
          ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40"
          : "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40"
      )}
    >
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Deal Preview
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <span className="text-muted-foreground">Spread</span>
        <span className="font-mono font-medium">
          ฿{spread.toLocaleString("th-TH", { minimumFractionDigits: 2 })}/gm
        </span>
        <span className="text-muted-foreground">Buy</span>
        <span className="font-mono">{formatCurrency(buyAmount, "THB", "th-TH")}</span>
        <span className="text-muted-foreground">Sell</span>
        <span className="font-mono">{formatCurrency(sellAmount, "THB", "th-TH")}</span>
        <span className="font-semibold">Profit</span>
        <span
          className={cn(
            "font-mono font-bold",
            isProfit ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
          )}
        >
          {isProfit ? "▲" : "▼"} {formatCurrency(Math.abs(profit), "THB", "th-TH")}{" "}
          <span className="text-xs font-normal">({profitPct.toFixed(2)}%)</span>
        </span>
      </div>
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────
export default function NewDealPage() {
  const router = useRouter();
  const { user: appUser, isAdmin } = useAppUser();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingValues, setPendingValues] = useState<FormValues | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<{ buy: string; sell: string } | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      date: new Date(),
      weightGm: 0,
      buyClientId: null,
      buyRate: 0,
      sellClientId: null,
      sellRate: 0,
      paymentMode: "bank",
      notes: "",
    },
    mode: "onChange",
  });

  const date = form.watch("date");
  const weightGm = form.watch("weightGm");
  const buyRate = form.watch("buyRate");
  const sellRate = form.watch("sellRate");
  const paymentMode = form.watch("paymentMode");
  const isCash = paymentMode === "cash";

  // Preview invoice numbers
  useEffect(() => {
    if (!date) return;
    const day = format(date, "yyyyMMdd");
    if (isCash) {
      setPreviewInvoice({ buy: `CASH-${day}-NNN`, sell: `CASH-${day}-NNN` });
    } else {
      setPreviewInvoice({ buy: `IV-${day}-NNN`, sell: `UP-${day}-NNN` });
    }
  }, [date, isCash]);

  // Restrict cash mode to admins
  useEffect(() => {
    if (!isAdmin && paymentMode === "cash") {
      form.setValue("paymentMode", "bank");
    }
  }, [isAdmin, paymentMode, form]);

  const buyAmount = useMemo(() => {
    const w = Number.isFinite(weightGm) ? weightGm : 0;
    const r = Number.isFinite(buyRate) ? buyRate : 0;
    return w > 0 && r > 0 ? w * r : 0;
  }, [weightGm, buyRate]);

  const sellAmount = useMemo(() => {
    const w = Number.isFinite(weightGm) ? weightGm : 0;
    const r = Number.isFinite(sellRate) ? sellRate : 0;
    return w > 0 && r > 0 ? w * r : 0;
  }, [weightGm, sellRate]);

  async function submitNow(values: FormValues) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: format(values.date, "yyyy-MM-dd"),
          weightGm: values.weightGm,
          buyClientId: values.buyClientId,
          buyRate: values.buyRate,
          sellClientId: values.sellClientId,
          sellRate: values.sellRate,
          paymentMode: values.paymentMode,
          notes: values.notes?.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Create failed");

      router.push("/deals");
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
      setPendingValues(null);
    }
  }

  return (
    <PageWrapper
      title="New Deal"
      description="Record one buy + sell pair. The buy rate is private and never appears on invoices."
    >
      <div
        className={cn(
          "rounded-lg border bg-card p-6 text-card-foreground",
          isCash
            ? "border-dashed border-zinc-400 bg-zinc-50 dark:bg-zinc-900/30"
            : "border-amber-200 dark:border-amber-800"
        )}
      >
        {isCash && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-zinc-300 bg-zinc-100 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
            <span className="text-base">💰</span>
            <span>
              Cash deal - will <strong>not</strong> appear in official statements, CA reports,
              or WAC calculations.
            </span>
          </div>
        )}

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => {
              setPendingValues(values);
              setConfirmOpen(true);
            })}
            className="space-y-6"
          >
            {/* ── Date ── */}
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-48 justify-start text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {field.value ? format(field.value, "PPP") : "Pick a date"}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ── Weight ── */}
            <FormField
              control={form.control}
              name="weightGm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Weight (grams)</FormLabel>
                  <FormControl>
                    <Input
                      className="w-48"
                      inputMode="decimal"
                      placeholder="0.000"
                      value={String(field.value ?? "")}
                      onChange={(e) => {
                        const v = e.target.value;
                        field.onChange(v === "" ? 0 : Number(v));
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-6 md:grid-cols-2">
              {/* ── Buy side ── */}
              <div className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
                <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  Buy Side (Wholesaler)
                </div>

                <FormField
                  control={form.control}
                  name="buyClientId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Buy From (Wholesaler)</FormLabel>
                      <ClientSelector
                        label="Wholesaler"
                        value={field.value}
                        onChange={(id) => field.onChange(id)}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="buyRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Buy Rate (THB/gm) - private</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="decimal"
                          placeholder="0.00"
                          value={String(field.value ?? "")}
                          onChange={(e) => {
                            const v = e.target.value;
                            field.onChange(v === "" ? 0 : Number(v));
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div>
                  <div className="text-xs text-muted-foreground mb-1">Buy Amount</div>
                  <div className="rounded-md border bg-muted px-3 py-2 text-sm font-mono">
                    {formatCurrency(buyAmount, "THB", "th-TH")}
                  </div>
                </div>
              </div>

              {/* ── Sell side ── */}
              <div className="space-y-4 rounded-lg border border-amber-200 bg-amber-50/40 p-4 dark:border-amber-900 dark:bg-amber-950/20">
                <div className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  Sell Side (Customer)
                </div>

                <FormField
                  control={form.control}
                  name="sellClientId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sell To (Customer)</FormLabel>
                      <ClientSelector
                        label="Customer"
                        value={field.value}
                        onChange={(id) => field.onChange(id)}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="sellRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sell Rate (THB/gm)</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="decimal"
                          placeholder="0.00"
                          value={String(field.value ?? "")}
                          onChange={(e) => {
                            const v = e.target.value;
                            field.onChange(v === "" ? 0 : Number(v));
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div>
                  <div className="text-xs text-muted-foreground mb-1">Sell Amount</div>
                  <div className="rounded-md border bg-muted px-3 py-2 text-sm font-mono">
                    {formatCurrency(sellAmount, "THB", "th-TH")}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Live profit preview ── */}
            <ProfitPreview
              weightGm={Number.isFinite(weightGm) ? weightGm : 0}
              buyRate={Number.isFinite(buyRate) ? buyRate : 0}
              sellRate={Number.isFinite(sellRate) ? sellRate : 0}
            />

            {/* ── Payment mode ── */}
            <FormField
              control={form.control}
              name="paymentMode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Mode</FormLabel>
                  <div className="flex flex-wrap gap-2">
                    {PAYMENT_MODES.filter((m) => isAdmin || m.value !== "cash").map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => field.onChange(m.value)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-all",
                          field.value === m.value
                            ? "border-primary bg-primary text-primary-foreground shadow-sm"
                            : "border-border bg-background text-muted-foreground hover:border-primary/50"
                        )}
                      >
                        <span>{m.icon}</span>
                        <span>{m.label}</span>
                      </button>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ── Invoice preview ── */}
            {previewInvoice && (
              <div className="flex flex-wrap gap-3 text-xs">
                <div className="flex items-center gap-1.5 rounded border bg-muted px-2 py-1">
                  <span className="text-muted-foreground">Buy Invoice:</span>
                  <span className="font-mono font-medium">{previewInvoice.buy}</span>
                </div>
                {!isCash && (
                  <div className="flex items-center gap-1.5 rounded border bg-muted px-2 py-1">
                    <span className="text-muted-foreground">Sell Invoice:</span>
                    <span className="font-mono font-medium">{previewInvoice.sell}</span>
                  </div>
                )}
              </div>
            )}

            {/* ── Notes ── */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Optional notes..."
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" asChild>
                <Link href="/deals">Cancel</Link>
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : "Create Deal"}
              </Button>
            </div>
          </form>
        </Form>
      </div>

      {/* ── Confirm dialog ── */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deal</DialogTitle>
          </DialogHeader>
          {pendingValues && (
            <div className="space-y-2 text-sm">
              <div>
                Date:{" "}
                <span className="font-semibold">{format(pendingValues.date, "PPP")}</span>
              </div>
              <div>
                Weight: <span className="font-semibold">{pendingValues.weightGm} gm</span>
              </div>
              <div>
                Buy Rate:{" "}
                <span className="font-semibold font-mono">
                  ฿{pendingValues.buyRate.toLocaleString()}
                </span>
              </div>
              <div>
                Sell Rate:{" "}
                <span className="font-semibold font-mono">
                  ฿{pendingValues.sellRate.toLocaleString()}
                </span>
              </div>
              <div>
                Profit:{" "}
                <span className="font-semibold font-mono">
                  {formatCurrency(sellAmount - buyAmount, "THB", "th-TH")}
                </span>
              </div>
              <div>
                Payment:{" "}
                <span className="font-semibold capitalize">{pendingValues.paymentMode}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => pendingValues && submitNow(pendingValues)}
              disabled={!pendingValues || submitting}
            >
              {submitting ? "Submitting..." : "Confirm & Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
