import { BottomTabBar } from "@/components/layout/BottomTabBar";
import { AppCommandPalette } from "@/components/layout/AppCommandPalette";
import { Sidebar } from "@/components/layout/Sidebar";
import { TableCardLabels } from "@/components/layout/TableCardLabels";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppCommandPalette />
        {children}
        <BottomTabBar />
        <TableCardLabels />
      </div>
    </div>
  );
}
