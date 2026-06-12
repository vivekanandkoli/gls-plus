/**
 * Creates or updates Supabase Auth users for local/demo login (email + password).
 *
 * Prerequisites:
 *   - .env.local with NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY
 *   - Supabase Dashboard → Authentication → Providers → Email: enabled (password sign-in)
 *
 *   npx tsx scripts/seed-demo-users.ts
 */
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

import { DEMO_ADMIN, DEMO_USER } from "../lib/demo-accounts";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!url || !serviceRole) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRole, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  db: { schema: "gls" },
});

async function ensureAuthUser(opts: {
  email: string;
  password: string;
  app_role: string;
}) {
  const { email, password, app_role } = opts;
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) {
    throw new Error(`listUsers: ${listErr.message}`);
  }
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  let authId: string;

  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { ...existing.user_metadata, app_role },
    });
    if (error) throw new Error(`updateUser ${email}: ${error.message}`);
    authId = data.user.id;
    console.log("Updated:", email);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { app_role },
    });
    if (error) throw new Error(`createUser ${email}: ${error.message}`);
    authId = data.user.id;
    console.log("Created:", email);
  }

  const role = app_role === "admin" ? "admin" : "user";
  const { error: profileErr } = await supabase.from("users").upsert(
    {
      auth_id: authId,
      email,
      role,
      is_active: true,
    },
    { onConflict: "auth_id" }
  );
  if (profileErr) {
    console.warn(`gls.users sync for ${email}:`, profileErr.message);
    console.warn("Run scripts/rbac-migration.sql if the users table is missing.");
  }
}

async function main() {
  await ensureAuthUser(DEMO_ADMIN);
  await ensureAuthUser(DEMO_USER);
  console.log("\nDone. Sign in at /login with email + password.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
