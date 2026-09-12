import { test, expect } from "@playwright/test";

// All auth tests run logged-OUT (no stored session).
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Auth", () => {
  test("unauthenticated user is redirected from /dashboard to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("unauthenticated user is redirected from /transactions to /login", async ({ page }) => {
    await page.goto("/transactions");
    await expect(page).toHaveURL(/\/login/);
  });

  test("'Fill admin' populates the admin email", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Fill admin" }).click();
    await expect(page.locator('input[type="email"]')).toHaveValue("admin@gls-plus.local");
  });

  test("'Fill user' populates the staff email", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Fill user" }).click();
    await expect(page.locator('input[type="email"]')).toHaveValue("user@gls-plus.local");
  });

  test("empty submit does not log in", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("wrong password shows an error and stays on /login", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill("admin@gls-plus.local");
    await page.locator('input[type="password"]').fill("definitely-wrong");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/invalid|failed|incorrect|wrong|credential/i)).toBeVisible();
  });

  test("non-existent account shows an error", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill("nobody-here@gls-plus.local");
    await page.locator('input[type="password"]').fill("Whatever123!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/invalid|failed|incorrect|wrong|credential/i)).toBeVisible();
  });

  test("valid admin login reaches the dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill("admin@gls-plus.local");
    await page.locator('input[type="password"]').fill("GlsAdmin!2026");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard", { timeout: 20_000 });
    await expect(page.getByText("Two independent ledgers")).toBeVisible();
  });

  test("staff user can also log in", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill("user@gls-plus.local");
    await page.locator('input[type="password"]').fill("GlsUser!2026");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard", { timeout: 20_000 });
    await expect(page.getByText("Two independent ledgers")).toBeVisible();
  });

  test("session persists across a page navigation", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill("admin@gls-plus.local");
    await page.locator('input[type="password"]').fill("GlsAdmin!2026");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard");
    await page.goto("/transactions");
    await expect(page).toHaveURL(/\/transactions/);
    await expect(page.getByRole("columnheader", { name: "Invoice #" })).toBeVisible();
  });
});
