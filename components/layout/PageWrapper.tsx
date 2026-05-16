import { Header } from "@/components/layout/Header";

export function PageWrapper({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full bg-background">
      <main className="flex flex-1 flex-col">
        <Header title={title} />
        <div className="flex-1 p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}

