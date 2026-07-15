import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-server";
import { buildReconciliation } from "@/lib/report-service";

export const dynamic = "force-dynamic";

// GET /api/reports/reconciliation?from=2026-01-01&to=2026-12-31  (admin only)
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? `${new Date().getFullYear()}-01-01`;
  const to = searchParams.get("to") ?? `${new Date().getFullYear()}-12-31`;

  try {
    const recon = await buildReconciliation(from, to);
    return NextResponse.json(recon);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to build reconciliation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
