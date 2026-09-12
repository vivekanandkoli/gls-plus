import { test as setup, expect } from "@playwright/test";

/**
 * Logs in as the demo admin once and saves the session so feature specs run
 * authenticated. Doubles as the happy-path login test.
 */
const authFile = "e2e/.auth/admin.json";
const EMAIL = process.env.E2E_EMAIL || "admin@gls-plus.local";
const PASSWORD = process.env.E2E_PASSWORD || "GlsAdmin!2026";

setup("authenticate as admin", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Successful login lands on the dashboard.
  await page.waitForURL("**/dashboard", { timeout: 20_000 });
  await expect(page.getByText("Two independent ledgers")).toBeVisible();

  await page.context().storageState({ path: authFile });
});
