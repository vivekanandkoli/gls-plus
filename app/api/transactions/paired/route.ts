import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import { createPairedTransactions, type PaymentMode, type PairedInput } from "@/lib/txn-service";
import type { Book } from "@/lib/opening-balances";

export const dynamic = "force-dynamic";

const BOOKS = ["official", "unofficial"] as const;
const MODES = ["bank", "qr", "cheque", "cash"] as const;

// POST /api/transactions/paired — create a linked BUY+SELL (a "deal")
export async function POST(req: Request) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  try {
    const body = await req.json().catch(() => null);
    const book = BOOKS.includes(body?.book) ? (body.book as Book) : null;
    const date = typeof body?.date === "string" ? body.date : null;
    const weightGrams = Number(body?.weightGrams);
    const buyRate = Number(body?.buyRatePerGram);
    const sellRate = Number(body?.sellRatePerGram);
    const paymentMode: PaymentMode = MODES.includes(body?.paymentMode) ? (body.paymentMode as PaymentMode) : "cash";
    const buyClientId = typeof body?.buyClientId === "string" && body.buyClientId ? body.buyClientId : null;
    const sellClientId = typeof body?.sellClientId === "string" && body.sellClientId ? body.sellClientId : null;
    const notes = typeof body?.notes === "string" ? body.notes : null;

    if (!book || !date || !(weightGrams > 0) || !(buyRate > 0) || !(sellRate > 0)) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }
    if (book === "unofficial" && user.role !== "admin") {
      return NextResponse.json({ error: "Only admins can record unofficial deals" }, { status: 403 });
    }

    const input: PairedInput = {
      book,
      date,
      weightGrams,
      buyClientId,
      buyRatePerGram: buyRate,
      sellClientId,
      sellRatePerGram: sellRate,
      paymentMode,
      notes,
    };
    const result = await createPairedTransactions(input, user);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Create failed" }, { status: 500 });
  }
}
