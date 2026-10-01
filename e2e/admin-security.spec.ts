import { expect, test, type Page } from "@playwright/test";

import {
  E2E_BASE_URL,
  E2E_EMAIL,
  E2E_PASSWORD,
  E2E_SUPER_ADMIN_EMAIL,
  resetMockBackend,
} from "./support/fixtures";

/*
 | Every test starts from the pristine mock fixture.
 |
 | The mock backend is one process shared by the whole suite, so a mutation
 | test leaves state that a later test would otherwise read as product truth.
 | This runs before sign-in, so the session is established against clean data.
 */
test.beforeEach(async () => {
  await resetMockBackend();
});

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.waitForFunction(() => {
    const form = document.querySelector("form");

    return (
      form !== null &&
      Object.keys(form).some((key) => key.startsWith("__react"))
    );
  });
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /giriş/i }).click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}/`);
}

test("redirects to login without a session", async ({ page }) => {
  await page.goto("/admins/security");

  await expect(page).toHaveURL(`${E2E_BASE_URL}/login`);
});

test("is closed to an admin without account management", async ({ page }) => {
  await signIn(page, E2E_EMAIL);
  await page.goto("/admins/security");

  await expect(
    page.getByRole("heading", { name: "Bu bölüme erişim yetkiniz yok" }),
  ).toBeVisible();
});

test("summarises the roster and links attention items to the account", async ({
  page,
}) => {
  await signIn(page, E2E_SUPER_ADMIN_EMAIL);
  await page.goto("/admins");
  await page
    .getByRole("navigation", { name: "Yönetici bölümleri" })
    .getByRole("link", { name: "Güvenlik" })
    .click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}/admins/security`);

  await expect(page.getByText("Toplam yönetici")).toBeVisible();
  // The seed has one super admin: noted, and labelled as local policy.
  await expect(page.getByText(/Tek aktif süper yönetici var/)).toContainText(
    "Yerel politika sezgiseli",
  );

  const attention = page
    .getByRole("heading", { name: "Dikkat gerektiren hesaplar" })
    .locator("xpath=ancestor::section[1]");
  await attention.getByRole("button", { name: /^Hiç giriş yapmamış/ }).click();
  await attention.getByRole("link", { name: "Hesabı düzenle" }).first().click();
  await expect(page).toHaveURL(/\/admins#admin-/);
});

test("guards the backend lockout rules on your own account", async ({
  page,
}) => {
  await signIn(page, E2E_SUPER_ADMIN_EMAIL);
  await page.goto("/admins");

  const self = page.locator("article").filter({ hasText: "admin@bilgin.test" });
  await expect(self.getByRole("button", { name: "Pasif yap" })).toHaveCount(0);
  await self.getByRole("button", { name: "Düzenle" }).click();
  await expect(self.getByLabel("Rol", { exact: true })).toBeDisabled();
  await expect(
    self.getByRole("group", { name: "Parolanızı değiştirin" }),
  ).toBeVisible();

  await self
    .getByLabel("Yeni parola", { exact: true })
    .fill("a-new-password-1");
  await self.getByLabel("Yeni parola (tekrar)").fill("a-different-one-1");
  await self.getByRole("button", { name: "Kaydet" }).click();
  await expect(self.getByRole("alert")).toHaveText("Parolalar eşleşmiyor.");
});

test("fits a phone screen", async ({ page }) => {
  await signIn(page, E2E_SUPER_ADMIN_EMAIL);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admins/security");
  await expect(page.getByText("Toplam yönetici")).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
