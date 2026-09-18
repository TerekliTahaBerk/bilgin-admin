/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import type { ApiError } from "@/lib/api/error";
import type { SessionClientResult } from "@/features/auth/session-client";

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

const loginSession = vi.fn<(input: unknown) => Promise<SessionClientResult>>();

vi.mock("@/features/auth/session-client", () => ({
  loginSession: (input: unknown) => loginSession(input),
}));

const { LoginForm } = await import("@/features/auth/login-form");

const admin = {
  id: "admin-id",
  name: "Test Admin",
  email: "editor@example.test",
  role: "content_editor",
  roleLabel: "İçerik Editörü",
  abilities: {
    edit_content: true,
    publish_content: false,
    edit_curriculum: false,
    view_users: false,
  },
};

function failure(error: ApiError): SessionClientResult {
  return { ok: false, error };
}

async function fillCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("E-posta"), "editor@example.test");
  await user.type(screen.getByLabelText("Şifre"), "correct-horse-battery");
}

function submitButton() {
  return screen.getByRole("button", { name: /giriş/i });
}

describe("LoginForm native fallback semantics", () => {
  it("submits natively with POST so credentials can never reach the URL", () => {
    const { container } = render(<LoginForm />);
    const form = container.querySelector("form");

    expect(form).not.toBeNull();
    // A form without an explicit method defaults to GET, which would put the
    // password in the query string on a pre-hydration submit.
    expect(form!.getAttribute("method")).toBe("post");
    expect(form!.getAttribute("action")).toBe("/login");
  });
});

describe("LoginForm client validation", () => {
  beforeEach(() => {
    loginSession.mockReset();
    replace.mockReset();
    refresh.mockReset();
  });

  it("blocks submit and reports an invalid email", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("E-posta"), "not-an-email");
    await user.type(screen.getByLabelText("Şifre"), "some-password");
    await user.click(submitButton());

    expect(
      await screen.findByText("Geçerli bir e-posta adresi girin."),
    ).toBeDefined();
    expect(loginSession).not.toHaveBeenCalled();
  });

  it("blocks submit on an empty password", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("E-posta"), "editor@example.test");
    await user.click(submitButton());

    await waitFor(() => {
      expect(screen.getByLabelText("Şifre").getAttribute("aria-invalid")).toBe(
        "true",
      );
    });
    expect(loginSession).not.toHaveBeenCalled();
  });
});

describe("LoginForm submission", () => {
  beforeEach(() => {
    loginSession.mockReset();
    replace.mockReset();
    refresh.mockReset();
  });

  it("calls loginSession exactly once and navigates on success", async () => {
    loginSession.mockResolvedValue({ ok: true, admin });
    const user = userEvent.setup();
    render(<LoginForm />);

    await fillCredentials(user);
    await user.click(submitButton());

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/");
    });
    expect(loginSession).toHaveBeenCalledTimes(1);
    expect(loginSession).toHaveBeenCalledWith({
      email: "editor@example.test",
      password: "correct-horse-battery",
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not issue a second request while one is pending", async () => {
    let resolveLogin: ((result: SessionClientResult) => void) | undefined;
    loginSession.mockImplementation(
      () =>
        new Promise<SessionClientResult>((resolve) => {
          resolveLogin = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<LoginForm />);

    await fillCredentials(user);
    await user.click(submitButton());

    await waitFor(() => {
      expect(submitButton().hasAttribute("disabled")).toBe(true);
    });

    await user.click(submitButton());
    await user.click(submitButton());

    expect(loginSession).toHaveBeenCalledTimes(1);

    resolveLogin?.({ ok: true, admin });
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/");
    });
  });
});

describe("LoginForm server errors", () => {
  beforeEach(() => {
    loginSession.mockReset();
    replace.mockReset();
    refresh.mockReset();
  });

  it("shows a backend email field error", async () => {
    loginSession.mockResolvedValue(
      failure({
        kind: "validation",
        status: 422,
        message: "Girdiğiniz bilgiler geçersiz.",
        fields: { email: ["E-posta veya şifre hatalı."] },
      }),
    );
    const user = userEvent.setup();
    render(<LoginForm />);

    await fillCredentials(user);
    await user.click(submitButton());

    expect(await screen.findByText("E-posta veya şifre hatalı.")).toBeDefined();
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows a backend password field error", async () => {
    loginSession.mockResolvedValue(
      failure({
        kind: "validation",
        status: 422,
        message: "Girdiğiniz bilgiler geçersiz.",
        fields: { password: ["Şifre en az 12 karakter olmalı."] },
      }),
    );
    const user = userEvent.setup();
    render(<LoginForm />);

    await fillCredentials(user);
    await user.click(submitButton());

    expect(
      await screen.findByText("Şifre en az 12 karakter olmalı."),
    ).toBeDefined();
  });

  it("shows a safe rate limit message", async () => {
    loginSession.mockResolvedValue(
      failure({
        kind: "rate_limit",
        status: 429,
        message: "Çok fazla deneme yaptınız.",
      }),
    );
    const user = userEvent.setup();
    render(<LoginForm />);

    await fillCredentials(user);
    await user.click(submitButton());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Çok fazla deneme yaptınız.");
  });

  it("includes the retry delay when the backend sends Retry-After", async () => {
    loginSession.mockResolvedValue(
      failure({
        kind: "rate_limit",
        status: 429,
        message: "Çok fazla deneme yaptınız.",
        retryAfterSeconds: 60,
      }),
    );
    const user = userEvent.setup();
    render(<LoginForm />);

    await fillCredentials(user);
    await user.click(submitButton());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("60 saniye");
  });

  it("never renders a raw exception for a network failure", async () => {
    loginSession.mockResolvedValue(
      failure({
        kind: "network",
        status: null,
        message: "Oturum servisine ulaşılamadı. Lütfen tekrar deneyin.",
      }),
    );
    const user = userEvent.setup();
    render(<LoginForm />);

    await fillCredentials(user);
    await user.click(submitButton());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "Oturum servisine ulaşılamadı. Lütfen tekrar deneyin.",
    );
    expect(document.body.textContent).not.toMatch(
      /TypeError|fetch failed|stack|Error:/i,
    );
  });

  it.each(["network", "server", "protocol", "contract"] as const)(
    "clears the password field after a %s failure",
    async (kind) => {
      loginSession.mockResolvedValue(
        failure({ kind, status: null, message: "Bir hata oluştu." }),
      );
      const user = userEvent.setup();
      render(<LoginForm />);

      await fillCredentials(user);
      await user.click(submitButton());

      await waitFor(() => {
        expect((screen.getByLabelText("Şifre") as HTMLInputElement).value).toBe(
          "",
        );
      });
      expect((screen.getByLabelText("E-posta") as HTMLInputElement).value).toBe(
        "editor@example.test",
      );
    },
  );
});
