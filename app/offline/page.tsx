import Image from "next/image";

export const metadata = { title: "Offline - GLS Plus" };

/** Shown by the service worker when a page is opened with no network. */
export default function OfflinePage() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center"
      style={{ background: "var(--background)" }}
    >
      <Image
        src="/logo-gls-transparent.png"
        alt="GLS Plus"
        width={64}
        height={64}
        className="h-16 w-16 object-contain opacity-80"
      />
      <h1 className="text-lg font-semibold" style={{ color: "var(--card-foreground)" }}>
        You&apos;re offline
      </h1>
      <p className="max-w-xs text-sm" style={{ color: "var(--muted-foreground)" }}>
        GLS Plus needs an internet connection to load your data. Check your
        connection and try again.
      </p>
    </div>
  );
}
