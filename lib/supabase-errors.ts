/** Human-readable message for PostgREST / Supabase query errors. */
export function formatSupabaseQueryError(e: unknown): string {
  if (e instanceof Error) {
    const any = e as Error & { code?: string; details?: string; hint?: string };
    const parts = [any.message];
    if (any.code) parts.push(`code: ${any.code}`);
    if (any.hint && any.hint !== any.message) parts.push(`hint: ${any.hint}`);
    if (any.details) parts.push(String(any.details));
    return parts.join(" · ");
  }
  if (
    e &&
    typeof e === "object" &&
    "message" in e &&
    typeof (e as { message: unknown }).message === "string"
  ) {
    const o = e as {
      message: string;
      code?: string;
      hint?: string;
      details?: string;
    };
    const parts = [o.message];
    if (o.code) parts.push(`code: ${o.code}`);
    if (o.hint && o.hint !== o.message) parts.push(`hint: ${o.hint}`);
    if (o.details) parts.push(String(o.details));
    return parts.join(" · ");
  }
  return "Failed to load data (check .env, RLS policies, and gls schema).";
}
