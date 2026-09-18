import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";

/**
 * Node-only MSW server. There is no browser service worker in this project.
 *
 * `onUnhandledRequest: "error"` is the safety gate: any request the integration
 * suite makes to a host other than an explicitly declared fake backend route
 * fails the test instead of reaching the network.
 */
export const mswServer = setupServer();

beforeAll(() => {
  mswServer.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  mswServer.resetHandlers();
});

afterAll(() => {
  mswServer.close();
});
