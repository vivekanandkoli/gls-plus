import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-server";
import { rejectTransaction } from "@/lib/transactions-service";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => null);
    const reason = typeof body?.reason === "string" ? body.reason : null;
    const tx = await rejectTransaction(id, admin, reason);
    return NextResponse.json({ transaction: tx });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Reject failed";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
