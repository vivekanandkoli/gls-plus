/** Build a direct Postgres URI from the project API URL and database password. */
export function buildSupabaseDbUrl(
  password: string,
  apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
): string | undefined {
  if (!password.trim() || !apiUrl) return undefined;

  try {
    const ref = new URL(apiUrl).hostname.split(".")[0];
    if (!ref) return undefined;
    return `postgresql://postgres:${encodeURIComponent(password.trim())}@db.${ref}.supabase.co:5432/postgres`;
  } catch {
    return undefined;
  }
}

/** Resolve a Postgres connection URI for DDL migrations (server/scripts only). */
export function resolveSupabaseDbUrl(overridePassword?: string): string | undefined {
  const explicit = process.env.SUPABASE_DB_URL?.trim();
  if (explicit) return explicit;

  const password =
    overridePassword?.trim() ?? process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!password) return undefined;

  return buildSupabaseDbUrl(password);
}
