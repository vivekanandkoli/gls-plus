import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import type { AppRole, AppUser } from "@/lib/rbac";

type UserRow = {
  id: number;
  auth_id: string;
  email: string;
  role: AppRole;
  is_active: boolean;
  created_at: string;
};

function rowToAppUser(row: UserRow): AppUser {
  return {
    id: row.id,
    authId: row.auth_id,
    email: row.email,
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

function roleFromMetadata(meta: Record<string, unknown> | undefined): AppRole {
  const raw = meta?.app_role;
  return raw === "admin" ? "admin" : "user";
}

/** Resolve or create the gls.users profile for the current Supabase session. */
export async function getAppUser(): Promise<AppUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) return null;

  const service = createSupabaseServiceClient();

  const { data: existing } = await service
    .from("users")
    .select("id,auth_id,email,role,is_active,created_at")
    .eq("auth_id", user.id)
    .maybeSingle();

  if (existing) {
    const metaRole = roleFromMetadata(user.user_metadata as Record<string, unknown>);
    if (existing.role !== metaRole || existing.email !== user.email) {
      const { data: updated, error: updErr } = await service
        .from("users")
        .update({ role: metaRole, email: user.email })
        .eq("auth_id", user.id)
        .select("id,auth_id,email,role,is_active,created_at")
        .single();
      if (updErr) throw new Error(updErr.message);
      if (updated) return rowToAppUser(updated as UserRow);
    }
    return rowToAppUser(existing as UserRow);
  }

  const role = roleFromMetadata(user.user_metadata as Record<string, unknown>);
  const { data: created, error: insErr } = await service
    .from("users")
    .insert({
      auth_id: user.id,
      email: user.email,
      role,
      is_active: true,
    })
    .select("id,auth_id,email,role,is_active,created_at")
    .single();

  if (insErr) throw new Error(insErr.message);
  if (!created) return null;
  return rowToAppUser(created as UserRow);
}

export async function requireAppUser(): Promise<AppUser | NextResponse> {
  const user = await getAppUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user.isActive) {
    return NextResponse.json({ error: "Account deactivated" }, { status: 403 });
  }
  return user;
}

export async function requireAdmin(): Promise<AppUser | NextResponse> {
  const result = await requireAppUser();
  if (result instanceof NextResponse) return result;
  if (result.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  return result;
}

export function forbidden(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}
