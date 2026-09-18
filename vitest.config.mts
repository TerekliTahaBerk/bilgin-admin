import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./src/test/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    env: {
      APP_ORIGIN: "http://localhost:3000",
      BILGIN_API_URL: "http://localhost:8000",
      SESSION_MAX_AGE_SECONDS: "28800",
      SESSION_SECRET: "test-session-secret-that-is-at-least-32-characters-long",
    },
    // Component tests opt into jsdom with a `@vitest-environment` docblock, so
    // the node-based suites stay on the faster node environment.
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      // The E2E target guard is pure logic and is unit tested here; the
      // Playwright specs themselves are matched by *.spec.ts.
      "e2e/support/*.test.ts",
    ],
    exclude: ["src/test/integration/**"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/test/**",
        "src/app/**/layout.tsx",
        "src/app/globals.css",
      ],
    },
  },
});
