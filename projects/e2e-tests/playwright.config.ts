import { defineConfig, devices } from "@playwright/test";

// noinspection JSUnusedGlobalSymbols -- consumed by Playwright runner at startup
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    locale: "en-US",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "echo 'Expecting `make dev` to be running (Next :3000 + Spring :8080)'",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 5_000,
  },
});