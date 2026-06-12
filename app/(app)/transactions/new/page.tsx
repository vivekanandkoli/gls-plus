"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { SellPlPreviewCard } from "@/components/transactions/TransactionPlDisplay";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn, formatCurrency } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase";
import { useCurrentWac } from "@/hooks/use-current-wac";
import { useAppUser } from "@/hooks/use-app-user";

type TxType = "BUY" | "SELL";
type TxMode = "official" | "cash";
type ClientRow = { id: string; name: string };

const schema = z.object({
  type: z.enum(["BUY", "SELL"]),
  mode: z.enum(["official", "cash"]).default("official"),
  date: z.date(),
  clientId: z.string().min(1, "Client is required"),
  weightGrams: z.coerce.number().gt(0, "Weight must be > 0"),
  ratePerGram: z.coerce.number().gt(0, "Rate must be > 0"),
  vatPercent: z.coerce.number().min(0, "VAT cannot be negative"),
  notes: z.string().optional(),
});

type FormValues = z.output<typeof schema>;

function pad3(n: number) {
  return String(n).padStart(3, "0");
}

function yymmdd(d: Date) {
  return format(d, "yyMMdd");
}

function yyyymmdd(d: Date) {
  return format(d, "yyyyMMdd");
}

async function generateInvoiceNumber(type: TxType, date: Date, mode: TxMode = "official") {
  const supabase = getSupabaseClient() as any;

  if (mode === "cash") {
    // Auto-generate CASH-YYYYMMDD-001 format
    const day = yyyymmdd(date);
    const prefix = `CASH-${day}-`;
    const like = `${prefix}%`;
    const { count } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .ilike("invoice_number", like);
    const seq = ((count as number) ?? 0) + 1;
    return `${prefix}${pad3(seq)}`;
  }

  const prefix = type === "BUY" ? "IV" : "UP";
  const day = yymmdd(date);
  const like = `${prefix}${day}%`;

  const { count, error } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("type", type)
    .ilike("invoice_number", like);
  if (error) throw error;

  const seq = (count ?? 0) + 1;
  return `${prefix}${day}${pad3(seq)}`;
}

