import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import { isAdmin } from "@/lib/rbac";
import { rejectDeal } from "@/lib/deals-service";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;
  if (!isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const dealId = parseInt(id, 10);
  if (isNaN(dealId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const body = await req.json().catch(() => ({}));
    const reason = typeof body?.reason === "string" ? body.reason : null;
    const deal = await rejectDeal(dealId, user, reason);
    return NextResponse.json({ deal });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Reject failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
