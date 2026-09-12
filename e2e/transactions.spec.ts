import { test, expect } from "@playwright/test";

const totalText = /of\s+931\s+transactions/;

test.describe("Transactions list", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/transactions");
  });

  test("loads with headers, rows and the total count (931)", async ({ page }) => {
    await expect(page.getByRole("columnheader", { name: "Invoice #" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Profit" })).toBeVisible();
    await expect(page.locator("table tbody tr").first()).toBeVisible();
    await expect(page.getByText(totalText)).toBeVisible();
  });

  test("book filter: Official = 931, Unofficial = empty", async ({ page }) => {
    await page.getByRole("button", { name: "Official", exact: true }).click();
    await expect(page.getByText(totalText)).toBeVisible();
    await page.getByRole("button", { name: "Unofficial", exact: true }).click();
    await expect(page.getByText("No transactions match these filters.")).toBeVisible();
    await expect(page.getByText(/of\s+0\s+transactions/)).toBeVisible();
  });

  test("type filter: Buy = 204 (no SELL rows)", async ({ page }) => {
    await page.getByRole("button", { name: "Buy", exact: true }).click();
    await expect(page.getByText(/of\s+204\s+transactions/)).toBeVisible();
    await expect(page.locator("table tbody").getByText("SELL")).toHaveCount(0);
  });

  test("type filter: Sell = 727 (no BUY rows)", async ({ page }) => {
    await page.getByRole("button", { name: "Sell", exact: true }).click();
    await expect(page.getByText(/of\s+727\s+transactions/)).toBeVisible();
    await expect(page.locator("table tbody").getByText("BUY")).toHaveCount(0);
  });

  test("year filter: 2025 = 513, 2026 = 418", async ({ page }) => {
    await page.locator("select").selectOption("2025");
    await expect(page.getByText(/of\s+513\s+transactions/)).toBeVisible();
    await page.locator("select").selectOption("2026");
    await expect(page.getByText(/of\s+418\s+transactions/)).toBeVisible();
  });

  test("combined filters: Buy + 2026 = 97", async ({ page }) => {
    await page.getByRole("button", { name: "Buy", exact: true }).click();
    await page.locator("select").selectOption("2026");
    await expect(page.getByText(/of\s+97\s+transactions/)).toBeVisible();
  });

  test("search by invoice returns exactly one row", async ({ page }) => {
    await page.getByPlaceholder("Search invoice or client…").fill("UP260911001");
    await expect(page.getByText(/of\s+1\s+transactions/)).toBeVisible();
    await expect(page.locator("table tbody tr")).toHaveCount(1);
    await expect(page.getByText("UP260911001")).toBeVisible();
  });

  test("search by client name (Oriantal) returns 169", async ({ page }) => {
    await page.getByPlaceholder("Search invoice or client…").fill("Oriantal");
    await expect(page.getByText(/of\s+169\s+transactions/)).toBeVisible();
  });

  test("search with no matches shows the empty state", async ({ page }) => {
    await page.getByPlaceholder("Search invoice or client…").fill("ZZZ-NO-SUCH-INVOICE");
    await expect(page.getByText("No transactions match these filters.")).toBeVisible();
    await expect(page.getByText(/of\s+0\s+transactions/)).toBeVisible();
  });

  test("pagination: 19 pages, Prev disabled on page 1, advances and returns", async ({ page }) => {
    await expect(page.getByText(totalText)).toBeVisible();
    await expect(page.getByText("Page 1 / 19")).toBeVisible();
    await expect(page.getByRole("button", { name: "Prev" })).toBeDisabled();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByText("Page 2 / 19")).toBeVisible();
    await expect(page.getByRole("button", { name: "Prev" })).toBeEnabled();
    await page.getByRole("button", { name: "Prev" }).click();
    await expect(page.getByText("Page 1 / 19")).toBeVisible();
  });

  test("changing a filter resets to page 1", async ({ page }) => {
    await expect(page.getByText(totalText)).toBeVisible();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByText("Page 2 / 19")).toBeVisible();
    await page.getByRole("button", { name: "Buy", exact: true }).click();
    await expect(page.getByText(/Page 1 \//)).toBeVisible();
  });

  test("profit column: a SELL row shows a ฿ profit value", async ({ page }) => {
    await page.getByRole("button", { name: "Sell", exact: true }).click();
    await expect(page.locator("table tbody tr").first()).toBeVisible();
    const profitCell = page.locator("table tbody tr").first().locator("td").nth(8);
    await expect(profitCell).toContainText("฿");
  });
});
