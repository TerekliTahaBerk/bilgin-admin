/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import type {
  AdminAccountsData,
  UpdateAdminRequest,
} from "@/contracts/admin/workflows";
import {
  AdminAccountCard,
  adminUpdateErrorMessage,
} from "@/features/workflows/admin-account-card";
import {
  ADMIN_NOW,
  adminAccount,
  adminRoles,
  daysAgo,
} from "@/test/fixtures/admins";

const me = adminAccount({
  id: "me",
  name: "Ben",
  email: "me@bilgin.test",
  role: "super_admin",
  last_login_at: daysAgo(0),
});
const otherSuper = adminAccount({
  id: "other-super",
  name: "İkinci Süper",
  role: "super_admin",
  last_login_at: daysAgo(10),
});
const editor = adminAccount({
  id: "editor",
  name: "Editör",
  email: "editor@bilgin.test",
  role: "content_editor",
});

function renderCard(
  admin: AdminAccountsData["admins"][number],
  {
    admins = [me, otherSuper, editor],
    onUpdate = vi
      .fn<(body: UpdateAdminRequest) => Promise<boolean>>()
      .mockResolvedValue(true),
    error = null,
    saved = false,
    currentAdminId = "me",
  }: Partial<{
    admins: AdminAccountsData["admins"];
    onUpdate: ReturnType<
      typeof vi.fn<(body: UpdateAdminRequest) => Promise<boolean>>
    >;
    error: Parameters<typeof AdminAccountCard>[0]["error"];
    saved: boolean;
    currentAdminId: string;
  }> = {},
) {
  render(
    <AdminAccountCard
      admin={admin}
      currentAdminId={currentAdminId}
      data={{ roles: adminRoles, admins }}
      error={error}
      isPending={false}
      now={ADMIN_NOW}
      onUpdate={onUpdate}
      saved={saved}
    />,
  );
  return { onUpdate, card: screen.getByRole("article") };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AdminAccountCard", () => {
  it("shows status, role, last login, abilities and badges", () => {
    const { card } = renderCard(otherSuper);

    expect(within(card).getByText("Aktif")).toBeDefined();
    expect(within(card).getByText("Son giriş: 10 gün önce")).toBeDefined();
    expect(within(card).getByText("Yüksek yetkili")).toBeDefined();
    expect(
      within(card).getByText(/İçerik düzenleme · Yayınlama/),
    ).toBeDefined();
    expect(card.id).toBe("admin-other-super");
  });

  it("lets you edit your own name and password but not your role or status", async () => {
    const user = userEvent.setup();
    const { onUpdate, card } = renderCard(me);

    expect(within(card).getByText("Kendi hesabınız")).toBeDefined();
    expect(
      within(card).queryByRole("button", { name: "Pasif yap" }),
    ).toBeNull();
    expect(within(card).getByText(/Kendinizi pasif yapamaz/)).toBeDefined();

    await user.click(within(card).getByRole("button", { name: "Düzenle" }));
    const role = within(card).getByLabelText("Rol") as HTMLSelectElement;
    expect(role.disabled).toBe(true);
    expect(
      within(card).getByText(/Kendi rolünüzü değiştiremezsiniz/),
    ).toBeDefined();
    expect(
      within(card).getByRole("group", { name: "Parolanızı değiştirin" }),
    ).toBeDefined();

    await user.type(
      within(card).getByLabelText("Yeni parola"),
      "a-new-password",
    );
    await user.type(
      within(card).getByLabelText("Yeni parola (tekrar)"),
      "a-new-password",
    );
    await user.click(within(card).getByRole("button", { name: "Kaydet" }));

    expect(onUpdate).toHaveBeenCalledWith({ password: "a-new-password" });
  });

  it("disables deactivation and other roles for the last active super admin", async () => {
    const user = userEvent.setup();
    const only = adminAccount({ id: "only", role: "super_admin" });
    const { card } = renderCard(only, {
      admins: [only, editor],
      currentAdminId: "editor",
    });

    const deactivate = within(card).getByRole("button", {
      name: "Pasif yap",
    }) as HTMLButtonElement;
    expect(deactivate.disabled).toBe(true);
    expect(deactivate.getAttribute("aria-describedby")).not.toBeNull();
    expect(
      within(card).getByText(/son aktif süper yönetici pasif yapılamaz/),
    ).toBeDefined();

    await user.click(within(card).getByRole("button", { name: "Düzenle" }));
    const options = within(card)
      .getAllByRole("option")
      .map((option) => [
        option.textContent,
        (option as HTMLOptionElement).disabled,
      ]);
    expect(options).toEqual([
      ["Süper Yönetici", false],
      ["İçerik Editörü", true],
      ["İçerik Denetçisi", true],
      ["Destek", true],
      ["Analist", true],
    ]);
  });

  it("sends only the fields that changed", async () => {
    const user = userEvent.setup();
    const { onUpdate, card } = renderCard(editor);

    await user.click(within(card).getByRole("button", { name: "Düzenle" }));
    await user.selectOptions(
      within(card).getByLabelText("Rol"),
      "content_reviewer",
    );
    await user.click(within(card).getByRole("button", { name: "Kaydet" }));

    expect(onUpdate).toHaveBeenCalledWith({ role: "content_reviewer" });
    // A successful save closes the form.
    expect(within(card).queryByRole("button", { name: "Kaydet" })).toBeNull();
  });

  it("checks the password length and confirmation before sending", async () => {
    const user = userEvent.setup();
    const { onUpdate, card } = renderCard(editor);

    await user.click(within(card).getByRole("button", { name: "Düzenle" }));
    expect(
      (within(card).getByLabelText("Yeni parola (tekrar)") as HTMLInputElement)
        .disabled,
    ).toBe(true);
    await user.type(within(card).getByLabelText("Yeni parola"), "short");
    await user.click(within(card).getByRole("button", { name: "Kaydet" }));
    expect(within(card).getByRole("alert").textContent).toMatch(/en az 12/);

    await user.type(within(card).getByLabelText("Yeni parola"), "-but-longer");
    await user.type(
      within(card).getByLabelText("Yeni parola (tekrar)"),
      "something-else",
    );
    await user.click(within(card).getByRole("button", { name: "Kaydet" }));
    expect(within(card).getByRole("alert").textContent).toBe(
      "Parolalar eşleşmiyor.",
    );
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("says when nothing changed", async () => {
    const user = userEvent.setup();
    const { onUpdate, card } = renderCard(editor);

    await user.click(within(card).getByRole("button", { name: "Düzenle" }));
    await user.click(within(card).getByRole("button", { name: "Kaydet" }));

    expect(within(card).getByRole("alert").textContent).toBe("Değişiklik yok.");
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("asks before deactivating, and does nothing when declined", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { onUpdate, card } = renderCard(editor);

    await user.click(within(card).getByRole("button", { name: "Pasif yap" }));

    expect(confirm.mock.calls[0]![0]).toMatch(/kayıtları silinmez/);
    expect(onUpdate).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await user.click(within(card).getByRole("button", { name: "Pasif yap" }));
    expect(onUpdate).toHaveBeenCalledWith({ is_active: false });
  });

  it("reactivates an inactive account", async () => {
    const user = userEvent.setup();
    const off = adminAccount({ id: "off", is_active: false });
    const { onUpdate, card } = renderCard(off, { admins: [me, off] });

    expect(within(card).getByText("Pasif")).toBeDefined();
    await user.click(within(card).getByRole("button", { name: "Aktifleştir" }));

    expect(onUpdate).toHaveBeenCalledWith({ is_active: true });
  });

  it("shows the backend's refusal on the card, and a saved note", () => {
    renderCard(editor, {
      error: {
        kind: "validation",
        status: 422,
        code: "ADMIN_LOCKOUT_PREVENTED",
        message: "Sistemde en az bir aktif süper yönetici kalmalı.",
      },
    });

    expect(screen.getByRole("alert").textContent).toBe(
      "Backend engelledi: Sistemde en az bir aktif süper yönetici kalmalı.",
    );
  });

  it("confirms a saved change", () => {
    renderCard(editor, { saved: true });

    expect(screen.getByRole("status").textContent).toBe("Kaydedildi.");
  });
});

describe("adminUpdateErrorMessage", () => {
  it("words each failure", () => {
    expect(
      adminUpdateErrorMessage({
        kind: "validation",
        status: 422,
        message: "Geçersiz.",
        fields: { password: ["Parola en az 12 karakter olmalı."] },
      }),
    ).toBe("Parola en az 12 karakter olmalı.");
    expect(
      adminUpdateErrorMessage({
        kind: "authorization",
        status: 403,
        message: "x",
      }),
    ).toBe("Bu işlem için yetkiniz yok.");
    expect(
      adminUpdateErrorMessage({ kind: "not_found", status: 404, message: "x" }),
    ).toMatch(/bulunamadı/);
    expect(
      adminUpdateErrorMessage({
        kind: "server",
        status: 500,
        message: "Sunucu.",
      }),
    ).toBe("Sunucu.");
  });
});
