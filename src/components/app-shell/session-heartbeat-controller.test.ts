import { describe, expect, it, vi } from "vitest";

import { createSessionHeartbeatController } from "@/components/app-shell/session-heartbeat-controller";

const safeAdmin = {
  id: "admin-id",
  name: "Test Admin",
  email: "admin@example.test",
  role: "content_editor",
  roleLabel: "İçerik Editörü",
  abilities: {
    edit_content: true,
    publish_content: false,
    edit_curriculum: false,
    view_users: false,
  },
};

describe("session heartbeat controller", () => {
  it("deduplicates concurrent checks", async () => {
    let resolveCheck:
      ((value: { ok: true; admin: typeof safeAdmin }) => void) | undefined;
    const checkSession = vi.fn(
      () =>
        new Promise<{ ok: true; admin: typeof safeAdmin }>((resolve) => {
          resolveCheck = resolve;
        }),
    );
    const controller = createSessionHeartbeatController({
      checkSession,
      onAuthenticationFailure: vi.fn(),
    });

    const first = controller.check();
    const second = controller.check();

    expect(first).toBe(second);
    expect(checkSession).toHaveBeenCalledTimes(1);

    resolveCheck?.({ ok: true, admin: safeAdmin });
    await first;
  });

  it("redirects only for authentication failure", async () => {
    const onAuthenticationFailure = vi.fn();
    const authenticationController = createSessionHeartbeatController({
      checkSession: async () => ({
        ok: false,
        error: {
          kind: "authentication",
          status: 401,
          message: "Oturum doğrulanamadı.",
        },
      }),
      onAuthenticationFailure,
    });

    await authenticationController.check();

    expect(onAuthenticationFailure).toHaveBeenCalledTimes(1);
  });

  it.each(["authorization", "network", "server"] as const)(
    "does not redirect for %s failure",
    async (kind) => {
      const onAuthenticationFailure = vi.fn();
      const controller = createSessionHeartbeatController({
        checkSession: async () => ({
          ok: false,
          error: {
            kind,
            status:
              kind === "network" ? null : kind === "authorization" ? 403 : 500,
            message: "Güvenli hata.",
          },
        }),
        onAuthenticationFailure,
      });

      await controller.check();

      expect(onAuthenticationFailure).not.toHaveBeenCalled();
    },
  );

  it("aborts an in-flight check and ignores its result after dispose", async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveCheck:
      | ((value: {
          ok: false;
          error: {
            kind: "authentication";
            status: 401;
            message: string;
          };
        }) => void)
      | undefined;
    const onAuthenticationFailure = vi.fn();
    const controller = createSessionHeartbeatController({
      checkSession: (signal) => {
        capturedSignal = signal;
        return new Promise((resolve) => {
          resolveCheck = resolve;
        });
      },
      onAuthenticationFailure,
    });

    const pending = controller.check();
    controller.dispose();

    expect(capturedSignal?.aborted).toBe(true);
    resolveCheck?.({
      ok: false,
      error: {
        kind: "authentication",
        status: 401,
        message: "Oturum doğrulanamadı.",
      },
    });
    await pending;
    expect(onAuthenticationFailure).not.toHaveBeenCalled();
    await expect(controller.check()).resolves.toBeUndefined();
  });
});
