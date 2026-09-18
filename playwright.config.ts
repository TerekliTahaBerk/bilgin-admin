import { defineConfig, devices } from "@playwright/test";

import {
  E2E_APP_PORT,
  E2E_BASE_URL,
  E2E_MOCK_BACKEND_PORT,
  E2E_SESSION_SECRET,
} from "./e2e/support/fixtures";
import { assertLocalE2eTarget } from "./e2e/support/target-guard";

// Fail before a single browser starts if this suite is aimed anywhere but a
// loopback host. The auth smoke suite mutates session state.
const baseURL = assertLocalE2eTarget(process.env.E2E_BASE_URL ?? E2E_BASE_URL);

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "node e2e/support/mock-backend.mjs",
      url: `http://127.0.0.1:${E2E_MOCK_BACKEND_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      timeout: 30_000,
    },
    {
      // The dev server is used on purpose: the production env schema rejects
      // http:// origins, and weakening that rule to simplify E2E would remove
      // a real production guarantee.
      command: `next dev --port ${E2E_APP_PORT}`,
      url: `${E2E_BASE_URL}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        APP_ORIGIN: E2E_BASE_URL,
        BILGIN_API_URL: `http://127.0.0.1:${E2E_MOCK_BACKEND_PORT}`,
        SESSION_SECRET: E2E_SESSION_SECRET,
        SESSION_MAX_AGE_SECONDS: "28800",
      },
    },
  ],
});
