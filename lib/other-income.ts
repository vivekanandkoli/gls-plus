/**
 * Reuse the existing spelling of an Other Income category when one already
 * exists case-insensitively, so "Rental"/"rental"/"RENTAL" don't fragment
 * reporting into separate buckets.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function canonicalCategory(sb: any, raw: string): Promise<string> {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const { data } = await sb.from("other_income").select("category");
  for (const r of data ?? []) {
    const c = (r as { category: string }).category;
    if (c && c.toLowerCase() === trimmed.toLowerCase()) return c;
  }
  return trimmed;
}
