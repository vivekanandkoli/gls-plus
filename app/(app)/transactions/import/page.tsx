"use client";

import Link from "next/link";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";

export default function ImportPage() {
  return (
    <PageWrapper title="Import from Excel" description="Bulk import of historical transactions.">
      <div className="max-w-xl rounded-lg border border-amber-400 bg-amber-50/40 p-5 dark:bg-amber-950/10">
        <h2 className="mb-2 text-base font-medium">Temporarily unavailable</h2>
        <p className="mb-2 text-sm text-muted-foreground">
          The Excel importer is being rebuilt for the new two-book model (it needs to
          route each row into the official or unofficial book and recompute per-book
          WAC). It&apos;s disabled until that conversion is done, to avoid corrupting
          the ledger.
        </p>
        <p className="mb-4 text-sm text-muted-foreground">
          In the meantime, add transactions individually, or ask to have your existing
          data copied in.
        </p>
        <Button asChild>
          <Link href="/transactions/new">Add a transaction</Link>
        </Button>
      </div>
    </PageWrapper>
  );
}
