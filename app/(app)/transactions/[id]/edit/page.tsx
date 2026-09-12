"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
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
import { useCurrentWac } from "@/hooks/use-current-wac";
import type { TransactionStatus } from "@/lib/rbac";

type ClientRow = { id: string; name: string };

const schema = z.object({
  type: z.enum(["BUY", "SELL"]),
  date: z.date(),
  clientId: z.string().min(1, "Client is required"),
  weightGrams: z.coerce.number().gt(0, "Weight must be > 0"),
  ratePerGram: z.coerce.number().gt(0, "Rate must be > 0"),
  vatPercent: z.coerce.number().min(0, "VAT cannot be negative"),
  notes: z.string().optional(),
});

type FormValues = z.output<typeof schema>;

export default function EditTransactionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, isAdmin, loading: authLoading } = useAppUser();
  const { currentWac, stockGm, loading: wacLoading } = useCurrentWac();

  const [clientsOpen, setClientsOpen] = useState(false);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [loadingClients, setLoadingClients] = useState(false);

  const [loadingTx, setLoadingTx] = useState(true);
  const [invoiceNumber, setInvoiceNumber] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<TransactionStatus>("pending");

  // Admin invoice edit state
  const [invoiceEditing, setInvoiceEditing] = useState(false);
  const [invoiceDraft, setInvoiceDraft] = useState("");
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [invoiceSuccess, setInvoiceSuccess] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      type: "BUY",
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
  const weight = form.watch("weightGrams");
  const rate = form.watch("ratePerGram");
  const vat = form.watch("vatPercent");

  const amount = useMemo(() => {
    const w = Number.isFinite(weight) ? weight : 0;
    const r = Number.isFinite(rate) ? rate : 0;
    return w > 0 && r > 0 ? w * r : 0;
  }, [weight, rate]);

  const totalWithVat = useMemo(() => {
    const v = Number.isFinite(vat) ? vat : 0;
    return amount * (1 + v / 100);
  }, [amount, vat]);

  // Load existing transaction on mount.
  useEffect(() => {
    if (authLoading) return;
    const run = async () => {
      setLoadingTx(true);
      try {
        const supabase = getSupabaseClient() as any;
        const { data, error } = await supabase
          .from("transactions")
          .select(
            "id,date,type,invoice_number,weight_grams,rate_per_gram,amount_thb,vat_percent,notes,client_id,status,created_by,client:clients(id,name)"
          )
          .eq("id", id)
          .single();

        if (error || !data) {
          setNotFound(true);
          return;
        }

        setTxStatus((data.status as TransactionStatus) ?? "pending");

        if (data.status === "approved" && !isAdmin) {
          setBlockedMessage("This transaction is approved and cannot be edited.");
          return;
        }

        if (
          !isAdmin &&
          data.created_by != null &&
          user?.id != null &&
          data.created_by !== user.id
        ) {
          setBlockedMessage("You can only edit your own transactions.");
          return;
        }

        if (!isAdmin && data.status !== "pending" && data.status !== "rejected") {
          setBlockedMessage("This transaction cannot be edited.");
          return;
        }

        setInvoiceNumber(data.invoice_number ?? null);

        // Pre-populate the form.
        const clientObj = Array.isArray(data.client) ? data.client[0] : data.client;
        if (clientObj) {
          setClients([clientObj]);
        }

        form.reset({
          type: data.type as "BUY" | "SELL",
          date: parseISO(data.date),
          clientId: data.client_id ?? clientObj?.id ?? "",
          weightGrams: data.weight_grams ?? 0,
          ratePerGram: data.rate_per_gram ?? 0,
          vatPercent: data.vat_percent ?? 0,
          notes: data.notes ?? "",
        });
      } catch (e) {
        console.error(e);
        setNotFound(true);
      } finally {
        setLoadingTx(false);
      }
    };
    void run();
  }, [id, form, isAdmin, user?.id, authLoading]);

  // Load clients when dropdown opens.
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
    const cid = form.getValues("clientId");
    return clients.find((c) => c.id === cid) ?? null;
  }, [clients, form]);

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const dateIso = format(values.date, "yyyy-MM-dd");

      const res = await fetch(`/api/transactions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: values.clientId,
          type: values.type,
          date: dateIso,
          weightGrams: values.weightGrams,
          ratePerGram: values.ratePerGram,
          vatPercent: values.vatPercent,
          notes: values.notes?.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Update failed");
      }

      router.push("/transactions");
    } catch (e) {
      console.error("Update failed:", e);
    } finally {
      setSubmitting(false);
    }
  }

  async function saveInvoiceNumber() {
    if (!invoiceDraft.trim()) return;
    setInvoiceSaving(true);
    setInvoiceError(null);
    try {
      const res = await fetch(`/api/transactions/${id}/invoice`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceNumber: invoiceDraft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInvoiceError(typeof data.error === "string" ? data.error : "Failed to update invoice number");
        return;
      }
      setInvoiceNumber(invoiceDraft.trim());
      setInvoiceEditing(false);
      setInvoiceSuccess(true);
      setTimeout(() => setInvoiceSuccess(false), 3000);
    } catch {
      setInvoiceError("Failed to update invoice number");
    } finally {
      setInvoiceSaving(false);
    }
  }

  if (loadingTx || authLoading) {
    return (
      <PageWrapper title="Edit transaction">
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          Loading...
        </div>
      </PageWrapper>
    );
  }

  if (blockedMessage) {
    return (
      <PageWrapper title="Edit transaction">
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground space-y-3">
          <p>{blockedMessage}</p>
          <Button variant="outline" asChild size="sm">
            <Link href={`/transactions/${id}`}>View transaction</Link>
          </Button>
        </div>
      </PageWrapper>
    );
  }

  if (notFound) {
    return (
      <PageWrapper title="Edit transaction">
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          Transaction not found.{" "}
          <Link href="/transactions" className="underline">
            Back to transactions
          </Link>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title={invoiceNumber ? `Edit ${invoiceNumber}` : "Edit transaction"}>
      <div
        className={cn(
          "rounded-lg border bg-card p-6 text-card-foreground",
          type === "BUY" ? "border-emerald-200" : "border-amber-200"
        )}
      >
        {/* ── Invoice number: admin editable, user read-only ── */}
        {invoiceNumber && (
          <div className="mb-6">
            {isAdmin ? (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  Invoice # (admin only)
                </label>
                {invoiceEditing ? (
                  <div className="space-y-1">
                    <div className="flex gap-2">
                      <Input
                        value={invoiceDraft}
                        onChange={(e) => {
                          setInvoiceDraft(e.target.value);
                          setInvoiceError(null);
                        }}
                        className="border-amber-400 font-mono text-sm focus-visible:ring-amber-400"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        onClick={saveInvoiceNumber}
                        disabled={invoiceSaving || !invoiceDraft.trim()}
                      >
                        {invoiceSaving ? "Saving…" : "Save"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setInvoiceEditing(false);
                          setInvoiceError(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                    {invoiceError && (
                      <p className="text-xs text-red-600">{invoiceError}</p>
                    )}
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Changing invoice number will update all audit log references. This action is logged.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="rounded border border-amber-300 bg-amber-50 px-2.5 py-1 font-mono text-sm dark:bg-amber-950/30">
                      {invoiceNumber}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-amber-600 hover:text-amber-800"
                      onClick={() => {
                        setInvoiceDraft(invoiceNumber ?? "");
                        setInvoiceEditing(true);
                        setInvoiceError(null);
                      }}
                      title="Edit invoice number"
                    >
                      ✏️
                    </Button>
                    {invoiceSuccess && (
                      <span className="text-xs text-emerald-600">Invoice number updated ✓</span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-0.5">
                <label className="text-xs font-medium text-muted-foreground">Invoice #</label>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono">{invoiceNumber}</span>
                  <span className="text-xs text-muted-foreground">(invoice number is not changed on edit)</span>
                </div>
              </div>
            )}
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Only admins or pending/rejected txns can change the type */}
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

            {/* SELL P&L preview card - only shown for pending/rejected (can still be edited) */}
            {type === "SELL" && txStatus !== "approved" && (
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

            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" asChild>
                <Link href="/transactions">Cancel</Link>
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </PageWrapper>
  );
}
