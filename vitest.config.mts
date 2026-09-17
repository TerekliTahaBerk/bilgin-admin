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
    include: ["src/**/*.test.ts"],
  },
});
