"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getSupabaseClient } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    // Supabase parses the recovery token from the URL and establishes a session.
    supabase.auth.getSession().then((res: { data: { session: unknown } }) => {
      if (res.data.session) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event: string) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    const supabase = getSupabaseClient();
    const { error: updErr } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updErr) {
      setError(updErr.message);
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/login"), 1800);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--background)" }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-10">
          <Image src="/logo-gls-transparent.png" alt="GLS Techno Thai" width={64} height={64} priority className="h-16 w-16 object-contain" />
        </div>
        <div className="rounded-xl p-8 shadow-sm" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <h2 className="text-xl font-semibold mb-1" style={{ fontFamily: "var(--font-heading)", color: "var(--card-foreground)" }}>
            Set a new password
          </h2>

          {done ? (
            <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">Password updated. Redirecting to sign in…</p>
          ) : !ready ? (
            <p className="mt-3 text-sm" style={{ color: "var(--muted-foreground)" }}>
              Open this page from the password-reset link in your email. If you landed here directly, request a new link from the sign-in page.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div>
                <label htmlFor="pw" className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>New password</label>
                <input id="pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password"
                  className="w-full rounded-md border bg-background px-3 py-2.5 text-sm text-foreground focus-visible:border-primary" style={{ borderColor: "var(--border)" }} />
              </div>
              <div>
                <label htmlFor="cpw" className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Confirm password</label>
                <input id="cpw" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password"
                  className="w-full rounded-md border bg-background px-3 py-2.5 text-sm text-foreground focus-visible:border-primary" style={{ borderColor: "var(--border)" }} />
              </div>
              {error ? <p className="text-xs text-red-600 dark:text-red-400" role="alert">{error}</p> : null}
              <button type="submit" disabled={loading}
                className="w-full min-h-11 rounded-md py-2.5 text-sm font-semibold tracking-wide disabled:opacity-60"
                style={{ background: "var(--gold-gradient)", color: "#1a1200" }}>
                {loading ? "Updating…" : "Update password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
