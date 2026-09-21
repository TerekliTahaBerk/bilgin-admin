/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

const reportError = vi.fn();

vi.mock("@/lib/observability/report-error", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

const PanelError = (await import("@/app/(panel)/error")).default;

beforeEach(() => {
  reportError.mockReset();
});

describe("PanelError", () => {
  it("reports the caught error with its digest", () => {
    const error = Object.assign(new Error("boom"), { digest: "abc123" });

    render(<PanelError error={error} reset={() => {}} />);

    expect(reportError).toHaveBeenCalledWith(error, "panel-error-boundary", {
      digest: "abc123",
    });
  });

  it("shows a safe, generic message — never the raw error", () => {
    const error = new Error(
      "SQLSTATE[HY000] connection refused at /var/www/app.php:42",
    );

    render(<PanelError error={error} reset={() => {}} />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Bir şeyler ters gitti");
    expect(alert.textContent).not.toContain("SQLSTATE");
    expect(alert.textContent).not.toContain("/var/www");
  });

  it("calls reset when the retry button is pressed", async () => {
    const reset = vi.fn();
    const user = userEvent.setup();
    render(<PanelError error={new Error("boom")} reset={reset} />);

    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
