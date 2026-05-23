/**
 * Built-in demo users for internal / staging. Run `npm run seed:demo-users`
 * once (requires SUPABASE_SERVICE_ROLE_KEY) before first login.
 *
 * Change passwords in production; do not expose this file publicly.
 */
export const DEMO_ADMIN = {
  email: "admin@gls-plus.local",
  password: "GlsAdmin!2026",
  app_role: "admin" as const,
};

export const DEMO_USER = {
  email: "user@gls-plus.local",
  password: "GlsUser!2026",
  app_role: "user" as const,
};
