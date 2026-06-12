import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import { isAdmin } from "@/lib/rbac";
import { approveDeal } from "@/lib/deals-service";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;
  if (!isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const dealId = parseInt(id, 10);
  if (isNaN(dealId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const deal = await approveDeal(dealId, user);
    return NextResponse.json({ deal });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Approve failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
