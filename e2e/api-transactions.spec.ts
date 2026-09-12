import { test, expect } from "@playwright/test";

const get = (request: import("@playwright/test").APIRequestContext, qs: string) =>
  request.get(`/api/transactions/list${qs}`).then((r) => r.json());

test.describe("API /api/transactions/list", () => {
  test("default: total 931, first page 50 rows, years listed", async ({ request }) => {
    const b = await get(request, "");
    expect(b.total).toBe(931);
    expect(b.rows.length).toBe(50);
    expect(b.page).toBe(1);
    expect(b.years).toEqual(expect.arrayContaining([2025, 2026]));
  });

  test("book filter", async ({ request }) => {
    expect((await get(request, "?book=official")).total).toBe(931);
    expect((await get(request, "?book=unofficial")).total).toBe(0);
  });

  test("type filter", async ({ request }) => {
    expect((await get(request, "?type=BUY")).total).toBe(204);
    expect((await get(request, "?type=SELL")).total).toBe(727);
  });

  test("year filter", async ({ request }) => {
    expect((await get(request, "?year=2025")).total).toBe(513);
    expect((await get(request, "?year=2026")).total).toBe(418);
  });

  test("combined filters (official + BUY + 2026 = 97)", async ({ request }) => {
    expect((await get(request, "?book=official&type=BUY&year=2026")).total).toBe(97);
  });

  test("search by invoice returns one row", async ({ request }) => {
    const b = await get(request, "?q=UP260911001");
    expect(b.total).toBe(1);
    expect(b.rows[0].invoice_number).toBe("UP260911001");
  });

  test("search by client name (Oriantal) returns 169", async ({ request }) => {
    expect((await get(request, "?q=Oriantal")).total).toBe(169);
  });

  test("search with no matches returns 0", async ({ request }) => {
    expect((await get(request, "?q=ZZZ-NO-SUCH-INVOICE")).total).toBe(0);
  });

  test("pageSize is clamped to 200", async ({ request }) => {
    const b = await get(request, "?pageSize=1000");
    expect(b.pageSize).toBe(200);
    expect(b.rows.length).toBeLessThanOrEqual(200);
  });

  test("page 2 returns different rows than page 1", async ({ request }) => {
    const p1 = await get(request, "?page=1");
    const p2 = await get(request, "?page=2");
    expect(p1.rows[0].id).not.toBe(p2.rows[0].id);
  });

  test("an invalid book value falls back to all", async ({ request }) => {
    expect((await get(request, "?book=bogus")).total).toBe(931);
  });

  test("rows are sorted newest-first", async ({ request }) => {
    const b = await get(request, "");
    const dates = b.rows.map((r: { date: string }) => r.date);
    const sorted = [...dates].sort().reverse();
    expect(dates).toEqual(sorted);
  });

  test("SELL rows carry a persisted profit_loss", async ({ request }) => {
    const b = await get(request, "?type=SELL");
    const withProfit = b.rows.filter((r: { profit_loss: number | null }) => r.profit_loss !== null);
    expect(withProfit.length).toBeGreaterThan(0);
  });
});

test.describe("API /api/transactions/list — auth", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("anonymous requests are redirected to login (not served data)", async ({ request }) => {
    const res = await request.get("/api/transactions/list", { maxRedirects: 0 });
    expect(res.status()).toBeGreaterThanOrEqual(300);
    expect(res.status()).toBeLessThan(400);
    expect(res.headers()["location"] ?? "").toContain("/login");
  });
});
