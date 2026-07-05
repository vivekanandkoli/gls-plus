import { NextResponse } from "next/server";

import { requireAppUser, forbidden } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { fetchTransaction, deleteTransaction } from "@/lib/txn-service";

type Ctx = { params: Promise<{ id: string }> };

// ── GET /api/transactions/[id] ────────────────────────────────────────────────
export async function GET(_req: Request, ctx: Ctx) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  try {
    const { id } = await ctx.params;
    const supabase = createSupabaseServiceClient();
    const tx = await fetchTransaction(supabase, id);
    if (!tx) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

    // Staff may only view approved rows (or their own submissions).
    if (user.role !== "admin" && tx.status !== "approved" && tx.created_by !== user.id) {
      return forbidden("You cannot view this transaction");
    }
    return NextResponse.json({ transaction: tx });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load transaction";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── DELETE /api/transactions/[id] ─────────────────────────────────────────────
export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  try {
    const { id } = await ctx.params;
    const supabase = createSupabaseServiceClient();
    const tx = await fetchTransaction(supabase, id);
    if (!tx) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

    // Admin deletes anything; staff only their own not-yet-approved entries.
    const canDelete =
      user.role === "admin" || (tx.created_by === user.id && tx.status !== "approved");
    if (!canDelete) return forbidden("You cannot delete this transaction");

    await deleteTransaction(id, user);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
