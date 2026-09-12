import { test, expect } from "@playwright/test";

test.describe("API /api/dashboard/overview", () => {
  test("default returns both books and the years list", async ({ request }) => {
    const res = await request.get("/api/dashboard/overview");
    expect(res.ok()).toBeTruthy();
    const b = await res.json();
    expect(b.books.official).toBeTruthy();
    expect(b.books.unofficial).toBeTruthy();
    expect(b.years).toEqual(expect.arrayContaining([2025, 2026]));
  });

  test("2025 official reconciles (513 txns, stock 624.898)", async ({ request }) => {
    const b = await (await request.get("/api/dashboard/overview?year=2025")).json();
    expect(b.books.official.txnCount).toBe(513);
    expect(b.books.official.stockGm).toBeCloseTo(624.898, 2);
    expect(b.books.official.buyWeight).toBeCloseTo(82308.33, 1);
    expect(b.books.official.sellWeight).toBeCloseTo(84014.76, 1);
  });

  test("2026 official is oversold (418 txns, stock -234.222); unofficial empty", async ({ request }) => {
    const b = await (await request.get("/api/dashboard/overview?year=2026")).json();
    expect(b.books.official.txnCount).toBe(418);
    expect(b.books.official.stockGm).toBeCloseTo(-234.222, 2);
    expect(b.books.unofficial.txnCount).toBe(0);
  });

  test("a year with no data returns zeroed books", async ({ request }) => {
    const b = await (await request.get("/api/dashboard/overview?year=1999")).json();
    expect(b.books.official.txnCount).toBe(0);
    expect(b.books.official.buyWeight).toBe(0);
    expect(b.books.official.stockGm).toBe(0);
  });

  test("recent transactions are scoped to the selected year", async ({ request }) => {
    const b = await (await request.get("/api/dashboard/overview?year=2025")).json();
    expect(Array.isArray(b.recent)).toBeTruthy();
    for (const r of b.recent) expect(new Date(r.date).getUTCFullYear()).toBe(2025);
  });
});

test.describe("API /api/dashboard/overview — auth", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("anonymous requests are redirected to login (not served data)", async ({ request }) => {
    const res = await request.get("/api/dashboard/overview", { maxRedirects: 0 });
    expect(res.status()).toBeGreaterThanOrEqual(300);
    expect(res.status()).toBeLessThan(400);
    expect(res.headers()["location"] ?? "").toContain("/login");
  });
});
