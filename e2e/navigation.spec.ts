import { test, expect } from "@playwright/test";

test.describe("Navigation / app shell", () => {
  const NAV = ["Dashboard", "Transactions", "Deals", "Invoices", "Clients", "Reports", "Settings"];

  test("sidebar shows all primary nav links", async ({ page }) => {
    await page.goto("/dashboard");
    for (const label of NAV) {
      await expect(page.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
  });

  test("clicking Transactions navigates to the list", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "Transactions", exact: true }).click();
    await expect(page).toHaveURL(/\/transactions/);
    await expect(page.getByRole("columnheader", { name: "Invoice #" })).toBeVisible();
  });

  test("dashboard 'View all' links to transactions", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "View all" }).click();
    await expect(page).toHaveURL(/\/transactions/);
  });

  test("the signed-in admin email is shown in the header", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("admin@gls-plus.local")).toBeVisible();
  });
});
