/** Trigger server-side WAC recalculation from a transaction date onwards. */
export async function triggerWacRecalculate(
  fromDate: string,
  fromId?: string
): Promise<{ updatedCount: number; sellUpdates: number; currentWac: number } | null> {
  const res = await fetch("/api/wac/recalculate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fromDate, fromId }),
  });

  if (res.status === 400) {
    const body = await res.json().catch(() => ({}));
    const msg = typeof body?.error === "string" ? body.error : "";
    if (msg.includes("column") || msg.includes("schema cache")) {
      return null;
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `WAC recalculation failed (${res.status})`);
  }

  return res.json();
}
