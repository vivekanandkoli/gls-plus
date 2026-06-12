import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import { isAdmin } from "@/lib/rbac";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;
  if (!isAdmin(user)) return NextResponse.json({ count: 0 });

  try {
    const supabase = createSupabaseServiceClient() as any;
    const { count, error } = await supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    if (error) throw new Error(error.message);
    return NextResponse.json({ count: count ?? 0 });
  } catch (e) {
    return NextResponse.json({ count: 0 });
  }
}
