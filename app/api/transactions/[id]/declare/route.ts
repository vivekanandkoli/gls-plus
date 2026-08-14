import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-server";
import { declareOfficially, type PaymentMode } from "@/lib/txn-service";

type Ctx = { params: Promise<{ id: string }> };
const MODES = ["bank", "qr", "cheque", "cash"] as const;

// POST /api/transactions/[id]/declare — declare an unofficial txn to the official book (admin)
export async function POST(req: Request, ctx: Ctx) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const ratePerGram = body?.ratePerGram === undefined || body?.ratePerGram === null ? undefined : Number(body.ratePerGram);
    const vatPercent = body?.vatPercent === undefined || body?.vatPercent === null ? null : Number(body.vatPercent);
    const paymentMode: PaymentMode | undefined = MODES.includes(body?.paymentMode) ? body.paymentMode : undefined;

    const official = await declareOfficially(id, admin, {
      ratePerGram: ratePerGram !== undefined && Number.isFinite(ratePerGram) ? ratePerGram : undefined,
      vatPercent,
      paymentMode,
    });
    return NextResponse.json({ official }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Declare failed";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
