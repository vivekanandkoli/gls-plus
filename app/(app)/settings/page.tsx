"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { PageWrapper } from "@/components/layout/PageWrapper";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const schema = z.object({
  company_name_th: z.string().optional(),
  company_name_en: z.string().optional(),
  address_th: z.string().optional(),
  address_en: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  tax_id: z.string().optional(),
  logo_data_url: z.string().optional(),

  default_vat_percent: z.coerce.number().min(0),
  buy_invoice_prefix: z.string().min(1),
  sell_invoice_prefix: z.string().min(1),
  invoice_footer_note: z.string().optional(),
  low_stock_threshold_grams: z.coerce.number().min(0),
});

type Values = z.output<typeof schema>;

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

// Served from /public/logo.png (copied from /logo.png in project root)
const DEFAULT_LOGO_SRC = "/logo.png";

function PreviewInvoiceHeader({ v }: { v: Values }) {
  const logoSrc = v.logo_data_url?.trim() ? v.logo_data_url : DEFAULT_LOGO_SRC;
  return (
    <div className="border-b pb-3">
      <div className="flex items-start gap-3">
        <div className="h-14 w-14 border-2 border-black grid place-items-center overflow-hidden bg-white">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoSrc}
              alt="Logo"
              className="h-full w-full object-contain"
            />
          ) : null}
        </div>
        <div className="flex-1">
          <div className="text-sm font-bold leading-tight">
            {v.company_name_th || "บริษัท ..."}
          </div>
          <div className="text-xs font-semibold leading-tight">
            {v.company_name_en || "COMPANY NAME (EN)"}
          </div>
          <div className="mt-1 text-[10px] leading-snug">
            {v.address_en || "Address (English)"}
          </div>
          <div className="text-[10px] leading-snug">
            Email: {v.email || "-"} &nbsp; Phone: {v.phone || "-"}
          </div>
          <div className="text-[10px] leading-snug">Tax ID: {v.tax_id || "-"}</div>
        </div>
      </div>
      <div className="mt-2 text-center text-xs font-bold">
        ใบเสร็จรับเงิน / RECEIPT / TAX INVOICE
      </div>
    </div>
  );
}

