import { test, expect } from "@playwright/test";

test.describe("Dashboard (two-ledger)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
  });

  test("renders both book cards, reconciliation and year selector", async ({ page }) => {
    await expect(page.getByText("Unofficial - Real Vault")).toBeVisible();
    await expect(page.getByText("Official - Declared Book")).toBeVisible();
    await expect(page.getByText("Reconciliation - real vs declared")).toBeVisible();
    await expect(page.getByRole("button", { name: "2025", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "2026", exact: true })).toBeVisible();
  });

  test("defaults to the current year (2026)", async ({ page }) => {
    await expect(page.getByText("418 txns · 2026")).toBeVisible();
  });

  test("the unofficial (real vault) book is empty", async ({ page }) => {
    await expect(page.getByText(/No transactions in this book/)).toBeVisible();
  });

  test("2025 official figures match the sheet", async ({ page }) => {
    await page.getByRole("button", { name: "2025", exact: true }).click();
    await expect(page.getByText("513 txns · 2025")).toBeVisible();
    await expect(page.getByText("624.898 g").first()).toBeVisible(); // current stock
    await expect(page.getByText("82,308.33 g").first()).toBeVisible(); // bought
    await expect(page.getByText("84,014.76 g").first()).toBeVisible(); // sold
  });

  test("2026 official shows the negative (oversold) stock", async ({ page }) => {
    await page.getByRole("button", { name: "2026", exact: true }).click();
    await expect(page.getByText("418 txns · 2026")).toBeVisible();
    await expect(page.getByText("-234.222 g").first()).toBeVisible();
    await expect(page.getByText("65,172.72 g").first()).toBeVisible(); // bought
    await expect(page.getByText("66,031.84 g").first()).toBeVisible(); // sold
  });

  test("reconciliation panel shows real vs declared", async ({ page }) => {
    await page.getByRole("button", { name: "2025", exact: true }).click();
    await expect(page.getByText("Real stock (unofficial)")).toBeVisible();
    await expect(page.getByText("Declared stock (official)")).toBeVisible();
    await expect(page.getByText("Stock variance")).toBeVisible();
    await expect(page.getByText(/never summed/i)).toBeVisible();
  });

  test("recent transactions table renders rows", async ({ page }) => {
    await expect(page.getByText(/Recent transactions/)).toBeVisible();
    await expect(page.locator("table tbody tr").first()).toBeVisible();
  });

  test("switching years updates the transaction count", async ({ page }) => {
    await page.getByRole("button", { name: "2025", exact: true }).click();
    await expect(page.getByText("513 txns · 2025")).toBeVisible();
    await page.getByRole("button", { name: "2026", exact: true }).click();
    await expect(page.getByText("418 txns · 2026")).toBeVisible();
  });
});
