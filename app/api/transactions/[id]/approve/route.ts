import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-server";
import { approveTransaction } from "@/lib/txn-service";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await ctx.params;
    const tx = await approveTransaction(id, admin);
    return NextResponse.json({ transaction: tx });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Approve failed";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
