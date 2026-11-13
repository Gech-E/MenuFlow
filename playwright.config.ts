import { defineConfig } from "@playwright/test";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
export default defineConfig({
  testDir: "./tests/e2e", timeout: 120_000, expect: { timeout: 15_000 }, workers: 1,
  retries: 0, reporter: "list",
  use: { baseURL, browserName: "chromium", channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port " + (new URL(baseURL).port || "3000"),
    url: baseURL, timeout: 60_000, reuseExistingServer: !process.env.CI,
    env: { APP_ORIGIN: baseURL },
  },
});
