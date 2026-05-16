import { createClient } from "@supabase/supabase-js";

let _client: ReturnType<typeof createClient> | null = null;

/** Returns null if the browser can talk to Supabase; otherwise a short fix hint (no throw). */
export function getSupabaseBrowserConfigError(): string | null {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!supabaseUrl) {
    return "Set NEXT_PUBLIC_SUPABASE_URL in .env.local (your Supabase project URL).";
  }
  if (!supabaseAnonKey) {
    return "Set NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local: Supabase → Project Settings → API → “anon public” key (not the service role). Restart the dev server after saving.";
  }
  return null;
}

export function getSupabaseClient() {
  if (_client) return _client;

  // Browser bundles only include NEXT_PUBLIC_* — add these to .env.local (not just SUPABASE_URL).
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  // Avoid crashing during build/prerender when env vars are not set.
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase browser client: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local (Project Settings → API → anon public key). Server-only SUPABASE_URL is not visible in the browser."
    );
  }

  _client = createClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      db: {
        schema: "gls",
      },
    } as any
  );
  return _client;
}

