import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Integration suite: Route Handlers run against the real transport, session
 * and contract code. Only the Laravel origin is faked, by MSW.
 */
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
      APP_ORIGIN: "https://admin.test",
      BILGIN_API_URL: "https://backend.test",
      SESSION_MAX_AGE_SECONDS: "28800",
      SESSION_SECRET: "test-session-secret-that-is-at-least-32-characters-long",
    },
    include: ["src/test/integration/**/*.integration.test.ts"],
    setupFiles: ["src/test/integration/msw-server.ts"],
    restoreMocks: true,
    // Route Handlers read module-level env; one file per worker keeps that
    // state isolated.
    fileParallelism: false,
  },
});