export default function NewTransactionPage() {
  const router = useRouter();
  const { user: appUser, isAdmin } = useAppUser();
  const { currentWac, stockGm, loading: wacLoading } = useCurrentWac();

  const [clientsOpen, setClientsOpen] = useState(false);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [loadingClients, setLoadingClients] = useState(false);

  const [addClientOpen, setAddClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [savingClient, setSavingClient] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingValues, setPendingValues] = useState<FormValues | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<string>("");
  const [invoiceDuplicate, setInvoiceDuplicate] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      type: "BUY",
      mode: "official",
      date: new Date(),
      clientId: "",
      weightGrams: 0,
      ratePerGram: 0,
      vatPercent: 0,
      notes: "",
    },
    mode: "onChange",
  });

  const type = form.watch("type");
  const mode = form.watch("mode") as TxMode;
  const date = form.watch("date");
  const weight = form.watch("weightGrams");
  const rate = form.watch("ratePerGram");
  const vat = form.watch("vatPercent");
  const isCash = mode === "cash";

  // Preview auto-generated invoice number and check for duplicates.
  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const preview = await generateInvoiceNumber(type, date, mode);
        if (cancelled) return;
        setPreviewInvoice(preview);
        // Cash invoices are auto-generated and always unique; skip duplicate check.
        if (mode === "cash") { setInvoiceDuplicate(false); return; }
        const supabase = getSupabaseClient() as any;
        const { count } = await supabase
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .eq("invoice_number", preview);
        if (!cancelled) setInvoiceDuplicate((count ?? 0) > 0);
      } catch { /* ignore */ }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [type, date, mode]);

  const amount = useMemo(() => {
    const w = Number.isFinite(weight) ? weight : 0;
    const r = Number.isFinite(rate) ? rate : 0;
    return w > 0 && r > 0 ? w * r : 0;
  }, [weight, rate]);

  const totalWithVat = useMemo(() => {
    const v = Number.isFinite(vat) ? vat : 0;
    return amount * (1 + v / 100);
  }, [amount, vat]);

  useEffect(() => {
    const run = async () => {
      setLoadingClients(true);
      try {
        const supabase = getSupabaseClient() as any;
        let q = supabase.from("clients").select("id,name").order("name");
        if (clientSearch.trim()) {
          q = q.ilike("name", `%${clientSearch.trim()}%`);
        }
        const { data, error } = await q.limit(50);
        if (error) throw error;
        setClients((data ?? []) as ClientRow[]);
      } catch (e) {
        console.warn(e);
      } finally {
        setLoadingClients(false);
      }
    };

    if (clientsOpen) void run();
  }, [clientsOpen, clientSearch]);

  const selectedClient = useMemo(() => {
    const id = form.getValues("clientId");
    return clients.find((c) => c.id === id) ?? null;
  }, [clients, form]);

  async function onCreateClient() {
    const name = newClientName.trim();
    if (!name) return;

    setSavingClient(true);
    try {
      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("clients")
        .upsert({ name }, { onConflict: "name" })
        .select("id,name")
        .single();
      if (error) throw error;

      setClients((prev) => {
        const next = prev.filter((c) => c.id !== data.id);
        next.unshift(data as ClientRow);
        return next;
      });
      form.setValue("clientId", data.id, { shouldValidate: true });
      setAddClientOpen(false);
      setNewClientName("");
    } finally {
      setSavingClient(false);
    }
  }

  async function submitNow(values: FormValues) {
    setSubmitting(true);
    try {
      const txMode = (values.mode ?? "official") as TxMode;
      const invoiceNumber = await generateInvoiceNumber(values.type, values.date, txMode);
      const dateIso = format(values.date, "yyyy-MM-dd");

      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: values.clientId,
          type: values.type,
          date: dateIso,
          invoiceNumber,
          weightGrams: values.weightGrams,
          ratePerGram: values.ratePerGram,
          vatPercent: values.vatPercent,
          notes: values.notes?.trim() || null,
          transactionMode: txMode,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Create failed");
      }

      router.push(`/transactions/${data.transaction.id}`);
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
      setPendingValues(null);
    }
  }

  return (
    <PageWrapper
      title="New transaction"
      description="Record a buy or sell with weight, rate, VAT, and optional client link."
    >
      <div
        className={cn(
          "rounded-lg border bg-card p-6 text-card-foreground transition-colors",
          isCash
            ? "border-dashed border-zinc-400 bg-zinc-50 dark:bg-zinc-900/30"
            : type === "BUY"
            ? "border-emerald-200"
            : "border-amber-200"
        )}
      >
        {/* Cash mode banner */}
        {isCash && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-zinc-300 bg-zinc-100 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
            <span className="text-base">💰</span>
            <span>This transaction will <strong>not</strong> appear in official statements or CA reports.</span>
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
            {/* Cash / Official mode toggle — admin only */}
            {isAdmin && (
              <FormField
                control={form.control}
                name="mode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">Transaction Mode (Admin)</FormLabel>
                    <FormControl>
                      <ToggleGroup
                        type="single"
                        value={field.value}
                        onValueChange={(v) => v && field.onChange(v)}
                        className="grid grid-cols-2 max-w-xs"
                      >
                        <ToggleGroupItem
                          value="official"
                          className={cn(
                            "py-2 text-sm font-medium",
                            field.value === "official"
                              ? "bg-primary text-primary-foreground hover:bg-primary/90"
                              : "border"
                          )}
                        >
                          Official
                        </ToggleGroupItem>
                        <ToggleGroupItem
                          value="cash"
                          className={cn(
                            "py-2 text-sm font-medium",
                            field.value === "cash"
                              ? "bg-zinc-600 text-white hover:bg-zinc-600"
                              : "border"
                          )}
                        >
                          💰 Cash
                        </ToggleGroupItem>
                      </ToggleGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Transaction Type</FormLabel>
                  <FormControl>
                    <ToggleGroup
                      type="single"
                      value={field.value}
                      onValueChange={(v) => v && field.onChange(v)}
                      className="grid grid-cols-2"
                    >
                      <ToggleGroupItem
                        value="BUY"
                        className={cn(
                          "py-6 text-base font-semibold",
                          field.value === "BUY"
                            ? "bg-emerald-600 text-white hover:bg-emerald-600"
                            : "border"
                        )}
                      >
                        BUY
                      </ToggleGroupItem>
                      <ToggleGroupItem
                        value="SELL"
                        className={cn(
                          "py-6 text-base font-semibold",
                          field.value === "SELL"
                            ? "bg-amber-600 text-white hover:bg-amber-600"
                            : "border"
                        )}
                      >
                        SELL
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="justify-start">
                          {field.value ? format(field.value, "PPP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={(d) => d && field.onChange(d)}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Client</FormLabel>
                    <Popover open={clientsOpen} onOpenChange={setClientsOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="justify-between">
                          {selectedClient?.name ?? "Select client..."}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0" align="start">
                        <Command>
                          <CommandInput
                            placeholder="Search client..."
                            value={clientSearch}
                            onValueChange={setClientSearch}
                          />
                          <CommandList>
                            <CommandEmpty>
                              {loadingClients ? "Loading..." : "No clients found."}
                            </CommandEmpty>
                            <CommandGroup heading="Clients">
                              {clients.map((c) => (
                                <CommandItem
                                  key={c.id}
                                  value={c.name}
                                  onSelect={() => {
                                    field.onChange(c.id);
                                    setClientsOpen(false);
                                  }}
                                >
                                  {c.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                            <CommandGroup heading="Actions">
                              <CommandItem
                                value="__add_new__"
                                onSelect={() => {
                                  setClientsOpen(false);
                                  setAddClientOpen(true);
                                  setNewClientName(clientSearch.trim());
                                }}
                              >
                                + Add new client
                              </CommandItem>
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="weightGrams"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Weight (grams)</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="decimal"
                        placeholder="0.0000"
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

              <FormField
                control={form.control}
                name="ratePerGram"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rate per gram (THB)</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="decimal"
                        placeholder="0"
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

              <FormItem>
                <FormLabel>Amount THB</FormLabel>
                <div className="rounded-md border bg-muted px-3 py-2 text-sm">
                  {formatCurrency(amount, "THB", "th-TH")}
                  {vat > 0 ? (
                    <span className="ml-2 text-muted-foreground">
                      (with VAT: {formatCurrency(totalWithVat, "THB", "th-TH")})
                    </span>
                  ) : null}
                </div>
              </FormItem>
            </div>

            {type === "SELL" && (
              <SellPlPreviewCard
                weightGrams={Number.isFinite(weight) ? weight : 0}
                ratePerGram={Number.isFinite(rate) ? rate : 0}
                currentWac={currentWac}
                stockGm={stockGm}
                loading={wacLoading}
              />
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="vatPercent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>VAT %</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="decimal"
                        value={String(field.value ?? 0)}
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
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Optional..."
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {previewInvoice && (
              <div className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-2 text-xs",
                isCash
                  ? "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                  : invoiceDuplicate
                  ? "border-amber-300 bg-amber-50 text-amber-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
              )}>
                <span className="font-medium">Invoice #:</span>
                <span className="font-mono">{previewInvoice}</span>
                {isCash && (
                  <span className="ml-1 text-zinc-500">(auto-generated)</span>
                )}
                {!isCash && invoiceDuplicate && (
                  <span className="ml-1 font-semibold text-amber-700">
                    ⚠ This invoice number already exists — a new sequence number will be generated on save.
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" asChild>
                <Link href="/transactions">Cancel</Link>
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : "Create transaction"}
              </Button>
            </div>
          </form>
        </Form>
      </div>

      <Dialog open={addClientOpen} onOpenChange={setAddClientOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add new client</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              Client will be created (or reused) by name.
            </div>
            <Input
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              placeholder="Client name"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddClientOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onCreateClient} disabled={savingClient || !newClientName.trim()}>
              {savingClient ? "Saving..." : "Save client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div>
              Type:{" "}
              <span className="font-semibold">{pendingValues?.type ?? type}</span>
            </div>
            <div>
              Date:{" "}
              <span className="font-semibold">
                {pendingValues?.date ? format(pendingValues.date, "PPP") : "-"}
              </span>
            </div>
            <div>
              Amount: <span className="font-semibold">{formatCurrency(amount, "THB", "th-TH")}</span>
            </div>
          </div>
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

