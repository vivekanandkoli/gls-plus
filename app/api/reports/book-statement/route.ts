import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth-server";
import { buildBookStatement } from "@/lib/report-service";
import type { Book } from "@/lib/opening-balances";

export const dynamic = "force-dynamic";

const BOOKS = ["official", "unofficial"] as const;

// GET /api/reports/book-statement?book=official&from=2026-01-01&to=2026-12-31
export async function GET(req: Request) {
  const user = await requireAppUser();
  if (user instanceof NextResponse) return user;

  const { searchParams } = new URL(req.url);
  const bookParam = searchParams.get("book");
  const book = BOOKS.includes(bookParam as Book) ? (bookParam as Book) : "official";
  const from = searchParams.get("from") ?? `${new Date().getFullYear()}-01-01`;
  const to = searchParams.get("to") ?? `${new Date().getFullYear()}-12-31`;

  // Only admins may view the unofficial (real vault) book.
  if (book === "unofficial" && user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const statement = await buildBookStatement(book, from, to);
    return NextResponse.json(statement);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to build statement";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
