import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests for GLS Plus. Requires the app running on localhost:3000 with the
 * local Supabase stack up and demo users seeded (npm run seed:demo-users).
 * Run:  npm run test:e2e
 */
const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // SLOWMO=<ms> slows each action so a headed run is watchable (see test:e2e:headed)
    launchOptions: { slowMo: Number(process.env.SLOWMO) || 0 },
  },
  projects: [
    // 1) log in once, save the session
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    // 2) authenticated feature tests reuse that session
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/admin.json" },
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
    },
  ],
  // The dev server must already be running (npm run dev) with local Supabase up.
});
