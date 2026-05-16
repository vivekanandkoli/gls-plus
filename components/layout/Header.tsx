export function Header({ title }: { title: string }) {
  return (
    <header className="flex h-16 items-center justify-between border-b px-4 md:px-6"
      style={{ background: "var(--background)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-3">
        {/* Gold left-accent bar */}
        <span
          className="h-6 w-0.5 rounded-full shrink-0"
          style={{ background: "var(--gold-gradient)" }}
          aria-hidden="true"
        />
        <h1 className="text-xl font-semibold tracking-wide" style={{ fontFamily: "var(--font-heading)" }}>
          {title}
        </h1>
      </div>

      {/* Right badge */}
      <span
        className="hidden sm:inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-widest"
        style={{
          background: "var(--sidebar)",
          color: "#c9a227",
          border: "1px solid rgba(201,162,39,0.3)",
          letterSpacing: "0.12em",
        }}
      >
        GLS+
      </span>
    </header>
  );
}
