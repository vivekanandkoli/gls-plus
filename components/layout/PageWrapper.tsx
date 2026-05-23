import { Header } from "@/components/layout/Header";

export function PageWrapper({
  title,
  description,
  children,
}: {
  title: string;
  /** One line of context under the title (dashboards, reports). */
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full bg-background">
      <main className="flex flex-1 flex-col outline-none">
        <a
          href="#page-body"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-md"
        >
          Skip to content
        </a>
        <Header title={title} description={description} />
        <div
          id="page-body"
          tabIndex={-1}
          className="app-content flex-1 px-4 py-6 md:px-6 md:py-8 lg:px-8 outline-none"
        >
          {children}
        </div>
      </main>
    </div>
  );
}
