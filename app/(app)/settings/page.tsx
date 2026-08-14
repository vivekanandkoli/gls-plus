"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppUser } from "@/hooks/use-app-user";

type Book = "official" | "unofficial";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Settings = Record<string, any>;
type Balance = { year: number; book: Book; opening_stock_gm: number; opening_wac: number; opening_stock_value_thb: number };

const YEAR = new Date().getFullYear();

export default function SettingsPage() {
  const { isAdmin } = useAppUser();
  const [settings, setSettings] = useState<Settings>({});
  const [balances, setBalances] = useState<Record<Book, { gm: string; wac: string }>>({
    official: { gm: "", wac: "" },
    unofficial: { gm: "", wac: "" },
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingWhat, setSavingWhat] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, b] = await Promise.all([
        fetch("/api/settings").then((r) => r.json()),
        fetch(`/api/opening-balances?year=${YEAR}`).then((r) => r.json()),
      ]);
      if (s.settings) setSettings(s.settings);
      const map: Record<Book, { gm: string; wac: string }> = { official: { gm: "", wac: "" }, unofficial: { gm: "", wac: "" } };
      for (const row of (b.balances ?? []) as Balance[]) {
        map[row.book] = { gm: String(row.opening_stock_gm ?? ""), wac: String(row.opening_wac ?? "") };
      }
      setBalances(map);
    } catch {
      setError("Failed to load settings");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function saveSettings(fields: string[], label: string) {
    setSavingWhat(label);
    setMsg(null);
    setError(null);
    try {
      const patch: Settings = {};
      for (const f of fields) patch[f] = settings[f] ?? null;
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setMsg(`${label} saved.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingWhat(null);
    }
  }

  async function saveOpening(book: Book) {
    setSavingWhat(`opening-${book}`);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/opening-balances", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: YEAR, book, opening_stock_gm: Number(balances[book].gm), opening_wac: Number(balances[book].wac) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setMsg(`${book} opening balance for ${YEAR} saved.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingWhat(null);
    }
  }

  const field = (key: string, label: string, type = "text") => (
    <div>
      <label className="mb-1 block text-sm text-muted-foreground">{label}</label>
      <Input type={type} value={settings[key] ?? ""} disabled={!isAdmin} onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value }))} />
    </div>
  );

  return (
    <PageWrapper title="Settings" description="Company info, opening balances, invoice series, and stock thresholds.">
      {!isAdmin && <div className="mb-4 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">Read-only — only admins can change settings.</div>}
      {error && <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
      {msg && <div className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">{msg}</div>}

      <div className="space-y-6">
        {/* Opening balances — the owner's real per-book year-opening figures */}
        <section className="rounded-lg border border-border p-4">
          <h2 className="mb-1 text-base font-medium">Opening balances — {YEAR}</h2>
          <p className="mb-3 text-xs text-muted-foreground">Each book&apos;s WAC runs from these. Set the real stock (grams) and cost (WAC, THB/g) at the start of the year.</p>
          <div className="grid gap-4 md:grid-cols-2">
            {(["unofficial", "official"] as Book[]).map((book) => (
              <div key={book} className="rounded-md border border-border p-3">
                <div className="mb-2 text-sm font-medium capitalize">{book === "unofficial" ? "🔒 Unofficial (vault)" : "Official"}</div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="mb-1 block text-xs text-muted-foreground">Opening stock (g)</label><Input inputMode="decimal" value={balances[book].gm} disabled={!isAdmin} onChange={(e) => setBalances((b) => ({ ...b, [book]: { ...b[book], gm: e.target.value } }))} /></div>
                  <div><label className="mb-1 block text-xs text-muted-foreground">Opening WAC (THB/g)</label><Input inputMode="decimal" value={balances[book].wac} disabled={!isAdmin} onChange={(e) => setBalances((b) => ({ ...b, [book]: { ...b[book], wac: e.target.value } }))} /></div>
                </div>
                {isAdmin && <Button size="sm" className="mt-3" disabled={savingWhat === `opening-${book}`} onClick={() => saveOpening(book)}>{savingWhat === `opening-${book}` ? "Saving…" : "Save"}</Button>}
              </div>
            ))}
          </div>
        </section>

        {/* Invoice prefixes */}
        <section className="rounded-lg border border-border p-4">
          <h2 className="mb-3 text-base font-medium">Invoice series</h2>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            {field("invoice_prefix_official_buy", "Official BUY")}
            {field("invoice_prefix_official_sell", "Official SELL")}
            {field("invoice_prefix_unofficial_buy", "Unofficial BUY")}
            {field("invoice_prefix_unofficial_sell", "Unofficial SELL")}
          </div>
          {isAdmin && <Button size="sm" className="mt-3" disabled={savingWhat === "Invoice series"} onClick={() => saveSettings(["invoice_prefix_official_buy", "invoice_prefix_official_sell", "invoice_prefix_unofficial_buy", "invoice_prefix_unofficial_sell"], "Invoice series")}>{savingWhat === "Invoice series" ? "Saving…" : "Save"}</Button>}
        </section>

        {/* Thresholds + VAT */}
        <section className="rounded-lg border border-border p-4">
          <h2 className="mb-3 text-base font-medium">Stock thresholds &amp; VAT</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {field("official_low_stock_threshold_gm", "Official low-stock (g)", "number")}
            {field("unofficial_low_stock_threshold_gm", "Unofficial low-stock (g)", "number")}
            {field("default_vat_percent", "Default VAT %", "number")}
          </div>
          {isAdmin && <Button size="sm" className="mt-3" disabled={savingWhat === "Thresholds"} onClick={() => saveSettings(["official_low_stock_threshold_gm", "unofficial_low_stock_threshold_gm", "default_vat_percent"], "Thresholds")}>{savingWhat === "Thresholds" ? "Saving…" : "Save"}</Button>}
        </section>

        {/* Company info */}
        <section className="rounded-lg border border-border p-4">
          <h2 className="mb-3 text-base font-medium">Company details (invoices)</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("company_name", "Company name")}
            {field("company_name_th", "Company name (TH)")}
            {field("tax_id", "Tax ID")}
            {field("phone", "Phone")}
            {field("email", "Email")}
            {field("website", "Website")}
            {field("address_1", "Address line 1")}
            {field("address_2", "Address line 2")}
            {field("invoice_footer", "Invoice footer")}
          </div>
          {isAdmin && <Button size="sm" className="mt-3" disabled={savingWhat === "Company details"} onClick={() => saveSettings(["company_name", "company_name_th", "tax_id", "phone", "email", "website", "address_1", "address_2", "invoice_footer"], "Company details")}>{savingWhat === "Company details" ? "Saving…" : "Save"}</Button>}
        </section>

        <section className="rounded-lg border border-border p-4">
          <h2 className="mb-2 text-base font-medium">More</h2>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/settings/users" className="text-primary hover:underline">User management</Link>
            <Link href="/settings/activity-log" className="text-primary hover:underline">Activity log</Link>
          </div>
        </section>
      </div>
    </PageWrapper>
  );
}
