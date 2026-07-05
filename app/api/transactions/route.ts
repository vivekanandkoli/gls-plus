import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import {
  createTransaction,
  listTransactions,
  type CreateTxnInput,
  type PaymentMode,
  type TxType,
  type TxnStatus,
} from "@/lib/txn-service";
import type { Book } from "@/lib/opening-balances";

export const dynamic = "force-dynamic";

const BOOKS = ["official", "unofficial"] as const;
const TYPES = ["BUY", "SELL"] as const;
const MODES = ["bank", "qr", "cheque", "cash"] as const;

// ── GET /api/transactions ─────────────────────────────────────────────────────
export async function GET(req: Request) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  const { searchParams } = new URL(req.url);
  const bookParam = searchParams.get("book");
  const book = BOOKS.includes(bookParam as Book) ? (bookParam as Book) : undefined;
  const statusParam = searchParams.get("status") as TxnStatus | "all" | null;
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10) || 0);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "50", 10) || 50;

  // Staff only ever see approved rows; admins may filter by any status.
  const status: TxnStatus | "all" =
    user.role !== "admin" ? "approved" : statusParam ?? "all";

  try {
    const result = await listTransactions({ book, status, page, pageSize });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to fetch transactions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── POST /api/transactions ────────────────────────────────────────────────────
export async function POST(req: Request) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  try {
    const body = await req.json().catch(() => null);

    const book = BOOKS.includes(body?.book) ? (body.book as Book) : null;
    const type = TYPES.includes(body?.type) ? (body.type as TxType) : null;
    const date = typeof body?.date === "string" ? body.date : null;
    const weightGrams = Number(body?.weightGrams);
    const ratePerGram = Number(body?.ratePerGram);
    const paymentMode: PaymentMode = MODES.includes(body?.paymentMode)
      ? (body.paymentMode as PaymentMode)
      : "cash";
    const clientId =
      typeof body?.clientId === "string" && body.clientId ? body.clientId : null;
    const vatRaw =
      body?.vatPercent === null || body?.vatPercent === undefined
        ? null
        : Number(body.vatPercent);
    const notes = typeof body?.notes === "string" ? body.notes : null;

    if (!book || !type || !date || !(weightGrams > 0) || !(ratePerGram > 0)) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }

    // Unofficial (off-book) entries are admin-only, matching the old cash-mode rule.
    if (book === "unofficial" && user.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can record unofficial transactions" },
        { status: 403 }
      );
    }

    const input: CreateTxnInput = {
      book,
      date,
      type,
      clientId,
      weightGrams,
      ratePerGram,
      paymentMode,
      vatPercent: vatRaw !== null && Number.isFinite(vatRaw) ? vatRaw : null,
      notes,
    };

    const transaction = await createTransaction(input, user);
    return NextResponse.json({ transaction }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Create failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
