import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import type { AppRole } from "@/lib/rbac";

export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const supabase = createSupabaseServiceClient() as any;
    const { data, error } = await supabase
      .from("users")
      .select("id,email,role,is_active,created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ users: data ?? [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to list users";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await req.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const role: AppRole = body?.role === "admin" ? "admin" : "user";

    if (!email || !password) {
      return NextResponse.json({ error: "email and password required" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (!url || !serviceRole) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const { createClient } = await import("@supabase/supabase-js");
    const authAdmin = createClient(url, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: authData, error: authErr } = await authAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { app_role: role },
    });
    if (authErr) throw new Error(authErr.message);

    const supabase = createSupabaseServiceClient() as any;
    const { data: profile, error: profileErr } = await supabase
      .from("users")
      .insert({
        auth_id: authData.user.id,
        email,
        role,
        is_active: true,
      })
      .select("id,email,role,is_active,created_at")
      .single();

    if (profileErr) throw new Error(profileErr.message);

    return NextResponse.json({ user: profile }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create user";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
