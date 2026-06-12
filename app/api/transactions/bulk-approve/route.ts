import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-server";
import { approveTransaction } from "@/lib/transactions-service";

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await req.json().catch(() => null);
    const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]) : [];
    const validIds = ids.filter((id): id is string => typeof id === "string" && id.length > 0);

    if (validIds.length === 0) {
      return NextResponse.json({ error: "ids array required" }, { status: 400 });
    }

    const approved: string[] = [];
    const errors: { id: string; error: string }[] = [];

    for (const id of validIds) {
      try {
        await approveTransaction(id, admin);
        approved.push(id);
      } catch (e) {
        errors.push({ id, error: e instanceof Error ? e.message : "Failed" });
      }
    }

    return NextResponse.json({ approved, errors });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Bulk approve failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
