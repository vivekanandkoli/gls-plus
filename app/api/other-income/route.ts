import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { canonicalCategory } from "@/lib/other-income";
import { logAudit } from "@/lib/transaction-audit";

const SELECT = "id,date,book,kind,category,amount_thb,description,created_by,created_at";

type Book = "official" | "unofficial";
type Kind = "income" | "expense";

function asBook(v: unknown): Book | null {
  return v === "official" || v === "unofficial" ? v : null;
}
function asKind(v: unknown): Kind | null {
  return v === "income" || v === "expense" ? v : null;
}

type Totals = { income: number; expense: number; net: number };
const zero = (): Totals => ({ income: 0, expense: 0, net: 0 });

/** GET /api/other-income?year=&book=&kind=&category=&q= — rows + totals by book. */
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const url = new URL(req.url);
    const year = url.searchParams.get("year");
    const book = asBook(url.searchParams.get("book"));
    const kind = asKind(url.searchParams.get("kind"));
    const category = (url.searchParams.get("category") ?? "").trim();
    const q = (url.searchParams.get("q") ?? "").trim();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = sb.from("other_income").select(SELECT).order("date", { ascending: false }).order("id", { ascending: false });
    if (year) query = query.gte("date", `${year}-01-01`).lte("date", `${year}-12-31`);
    if (book) query = query.eq("book", book);
    if (kind) query = query.eq("kind", kind);
    if (category) query = query.ilike("category", category);
    if (q) query = query.ilike("description", `%${q}%`);

    const { data, error } = await query.limit(5000);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Array<{ book: Book; kind: Kind; amount_thb: number | string }>;
    const byBook: Record<Book, Totals> = { official: zero(), unofficial: zero() };
    const overall = zero();
    const categories = new Set<string>();
    for (const r of data ?? []) {
      const amt = Number((r as { amount_thb: number }).amount_thb) || 0;
      const b = (r as { book: Book }).book;
      const k = (r as { kind: Kind }).kind;
      const cat = (r as { category: string }).category;
      if (cat) categories.add(cat);
      const bucket = byBook[b] ?? zero();
      if (k === "income") { bucket.income += amt; overall.income += amt; }
      else { bucket.expense += amt; overall.expense += amt; }
    }
    const r2 = (n: number) => Math.round(n * 100) / 100;
    for (const b of ["official", "unofficial"] as Book[]) {
      byBook[b].net = r2(byBook[b].income - byBook[b].expense);
      byBook[b].income = r2(byBook[b].income);
      byBook[b].expense = r2(byBook[b].expense);
    }
    overall.net = r2(overall.income - overall.expense);
    overall.income = r2(overall.income);
    overall.expense = r2(overall.expense);

    return NextResponse.json({
      rows: rows,
      totals: { overall, byBook },
      categories: Array.from(categories).sort((a, b) => a.localeCompare(b)),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load other income";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/other-income — create a row. */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await req.json().catch(() => ({}));
    const book = asBook(body.book);
    const kind = asKind(body.kind);
    const category = typeof body.category === "string" ? body.category.trim() : "";
    const date = typeof body.date === "string" && body.date ? body.date : null;
    const amount = Number(body.amount_thb);
    const description = typeof body.description === "string" ? body.description.trim() || null : null;

    if (!book || !kind || !category || !date) {
      return NextResponse.json({ error: "Date, book, kind and category are required" }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: "Amount must be zero or more" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;
    const canonCategory = await canonicalCategory(sb, category);
    const { data, error } = await sb
      .from("other_income")
      .insert({ book, kind, category: canonCategory, date, amount_thb: amount, description, created_by: admin.id })
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);

    await logAudit({ entityType: "other_income", entityId: data.id, action: "created", performedBy: admin.id, newValues: data });

    return NextResponse.json({ row: data }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create entry";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
