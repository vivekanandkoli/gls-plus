import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

/** PATCH /api/expenses/[id] — edit a ledger entry. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const patch: Record<string, unknown> = {};
    if (typeof body.date === "string" && body.date) patch.date = body.date;
    if (typeof body.description === "string") patch.description = body.description.trim();
    if ("jobId" in body) patch.job_id = typeof body.jobId === "string" ? body.jobId.trim() || null : null;
    if (body.received != null) patch.received = Math.max(0, Number(body.received) || 0);
    if (body.expense != null) patch.expense = Math.max(0, Number(body.expense) || 0);

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;
    const { data, error } = await sb
      .from("expenses")
      .update(patch)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update entry";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/expenses/[id] — remove a ledger entry. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any;
    const { error } = await sb.from("expenses").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete entry";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
