/**
 * @vitest-environment jsdom
 */
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

const reportError = vi.fn();

vi.mock("@/lib/observability/report-error", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

const { ClientErrorObserver } =
  await import("@/components/observability/client-error-observer");

beforeEach(() => {
  reportError.mockReset();
});

describe("ClientErrorObserver", () => {
  it("renders nothing", () => {
    const { container } = render(<ClientErrorObserver />);

    expect(container.firstChild).toBeNull();
  });

  it("reports a window error event", () => {
    render(<ClientErrorObserver />);

    const error = new Error("boom");
    window.dispatchEvent(new ErrorEvent("error", { error, message: "boom" }));

    expect(reportError).toHaveBeenCalledWith(error, "window-error");
  });

  it("reports an unhandled promise rejection", () => {
    render(<ClientErrorObserver />);

    // jsdom's PromiseRejectionEvent needs a real (already-settled) promise.
    const rejected = Promise.reject(new Error("nope"));
    rejected.catch(() => {});
    const event = new PromiseRejectionEvent("unhandledrejection", {
      promise: rejected,
      reason: "nope",
    });
    window.dispatchEvent(event);

    expect(reportError).toHaveBeenCalledWith("nope", "unhandled-rejection");
  });

  it("removes both listeners on unmount", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = render(<ClientErrorObserver />);
    const [, errorHandler] = addSpy.mock.calls.find(
      ([type]) => type === "error",
    )!;
    const [, rejectionHandler] = addSpy.mock.calls.find(
      ([type]) => type === "unhandledrejection",
    )!;

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("error", errorHandler);
    expect(removeSpy).toHaveBeenCalledWith(
      "unhandledrejection",
      rejectionHandler,
    );
  });
});
