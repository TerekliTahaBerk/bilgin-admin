import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library's auto-cleanup only runs with Vitest globals enabled, which
// this project does not use — unmount explicitly so no DOM or React state
// leaks between tests.
afterEach(() => {
  cleanup();
});
