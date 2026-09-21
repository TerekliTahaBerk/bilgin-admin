/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import type { SessionLogoutResult } from "@/features/auth/session-client";

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

const logoutSession = vi.fn<() => Promise<SessionLogoutResult>>();

vi.mock("@/features/auth/session-client", () => ({
  logoutSession: () => logoutSession(),
}));

const { LogoutButton } = await import("@/components/app-shell/logout-button");

function logoutButton() {
  return screen.getByRole("button", { name: /çıkış/i });
}

describe("LogoutButton", () => {
  beforeEach(() => {
    logoutSession.mockReset();
    replace.mockReset();
    refresh.mockReset();
  });

  it("calls the shared logoutSession helper on click", async () => {
    logoutSession.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<LogoutButton />);

    await user.click(logoutButton());

    await waitFor(() => {
      expect(logoutSession).toHaveBeenCalledTimes(1);
    });
  });

  it("disables the button while the request is pending", async () => {
    let resolveLogout: ((result: SessionLogoutResult) => void) | undefined;
    logoutSession.mockImplementation(
      () =>
        new Promise<SessionLogoutResult>((resolve) => {
          resolveLogout = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<LogoutButton />);

    await user.click(logoutButton());

    await waitFor(() => {
      expect(logoutButton().hasAttribute("disabled")).toBe(true);
    });
    expect(logoutButton().getAttribute("aria-busy")).toBe("true");

    resolveLogout?.({ ok: true });
  });

  it("does not issue a second request on a duplicate click", async () => {
    let resolveLogout: ((result: SessionLogoutResult) => void) | undefined;
    logoutSession.mockImplementation(
      () =>
        new Promise<SessionLogoutResult>((resolve) => {
          resolveLogout = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<LogoutButton />);

    await user.click(logoutButton());
    await user.click(logoutButton());
    await user.click(logoutButton());

    expect(logoutSession).toHaveBeenCalledTimes(1);

    resolveLogout?.({ ok: true });
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/login");
    });
  });

  it("redirects to the login page and refreshes on success", async () => {
    logoutSession.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<LogoutButton />);

    await user.click(logoutButton());

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/login");
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows a safe message and leaks no backend detail on failure", async () => {
    logoutSession.mockResolvedValue({
      ok: false,
      error: {
        kind: "server",
        status: 500,
        code: "INTERNAL",
        message: "SQLSTATE[HY000] connection refused at /var/www/app.php:42",
      },
    });
    const user = userEvent.setup();
    render(<LogoutButton />);

    await user.click(logoutButton());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Çıkış yapılamadı. Lütfen tekrar deneyin.");
    expect(document.body.textContent).not.toContain("SQLSTATE");
    expect(document.body.textContent).not.toContain("/var/www");
    expect(replace).not.toHaveBeenCalled();
  });

  it("re-enables the button after a failure so the user can retry", async () => {
    logoutSession.mockResolvedValue({
      ok: false,
      error: { kind: "network", status: null, message: "offline" },
    });
    const user = userEvent.setup();
    render(<LogoutButton />);

    await user.click(logoutButton());

    await waitFor(() => {
      expect(logoutButton().hasAttribute("disabled")).toBe(false);
    });
  });

  it("shows no local-only disclaimer by default", () => {
    render(<LogoutButton />);

    expect(screen.queryByText(/yalnızca bu cihazdaki oturumu/)).toBeNull();
  });

  it("shows the local-only disclaimer when hint is requested", () => {
    render(<LogoutButton hint />);

    expect(
      screen.getByText(/yalnızca bu cihazdaki oturumu kapatır/),
    ).toBeDefined();
  });
});
