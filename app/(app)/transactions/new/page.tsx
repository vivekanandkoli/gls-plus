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
import { useAppUser } from "@/hooks/use-app-user";

type Book = "official" | "unofficial";
type PaymentMode = "bank" | "qr" | "cheque" | "cash";
type ClientRow = { id: string; name: string };

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: "bank", label: "Bank" },
  { value: "qr", label: "QR" },
  { value: "cheque", label: "Cheque" },
  { value: "cash", label: "Cash" },
];

const schema = z.object({
  book: z.enum(["official", "unofficial"]),
  type: z.enum(["BUY", "SELL"]),
  date: z.date(),
  clientId: z.string().min(1, "Client is required"),
  weightGrams: z.coerce.number().gt(0, "Weight must be > 0"),
  ratePerGram: z.coerce.number().gt(0, "Rate must be > 0"),
  paymentMode: z.enum(["bank", "qr", "cheque", "cash"]),
  vatPercent: z.coerce.number().min(0, "VAT cannot be negative"),
  notes: z.string().optional(),
});

type FormValues = z.output<typeof schema>;

type WacState = { wac: number; stockGm: number; stockValueThb: number };
type WacByBook = { official: WacState; unofficial: WacState };

export default function NewTransactionPage() {
  const router = useRouter();
  const { isAdmin } = useAppUser();

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
  const [error, setError] = useState<string | null>(null);

  const [wac, setWac] = useState<WacByBook | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      book: "official",
      type: "BUY",
      date: new Date(),
      clientId: "",
      weightGrams: 0,
      ratePerGram: 0,
      paymentMode: "bank",
      vatPercent: 0,
      notes: "",
    },
    mode: "onChange",
  });

  const book = form.watch("book");
  const type = form.watch("type");
  const weight = form.watch("weightGrams");
  const rate = form.watch("ratePerGram");
  const vat = form.watch("vatPercent");
  const isUnofficial = book === "unofficial";

  // Unofficial is cash-only; force it whenever the book flips to unofficial.
  useEffect(() => {
    if (isUnofficial) form.setValue("paymentMode", "cash");
  }, [isUnofficial, form]);

  // Non-admins can only use the official book.
  useEffect(() => {
    if (!isAdmin && book === "unofficial") form.setValue("book", "official");
  }, [isAdmin, book, form]);

  // Live per-book WAC for the SELL preview.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/inventory/wac");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setWac(data as WacByBook);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const amount = useMemo(() => {
    const w = Number.isFinite(weight) ? weight : 0;
    const r = Number.isFinite(rate) ? rate : 0;
    return w > 0 && r > 0 ? w * r : 0;
  }, [weight, rate]);

  const totalWithVat = useMemo(() => {
    const v = isUnofficial ? 0 : Number.isFinite(vat) ? vat : 0;
    return amount * (1 + v / 100);
  }, [amount, vat, isUnofficial]);

  const bookWac = wac ? wac[book] : null;

  useEffect(() => {
    const run = async () => {
      setLoadingClients(true);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabase = getSupabaseClient() as any;
        let q = supabase.from("clients").select("id,name").order("name");
        if (clientSearch.trim()) q = q.ilike("name", `%${clientSearch.trim()}%`);
        const { data } = await q.limit(50);
        setClients((data ?? []) as ClientRow[]);
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
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add client");
      const client = data.client as ClientRow;
      setClients((prev) => [client, ...prev.filter((c) => c.id !== client.id)]);
      form.setValue("clientId", client.id, { shouldValidate: true });
      setAddClientOpen(false);
      setNewClientName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add client");
    } finally {
      setSavingClient(false);
    }
  }

  async function submitNow(values: FormValues) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          book: values.book,
          type: values.type,
          date: format(values.date, "yyyy-MM-dd"),
          clientId: values.clientId,
          weightGrams: values.weightGrams,
          ratePerGram: values.ratePerGram,
          paymentMode: values.book === "unofficial" ? "cash" : values.paymentMode,
          vatPercent: values.book === "official" ? values.vatPercent : null,
          notes: values.notes?.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Create failed");
      router.push(`/transactions?book=${values.book}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
      setPendingValues(null);
    }
  }

  return (
    <PageWrapper
      title="New transaction"
      description="Record a buy or sell in the official (tax) or unofficial (vault) book."
    >
      <div
        className={cn(
          "rounded-lg border bg-card p-6 text-card-foreground transition-colors",
          isUnofficial ? "border-dashed border-amber-400 bg-amber-50/40 dark:bg-amber-950/10" : "border-border"
        )}
      >
        {isUnofficial && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-100/70 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <span className="text-base">🔒</span>
            <span>
              Unofficial book — real vault. Cash only, <strong>excluded</strong> from tax/audit reports.
            </span>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
            {error}
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
            {/* Book toggle — unofficial admin-only */}
            <FormField
              control={form.control}
              name="book"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Book</FormLabel>
                  <FormControl>
                    <ToggleGroup
                      type="single"
                      value={field.value}
                      onValueChange={(v) => v && field.onChange(v)}
                      className="grid grid-cols-2 max-w-md"
                    >
                      <ToggleGroupItem
                        value="official"
                        className={cn(
                          "py-3 text-sm font-medium",
                          field.value === "official" ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border"
                        )}
                      >
                        Official (tax)
                      </ToggleGroupItem>
                      <ToggleGroupItem
                        value="unofficial"
                        disabled={!isAdmin}
                        className={cn(
                          "py-3 text-sm font-medium",
                          field.value === "unofficial" ? "bg-amber-600 text-white hover:bg-amber-600" : "border",
                          !isAdmin && "opacity-50"
                        )}
                      >
                        🔒 Unofficial (vault)
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Type */}
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
                          field.value === "BUY" ? "bg-emerald-600 text-white hover:bg-emerald-600" : "border"
                        )}
                      >
                        BUY
                      </ToggleGroupItem>
                      <ToggleGroupItem
                        value="SELL"
                        className={cn(
                          "py-6 text-base font-semibold",
                          field.value === "SELL" ? "bg-amber-600 text-white hover:bg-amber-600" : "border"
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
                        <Calendar mode="single" selected={field.value} onSelect={(d) => d && field.onChange(d)} initialFocus />
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
                          <CommandInput placeholder="Search client..." value={clientSearch} onValueChange={setClientSearch} />
                          <CommandList>
                            <CommandEmpty>{loadingClients ? "Loading..." : "No clients found."}</CommandEmpty>
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
                        placeholder="0.000"
                        value={String(field.value ?? "")}
                        onChange={(e) => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))}
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
                        onChange={(e) => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))}
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
                  {!isUnofficial && vat > 0 ? (
                    <span className="ml-2 text-muted-foreground">
                      (with VAT: {formatCurrency(totalWithVat, "THB", "th-TH")})
                    </span>
                  ) : null}
                </div>
              </FormItem>
            </div>

            {/* Payment mode — official only (unofficial forced to cash) */}
            {!isUnofficial && (
              <FormField
                control={form.control}
                name="paymentMode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment mode</FormLabel>
                    <FormControl>
                      <ToggleGroup
                        type="single"
                        value={field.value}
                        onValueChange={(v) => v && field.onChange(v)}
                        className="grid grid-cols-4 max-w-md"
                      >
                        {PAYMENT_MODES.map((m) => (
                          <ToggleGroupItem
                            key={m.value}
                            value={m.value}
                            className={cn(
                              "py-2 text-sm",
                              field.value === m.value ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border"
                            )}
                          >
                            {m.label}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {type === "SELL" && (
              <SellPlPreviewCard
                weightGrams={Number.isFinite(weight) ? weight : 0}
                ratePerGram={Number.isFinite(rate) ? rate : 0}
                currentWac={bookWac?.wac ?? 0}
                stockGm={bookWac?.stockGm ?? 0}
                loading={!wac}
              />
            )}

            {!isUnofficial && (
              <FormField
                control={form.control}
                name="vatPercent"
                render={({ field }) => (
                  <FormItem className="max-w-xs">
                    <FormLabel>VAT %</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="decimal"
                        value={String(field.value ?? 0)}
                        onChange={(e) => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Optional..." value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <span>Invoice number is assigned automatically on save —</span>
              <span className="font-mono">
                {isUnofficial ? "PV-…" : type === "BUY" ? "IV-…" : "UP-…"}
              </span>
            </div>

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
            <div className="text-sm text-muted-foreground">Client will be created (or reused) by name.</div>
            <Input value={newClientName} onChange={(e) => setNewClientName(e.target.value)} placeholder="Client name" />
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
              Book: <span className="font-semibold capitalize">{pendingValues?.book ?? book}</span>
            </div>
            <div>
              Type: <span className="font-semibold">{pendingValues?.type ?? type}</span>
            </div>
            <div>
              Date: <span className="font-semibold">{pendingValues?.date ? format(pendingValues.date, "PPP") : "-"}</span>
            </div>
            <div>
              Amount: <span className="font-semibold">{formatCurrency(amount, "THB", "th-TH")}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => pendingValues && submitNow(pendingValues)} disabled={!pendingValues || submitting}>
              {submitting ? "Submitting..." : "Confirm & Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
