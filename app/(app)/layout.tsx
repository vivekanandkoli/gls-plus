import { MobileNav } from "@/components/layout/MobileNav";
import { AppCommandPalette } from "@/components/layout/AppCommandPalette";
import { Sidebar } from "@/components/layout/Sidebar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav />
        <AppCommandPalette />
        {children}
      </div>
    </div>
  );
}
