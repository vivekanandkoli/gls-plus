"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, UploadCloud, XCircle } from "lucide-react";
import * as XLSX from "xlsx";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppUser } from "@/hooks/use-app-user";

// ─── Types ──────────────────────────────────────────────────────────────────

type TxType = "BUY" | "SELL";

type Client = { id: string; name: string };

type Row = {
  key: number;
  date: string; // YYYY-MM-DD
  type: TxType;
  clientNameRaw: string;
  clientIdFile: string; // explicit client id from the file (optional)
  weight: number;
  rate: number;
  amount: number;
  invoice: string; // supplier invoice (BUY only)
  // resolution / flags
  clientId: string | null; // matched/selected existing client
  createNew: boolean; // create a client from clientNameRaw
  include: boolean;
  duplicate: boolean; // looks already present in the app
  errors: string[];
};

type ImportResult = {
  index: number;
  ok: boolean;
  invoiceNumber?: string | null;
  error?: string;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Loose name key for matching sheet names to existing clients. */
function nameKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(co|co\.|ltd|ltd\.|company|limited|head office|the)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function excelToIso(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    const dc = XLSX.SSF.parse_date_code(v);
    if (!dc) return null;
    return `${dc.y}-${String(dc.m).padStart(2, "0")}-${String(dc.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  // already YYYY-MM-DD ?
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

/** Find a column index by any of the accepted header names. */
function col(headers: string[], ...names: string[]): number {
  const norm = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  for (const n of names) {
    const want = n.toLowerCase().replace(/[^a-z0-9]/g, "");
    const i = norm.findIndex((h) => h === want || h.startsWith(want));
    if (i >= 0) return i;
  }
  return -1;
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const router = useRouter();
  const { isAdmin, loading: authLoading } = useAppUser();

  const [clients, setClients] = useState<Client[]>([]);
  const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [parseError, setParseError] = useState<string>("");
  const [loadingRefs, setLoadingRefs] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [serverError, setServerError] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace("/transactions");
  }, [authLoading, isAdmin, router]);

  const clientByKey = useMemo(() => {
    const m = new Map<string, Client>();
    for (const c of clients) m.set(nameKey(c.name), c);
    return m;
  }, [clients]);

  /** Load clients + existing official transactions (for client match + dup guard). */
  const loadRefs = useCallback(async (years: number[]) => {
    setLoadingRefs(true);
    try {
      const cr = await fetch("/api/clients/list");
      const cj = await cr.json();
      const cs: Client[] = (cj.clients ?? []).map((c: { id: string; name: string }) => ({
        id: c.id,
        name: c.name,
      }));

      // Build an existence key set from official rows in the touched years.
      const keys = new Set<string>();
      for (const year of years) {
        for (let page = 1; page <= 20; page++) {
          const r = await fetch(
            `/api/transactions/list?book=official&year=${year}&pageSize=200&page=${page}`
          );
          const j = await r.json();
          const list = j.rows ?? [];
          for (const t of list) {
            keys.add(`${t.date}|${t.type}|${Math.round(Number(t.weight_grams) * 10) / 10}`);
          }
          if (list.length < 200) break;
        }
      }
      return { cs, keys };
    } finally {
      setLoadingRefs(false);
    }
  }, []);

  const onFile = useCallback(
    async (file: File) => {
      setParseError("");
      setResults(null);
      setServerError("");
      setFileName(file.name);
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
        if (!aoa.length) {
          setParseError("The sheet is empty.");
          return;
        }
        const headers = (aoa[0] as unknown[]).map((h) => String(h ?? ""));
        const iDate = col(headers, "date");
        const iType = col(headers, "type");
        const iClientId = col(headers, "clientid");
        const iClient = col(headers, "client", "name");
        const iWeight = col(headers, "weight", "weightg", "grams");
        const iRate = col(headers, "rate", "rateg", "ratepergram");
        const iAmount = col(headers, "amount", "amountthb", "value");
        const iInvoice = col(headers, "invoice", "invoiceno", "invoicenumber");
        const missing = [
          ["Date", iDate],
          ["Type", iType],
          ["Client", iClient],
          ["Weight", iWeight],
          ["Rate", iRate],
        ].filter(([, i]) => (i as number) < 0);
        if (missing.length) {
          setParseError(
            `Missing required column(s): ${missing.map((m) => m[0]).join(", ")}. ` +
              `Expected headers: Date, Type, Client, Weight, Rate, Amount, Invoice.`
          );
          return;
        }

        const parsed: Row[] = [];
        const years = new Set<number>();
        for (let r = 1; r < aoa.length; r++) {
          const row = aoa[r] as unknown[];
          if (!row || row.every((c) => c == null || c === "")) continue;
          const date = excelToIso(row[iDate]);
          const typeRaw = String(row[iType] ?? "").trim().toUpperCase();
          const type: TxType | null = typeRaw === "BUY" || typeRaw === "SELL" ? typeRaw : null;
          const clientNameRaw = String(row[iClient] ?? "").trim();
          const clientIdRaw = iClientId >= 0 ? String(row[iClientId] ?? "").trim() : "";
          const weight = toNum(row[iWeight]);
          const rate = toNum(row[iRate]);
          const amount = iAmount >= 0 ? toNum(row[iAmount]) : null;
          const invoice = iInvoice >= 0 ? String(row[iInvoice] ?? "").trim() : "";

          const errors: string[] = [];
          if (!date) errors.push("bad date");
          if (!type) errors.push("type must be BUY/SELL");
          if (!clientNameRaw) errors.push("missing client");
          if (weight == null || weight <= 0) errors.push("weight > 0 required");
          if (rate == null || rate <= 0) errors.push("rate > 0 required");

          const amt = amount != null ? amount : weight != null && rate != null ? Math.round(weight * rate * 100) / 100 : 0;
          if (date) years.add(Number(date.slice(0, 4)));

          parsed.push({
            key: r,
            date: date ?? "",
            type: (type ?? "SELL") as TxType,
            clientNameRaw,
            clientIdFile: clientIdRaw,
            weight: weight ?? 0,
            rate: rate ?? 0,
            amount: amt,
            invoice,
            clientId: null,
            createNew: false,
            include: errors.length === 0,
            duplicate: false,
            errors,
          });
        }

        // Load reference data, then resolve clients + duplicates.
        const { cs, keys } = await loadRefs([...years]);
        setClients(cs);
        setExistingKeys(keys);
        const byKey = new Map<string, Client>();
        for (const c of cs) byKey.set(nameKey(c.name), c);
        const byId = new Map<string, Client>();
        for (const c of cs) byId.set(c.id, c);

        for (const p of parsed) {
          // Prefer an explicit ClientId from the file; else match by name.
          const idMatch = p.clientIdFile && byId.get(p.clientIdFile);
          const match = idMatch || byKey.get(nameKey(p.clientNameRaw));
          if (match) {
            p.clientId = match.id;
            p.createNew = false;
          } else {
            p.clientId = null;
            p.createNew = true;
          }
          const dupKey = `${p.date}|${p.type}|${Math.round(p.weight * 10) / 10}`;
          if (keys.has(dupKey)) {
            p.duplicate = true;
            p.include = false; // default: don't re-import something that looks present
          }
        }
        setRows(parsed);
      } catch (e) {
        setParseError(e instanceof Error ? e.message : "Could not read the file.");
      }
    },
    [loadRefs]
  );

  const stats = useMemo(() => {
    const incl = rows.filter((r) => r.include && r.errors.length === 0);
    return {
      total: rows.length,
      include: incl.length,
      newClients: new Set(incl.filter((r) => r.createNew).map((r) => nameKey(r.clientNameRaw))).size,
      duplicates: rows.filter((r) => r.duplicate).length,
      errors: rows.filter((r) => r.errors.length > 0).length,
    };
  }, [rows]);

  const doImport = useCallback(async () => {
    setImporting(true);
    setServerError("");
    setResults(null);
    try {
      const toSend = rows
        .map((r, idx) => ({ r, idx }))
        .filter(({ r }) => r.include && r.errors.length === 0);
      const payload = {
        rows: toSend.map(({ r }) => ({
          date: r.date,
          type: r.type,
          clientId: r.createNew ? null : r.clientId,
          newClientName: r.createNew ? r.clientNameRaw : null,
          weightGrams: r.weight,
          ratePerGram: r.rate,
          amountThb: r.amount,
          invoiceNumber: r.type === "BUY" ? r.invoice || null : null,
          paymentMode: "bank",
          vatPercent: 0,
        })),
      };
      const res = await fetch("/api/transactions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) {
        setServerError(j.error ?? "Import failed");
        setResults(j.results ?? null);
        return;
      }
      // Map server results (by position in toSend) back to row keys.
      const mapped: ImportResult[] = (j.results ?? []).map(
        (rr: { index: number; ok: boolean; invoiceNumber?: string | null; error?: string }) => ({
          index: toSend[rr.index]?.r.key ?? rr.index,
          ok: rr.ok,
          invoiceNumber: rr.invoiceNumber,
          error: rr.error,
        })
      );
      setResults(mapped);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }, [rows]);

  const setRow = (key: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  if (authLoading || !isAdmin) {
    return (
      <PageWrapper title="Import transactions" description="Admin only">
        <p className="text-sm text-muted-foreground">Checking access…</p>
      </PageWrapper>
    );
  }

  const imported = results?.filter((r) => r.ok).length ?? 0;
  const failed = results?.filter((r) => !r.ok).length ?? 0;

  return (
    <PageWrapper
      title="Import transactions"
      description="Bulk-add official transactions from a spreadsheet"
    >
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Upload file</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Columns (first row = headers): <b>Date, Type, Client, Weight, Rate, Amount, Invoice</b>.
              Type is BUY or SELL. All rows import into the <b>official</b> book as <b>approved</b>,
              payment <b>Bank</b>, VAT <b>0%</b>. BUY rows keep the <b>Invoice</b> from the file;
              SELL rows get the app&apos;s own UP… number automatically.
            </p>
            <div className="flex items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                }}
              />
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                <UploadCloud className="mr-2 h-4 w-4" /> Choose file
              </Button>
              {fileName ? <span className="text-sm text-muted-foreground">{fileName}</span> : null}
              {loadingRefs ? (
                <span className="flex items-center text-sm text-muted-foreground">
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" /> reading app data…
                </span>
              ) : null}
            </div>
            {parseError ? (
              <p className="flex items-start gap-2 text-sm text-red-600">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {parseError}
              </p>
            ) : null}
          </CardContent>
        </Card>

        {/* Preview */}
        {rows.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. Review &amp; confirm</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-4 text-sm">
                <span>
                  <b>{stats.include}</b> to import
                </span>
                <span className="text-amber-600">{stats.newClients} new client(s)</span>
                <span className="text-blue-600">{stats.duplicates} look already in app</span>
                {stats.errors ? <span className="text-red-600">{stats.errors} with errors</span> : null}
              </div>

              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="p-2 w-10">Add</th>
                      <th className="p-2">Date</th>
                      <th className="p-2">Type</th>
                      <th className="p-2">Client</th>
                      <th className="p-2 text-right">Weight</th>
                      <th className="p-2 text-right">Rate</th>
                      <th className="p-2 text-right">Amount</th>
                      <th className="p-2">Invoice</th>
                      <th className="p-2">Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const res = results?.find((x) => x.index === r.key);
                      return (
                        <tr key={r.key} className="border-t align-top">
                          <td className="p-2">
                            <input
                              type="checkbox"
                              checked={r.include}
                              disabled={r.errors.length > 0 || importing || !!results}
                              onChange={(e) => setRow(r.key, { include: e.target.checked })}
                            />
                          </td>
                          <td className="p-2 whitespace-nowrap">{r.date}</td>
                          <td className="p-2">{r.type}</td>
                          <td className="p-2 min-w-[180px]">
                            <select
                              className="w-full rounded border bg-background px-1 py-0.5 text-sm"
                              value={r.createNew ? "__new__" : r.clientId ?? ""}
                              disabled={importing || !!results}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === "__new__") setRow(r.key, { createNew: true, clientId: null });
                                else setRow(r.key, { createNew: false, clientId: v });
                              }}
                            >
                              <option value="__new__">
                                ➕ Create “{r.clientNameRaw}”
                              </option>
                              {clients.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2 text-right whitespace-nowrap">{r.weight} g</td>
                          <td className="p-2 text-right whitespace-nowrap">{r.rate.toLocaleString()}</td>
                          <td className="p-2 text-right whitespace-nowrap">
                            ฿{r.amount.toLocaleString()}
                          </td>
                          <td className="p-2 whitespace-nowrap">
                            {r.type === "BUY" ? r.invoice || "—" : <span className="text-muted-foreground">auto</span>}
                          </td>
                          <td className="p-2 space-y-1">
                            {r.errors.length > 0 ? (
                              <span className="block text-xs text-red-600">{r.errors.join(", ")}</span>
                            ) : null}
                            {r.createNew ? (
                              <span className="block text-xs text-amber-600">new client</span>
                            ) : null}
                            {r.duplicate ? (
                              <span className="block text-xs text-blue-600">already in app?</span>
                            ) : null}
                            {res ? (
                              res.ok ? (
                                <span className="block text-xs text-emerald-600">
                                  ✓ {res.invoiceNumber ?? "done"}
                                </span>
                              ) : (
                                <span className="block text-xs text-red-600">✗ {res.error}</span>
                              )
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {serverError ? (
                <p className="flex items-start gap-2 text-sm text-red-600">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> {serverError}
                </p>
              ) : null}

              {results ? (
                <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>
                    Imported <b>{imported}</b>
                    {failed ? (
                      <>
                        , <span className="text-red-600">{failed} failed</span>
                      </>
                    ) : null}
                    . WAC has been recomputed.
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    onClick={() => router.push("/transactions")}
                  >
                    Go to transactions
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Button onClick={doImport} disabled={importing || stats.include === 0}>
                    {importing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing…
                      </>
                    ) : (
                      <>Import {stats.include} transaction(s)</>
                    )}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Creates approved official rows and recomputes WAC once.
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </PageWrapper>
  );
}
