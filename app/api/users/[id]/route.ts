import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import type { AppRole } from "@/lib/rbac";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await ctx.params;
    const userId = parseInt(id, 10);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const updates: Record<string, unknown> = {};

    if (typeof body?.isActive === "boolean") {
      updates.is_active = body.isActive;
    }
    if (body?.role === "admin" || body?.role === "user") {
      updates.role = body.role as AppRole;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient() as any;
    const { data: existing } = await supabase
      .from("users")
      .select("id,auth_id,email,role")
      .eq("id", userId)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { data: updated, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", userId)
      .select("id,email,role,is_active,created_at")
      .single();

    if (error) throw error;

    if (updates.role && existing.auth_id) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
      const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
      if (url && serviceRole) {
        const { createClient } = await import("@supabase/supabase-js");
        const authAdmin = createClient(url, serviceRole, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        await authAdmin.auth.admin.updateUserById(existing.auth_id, {
          user_metadata: { app_role: updates.role },
        });
      }
    }

    return NextResponse.json({ user: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
