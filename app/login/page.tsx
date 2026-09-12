"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatSignInError } from "@/lib/auth-login-errors";
import { DEMO_ADMIN, DEMO_USER } from "@/lib/demo-accounts";
import { getSupabaseClient } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = getSupabaseClient();
    const { error: signError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signError) {
      if (process.env.NODE_ENV === "development") {
        console.error("Supabase signInWithPassword:", {
          message: signError.message,
          status: signError.status,
          code: signError.code,
        });
      }
      setError(formatSignInError(signError));
      setLoading(false);
      return;
    }

    router.refresh();
    router.push("/dashboard");
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--background)" }}
    >
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-10">
          <Image
            src="/logo-gls-transparent.png"
            alt="GLS Techno Thai"
            width={64}
            height={64}
            priority
            className="h-16 w-16 object-contain drop-shadow-[0_0_12px_rgba(201,162,39,0.4)]"
          />
          <div className="text-center">
            <div
              className="text-2xl font-bold tracking-[0.18em]"
              style={{
                fontFamily: "var(--font-heading)",
                background: "var(--gold-gradient)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              GLS PLUS
            </div>
            <div
              className="text-[10px] tracking-[0.28em] uppercase mt-0.5"
              style={{ color: "var(--muted-foreground)" }}
            >
              Techno Thai
            </div>
          </div>
        </div>

        <div
          className="rounded-xl p-8 shadow-sm"
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            boxShadow: "0 1px 2px rgba(28, 25, 23, 0.04)",
          }}
        >
          <h2
            className="text-xl font-semibold mb-1"
            style={{
              fontFamily: "var(--font-heading)",
              color: "var(--card-foreground)",
            }}
          >
            Sign in
          </h2>
          <p
            className="text-sm mb-4"
            style={{ color: "var(--muted-foreground)" }}
          >
            Email and password (demo accounts below).
          </p>

          <div className="flex flex-wrap gap-2 mb-5">
            <button
              type="button"
              className="rounded-md border border-border bg-muted/50 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted min-h-9"
              onClick={() => {
                setEmail(DEMO_ADMIN.email);
                setPassword(DEMO_ADMIN.password);
              }}
            >
              Fill {DEMO_ADMIN.app_role}
            </button>
            <button
              type="button"
              className="rounded-md border border-border bg-muted/50 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted min-h-9"
              onClick={() => {
                setEmail(DEMO_USER.email);
                setPassword(DEMO_USER.password);
              }}
            >
              Fill {DEMO_USER.app_role}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-medium mb-1.5 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={DEMO_ADMIN.email}
                autoComplete="email"
                className="w-full rounded-md border bg-background px-3 py-2.5 text-sm text-foreground transition-[border-color] shadow-none placeholder:text-muted-foreground focus-visible:border-primary"
                style={{ borderColor: "var(--border)" }}
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium mb-1.5 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full rounded-md border bg-background px-3 py-2.5 text-sm text-foreground transition-[border-color] shadow-none placeholder:text-muted-foreground focus-visible:border-primary"
                style={{ borderColor: "var(--border)" }}
              />
            </div>

            {error ? (
              <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-11 rounded-md py-2.5 text-sm font-semibold tracking-wide transition-opacity disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
              style={{
                background: "var(--gold-gradient)",
                color: "#1a1200",
              }}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div
            className="mt-6 rounded-md border p-3 text-xs leading-relaxed"
            style={{
              borderColor: "var(--border)",
              background: "var(--muted)",
              color: "var(--muted-foreground)",
            }}
          >
            <p className="font-medium text-foreground mb-1">Demo accounts</p>
            <p>
              Run once: <code className="text-[11px] text-foreground">npm run seed:demo-users</code>{" "}
              (needs <code className="text-[11px]">SUPABASE_SERVICE_ROLE_KEY</code> in{" "}
              <code className="text-[11px]">.env.local</code>).
            </p>
            <ul className="mt-2 list-disc pl-4 space-y-0.5">
              <li>
                <strong className="text-foreground">Admin</strong> - {DEMO_ADMIN.email} /{" "}
                <span className="font-mono text-[11px]">{DEMO_ADMIN.password}</span>
              </li>
              <li>
                <strong className="text-foreground">User</strong> - {DEMO_USER.email} /{" "}
                <span className="font-mono text-[11px]">{DEMO_USER.password}</span>
              </li>
            </ul>
          </div>
        </div>

        <p
          className="text-center text-xs mt-6"
          style={{ color: "var(--muted-foreground)" }}
        >
          GLS Techno Thai · Internal portal · Est. 2007
        </p>
      </div>
    </div>
  );
}