function PreviewInvoiceFooter({ v }: { v: Values }) {
  return (
    <div className="mt-4 border-t pt-3 text-[10px] text-black/70">
      <div className="font-semibold text-black">Footer note</div>
      <div className="mt-1 whitespace-pre-wrap">
        {v.invoice_footer_note ||
          "Note: This receipt will be valid only with authorised signature and bill collector's signature."}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-black/80">
        <div>Default VAT: {v.default_vat_percent}%</div>
        <div className="text-right">
          Prefixes: BUY {v.buy_invoice_prefix} • SELL {v.sell_invoice_prefix}
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string>("");

  const [rebuildConfirmOpen, setRebuildConfirmOpen] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildStatus, setRebuildStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const canQuery = useMemo(() => {
    try {
      getSupabaseClient();
      return true;
    } catch {
      return false;
    }
  }, []);

  const form = useForm<Values>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      company_name_th: "บริษัท จีแอลเอส พลัส จำกัด",
      company_name_en: "GLS PLUS CO., LTD.",
      address_th: "",
      address_en:
        "66/22 GEMOPOLIS INDUSTRIAL ESTATE SOI 31 KWAENG DOKMAI, KHET PRAWET BANGKOK 10250.",
      phone: "0870398795",
      email: "glsplusdb@gmail.com",
      tax_id: "0105563120430",
      logo_data_url: "",

      default_vat_percent: 0,
      buy_invoice_prefix: "IV",
      sell_invoice_prefix: "UP",
      low_stock_threshold_grams: 0,
      invoice_footer_note:
        "Note: This receipt will be valid only with authorised signature and bill collector's signature.\nIf payment is made by cheque, this receipt is invalid until cheque is cleared.",
    },
  });

  const values = form.watch();

  useEffect(() => {
    if (!canQuery) return;
    const run = async () => {
      setLoading(true);
      try {
        const supabase = getSupabaseClient() as any;
        const { data, error } = await supabase
          .from("settings")
          .select("*")
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          form.reset({
            company_name_th: data.company_name_th ?? "",
            company_name_en: data.company_name_en ?? "",
            address_th: data.address_th ?? "",
            address_en: data.address_en ?? "",
            phone: data.phone ?? "",
            email: data.email ?? "",
            tax_id: data.tax_id ?? "",
            logo_data_url: data.logo_data_url ?? "",
            default_vat_percent: data.default_vat_percent ?? 0,
            buy_invoice_prefix: data.buy_invoice_prefix ?? "IV",
            sell_invoice_prefix: data.sell_invoice_prefix ?? "UP",
            low_stock_threshold_grams: data.low_stock_threshold_grams ?? 0,
            invoice_footer_note: data.invoice_footer_note ?? "",
          });
        }
      } catch (e) {
        console.warn(e);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [canQuery, form]);

  const onSave = async (v: Values) => {
    setSaving(true);
    setStatus("");
    try {
      const supabase = getSupabaseClient() as any;
      const payload = {
        id: 1,
        ...v,
      };
      const { error } = await supabase
        .from("settings")
        .upsert(payload, { onConflict: "id" });
      if (error) throw error;
      setStatus("Saved.");
    } catch (e: any) {
      setStatus(e?.message ?? "Failed to save.");
      throw e;
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(""), 2500);
    }
  };

  async function onRebuildLedger() {
    setRebuilding(true);
    setRebuildStatus(null);
    try {
      const supabase = getSupabaseClient() as any;

      // 1. Fetch all transactions in chronological order.
      const { data: txs, error: txErr } = await supabase
        .from("transactions")
        .select("id,date,type,weight_grams")
        .order("date", { ascending: true })
        .order("id", { ascending: true })
        .limit(100000);
      if (txErr) throw txErr;

      // 2. Fetch any manual adjustment rows (transaction_id = null) so we can preserve their relative effect.
      //    We'll insert transaction-linked rows fresh; adjustment rows stay untouched.
      const { data: adjRows } = await supabase
        .from("stock_ledger")
        .select("id,date,delta_grams,balance_grams")
        .is("transaction_id", null)
        .order("date", { ascending: true });
      const adjustments: { date: string; delta_grams: number }[] = (adjRows ?? []).map(
        (r: { date: string; delta_grams: number | null }) => ({
          date: String(r.date ?? ""),
          delta_grams: typeof r.delta_grams === "number" ? r.delta_grams : 0,
        })
      );

      // 3. Delete all transaction-linked ledger rows.
      const { error: delErr } = await supabase
        .from("stock_ledger")
        .delete()
        .not("transaction_id", "is", null);
      if (delErr) throw delErr;

      // 4. Replay transactions in order, weaving in adjustment deltas by date.
      const allEvents: { date: string; txId: string | null; delta: number }[] = [];
      for (const tx of txs ?? []) {
        const delta = tx.type === "BUY" ? (tx.weight_grams ?? 0) : -(tx.weight_grams ?? 0);
        allEvents.push({ date: String(tx.date), txId: String(tx.id), delta });
      }
      for (const adj of adjustments) {
        allEvents.push({ date: adj.date, txId: null, delta: adj.delta_grams });
      }
      allEvents.sort((a, b) => a.date.localeCompare(b.date));

      let running = 0;
      const toInsert: { transaction_id: string; date: string; delta_grams: number; balance_grams: number }[] = [];
      for (const ev of allEvents) {
        running += ev.delta;
        if (ev.txId !== null) {
          toInsert.push({
            transaction_id: ev.txId,
            date: ev.date,
            delta_grams: ev.delta,
            balance_grams: running,
          });
        }
      }

      // 5. Batch-insert rebuilt ledger rows.
      if (toInsert.length > 0) {
        const BATCH = 500;
        for (let i = 0; i < toInsert.length; i += BATCH) {
          const { error: insErr } = await supabase
            .from("stock_ledger")
            .insert(toInsert.slice(i, i + BATCH));
          if (insErr) throw insErr;
        }
      }

      // 6. Fix adjustment rows' balance_grams to match the rebuilt running total.
      //    Re-fetch them and recompute balance from the last tx balance before each adj.
      const { data: adjRowsPost } = await supabase
        .from("stock_ledger")
        .select("id,date,delta_grams")
        .is("transaction_id", null)
        .order("date", { ascending: true });

      let runningPost = 0;
      const allPost = [...toInsert];
      for (const adj of adjRowsPost ?? []) {
        const adjDate = String(adj.date ?? "");
        const adjDelta = typeof adj.delta_grams === "number" ? adj.delta_grams : 0;
        const txBefore = allPost.filter((r) => r.date <= adjDate).slice(-1)[0];
        runningPost = txBefore ? txBefore.balance_grams + adjDelta : adjDelta;
        await supabase
          .from("stock_ledger")
          .update({ balance_grams: runningPost })
          .eq("id", adj.id);
      }

      setRebuildStatus({ ok: true, msg: `Rebuilt ${toInsert.length} ledger rows from ${(txs ?? []).length} transactions.` });
    } catch (e: unknown) {
      setRebuildStatus({ ok: false, msg: e instanceof Error ? e.message : "Rebuild failed." });
    } finally {
      setRebuilding(false);
    }
  }

  return (
    <PageWrapper
      title="Settings"
      description="Thresholds, preferences, and workspace configuration."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-6 text-card-foreground">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSave)}
              className="space-y-8"
            >
              <div>
                <div className="mb-3 text-sm font-semibold">Company Info</div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="company_name_th"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company name (Thai)</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="company_name_en"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company name (English)</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="address_th"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address (Thai)</FormLabel>
                        <FormControl>
                          <Textarea rows={4} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="address_en"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address (English)</FormLabel>
                        <FormControl>
                          <Textarea rows={4} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <FormField
                    control={form.control}
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
                  <FormField
                    control={form.control}
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
                  <FormField
                    control={form.control}
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
                </div>

                <div className="mt-4">
                  <FormField
                    control={form.control}
                    name="logo_data_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Logo upload</FormLabel>
                        <FormControl>
                          <div className="flex flex-col gap-2">
                            <Input
                              type="file"
                              accept="image/*"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const dataUrl = await readFileAsDataUrl(file);
                                field.onChange(dataUrl);
                              }}
                            />
                            <div className="text-xs text-muted-foreground">
                              Default logo is <span className="font-mono">/logo.png</span> (from your
                              project’s <span className="font-mono">logo.png</span>). If you upload
                              an image, it is stored as a data URL in the `settings` row and
                              overrides the default.
                            </div>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div>
                <div className="mb-3 text-sm font-semibold">Stock Settings</div>

                <FormField
                  control={form.control}
                  name="low_stock_threshold_grams"
                  render={({ field }) => (
                    <FormItem className="max-w-xs">
                      <FormLabel>Low stock alert threshold (grams)</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="decimal"
                          value={String(field.value ?? 0)}
                          onChange={(e) => field.onChange(e.target.value)}
                        />
                      </FormControl>
                      <div className="text-xs text-muted-foreground">
                        Show a warning on the dashboard when stock falls below this value. Set to 0 to disable.
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div>
                <div className="mb-3 text-sm font-semibold">Invoice Settings</div>

                <div className="grid gap-4 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="default_vat_percent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Default VAT %</FormLabel>
                        <FormControl>
                          <Input
                            inputMode="decimal"
                            value={String(field.value ?? 0)}
                            onChange={(e) => field.onChange(e.target.value)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="buy_invoice_prefix"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>BUY invoice prefix</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="sell_invoice_prefix"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SELL invoice prefix</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="mt-4">
                  <FormField
                    control={form.control}
                    name="invoice_footer_note"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Footer note text</FormLabel>
                        <FormControl>
                          <Textarea rows={5} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3">
                <div
                  className={cn(
                    "text-sm text-muted-foreground",
                    status ? "opacity-100" : "opacity-0"
                  )}
                >
                  {status}
                </div>
                <Button type="submit" disabled={saving || loading}>
                  {saving ? "Saving..." : "Save Settings"}
                </Button>
              </div>
            </form>
          </Form>
        </div>

        <div className="rounded-lg border bg-white p-6 text-black">
          <div className="mb-3 text-sm font-semibold text-black">
            Live invoice preview
          </div>
          <div className="rounded-md border border-black p-4">
            <PreviewInvoiceHeader v={values} />
            <div className="mt-3 text-[11px]">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="font-semibold">Customer:</div>
                  <div>Demo Customer</div>
                </div>
                <div className="text-right">
                  <div>
                    <span className="font-semibold">Invoice Number</span>{" "}
                    <span className="font-mono font-semibold">
                      {values.sell_invoice_prefix}260408002
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold">Date</span> 8-Apr-2026
                  </div>
                </div>
              </div>

              <div className="mt-3 border border-black">
                <div className="grid grid-cols-6 border-b border-black text-[10px] font-semibold">
                  <div className="p-2 text-center border-r border-black">#</div>
                  <div className="p-2 text-center border-r border-black">Code</div>
                  <div className="p-2 border-r border-black col-span-2">Perticulars</div>
                  <div className="p-2 text-right border-r border-black">Weight(g)</div>
                  <div className="p-2 text-right">Amount</div>
                </div>
                <div className="grid grid-cols-6 text-[10px]">
                  <div className="p-2 text-center border-r border-black">1</div>
                  <div className="p-2 text-center border-r border-black">G9999</div>
                  <div className="p-2 border-r border-black col-span-2">
                    Pure gold (99.99%)
                  </div>
                  <div className="p-2 text-right border-r border-black">5002.0000</div>
                  <div className="p-2 text-right">125,050.00</div>
                </div>
              </div>

              <PreviewInvoiceFooter v={values} />
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Preview updates as you edit the form.
          </div>
        </div>
      </div>

      {/* Audit Log */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-sm">Audit Log</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            View a history of manual stock adjustments and system operations.
          </p>
          <Button variant="outline" asChild>
            <a href="/settings/audit-log">View Audit Log →</a>
          </Button>
        </CardContent>
      </Card>

      {/* Rebuild Ledger */}
      <Card className="mt-6 border-destructive/40">
        <CardHeader>
          <CardTitle className="text-sm">Rebuild Stock Ledger</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Re-derives every <code className="rounded bg-muted px-1 text-xs">stock_ledger</code> row
            from scratch using all transactions in chronological order. Manual adjustment rows
            (initial stock / corrections) are preserved. Use this after bulk-importing data or if the
            running balance looks wrong.
          </p>

          {rebuildStatus && (
            <div
              className={cn(
                "rounded-md border px-3 py-2 text-sm",
                rebuildStatus.ok
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
                  : "border-destructive/40 bg-destructive/5 text-destructive"
              )}
            >
              {rebuildStatus.msg}
            </div>
          )}

          <Button
            variant="destructive"
            disabled={rebuilding || !canQuery}
            onClick={() => setRebuildConfirmOpen(true)}
          >
            {rebuilding ? "Rebuilding..." : "Rebuild ledger"}
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={rebuildConfirmOpen} onOpenChange={setRebuildConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rebuild stock ledger?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete and recompute all transaction-linked ledger rows.
              Manual adjustments are preserved. This cannot be undone — make sure your
              transactions are correct first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rebuilding}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={rebuilding}
              onClick={() => { setRebuildConfirmOpen(false); void onRebuildLedger(); }}
            >
              Yes, rebuild
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageWrapper>
  );
}

