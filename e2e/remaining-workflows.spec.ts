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

async function signIn(page: Page, email = E2E_EMAIL) {
  await page.goto("/login");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /giriş/i }).click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}/`);
}

test("creates a unit from a backend template and exposes it in the course", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/courses/2/units/new");
  await page.getByLabel("Başlık").fill("Yerel Şablon Ünitesi");
  await page.getByLabel("Şablon").selectOption("standard");
  await expect(
    page.getByText(/Çalışma · study · zorluk medium · 6 soru/),
  ).toBeVisible();
  await page.getByLabel("Temel Kavramlar").check();
  await page.getByRole("button", { name: "Üniteyi oluştur" }).click();
  await expect(page).toHaveURL(/\/courses\/2\/units\/\d+$/);
  await page.goto("/courses/2");
  await expect(page.getByText("Yerel Şablon Ünitesi")).toBeVisible();
});

test("archives an exercise with history-preservation confirmation", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/courses/1/units/11");
  const row = page
    .getByRole("list", { name: "Sorular" })
    .locator("li")
    .filter({ hasText: "Uygurlar yerleşik" });
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("Yeni oturumlar");
    expect(dialog.message()).toContain("geçmiş kayıtları korunur");
    await dialog.accept();
  });
  await row.getByRole("button", { name: "Arşivle" }).click();
  await expect(row).toContainText("Arşiv");
  await expect(row.getByRole("button", { name: "Arşivle" })).toHaveCount(0);
});

test("imports pasted JSON locally and shows the created unit", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/content/import");
  await page.getByLabel(/JSON yapıştırın/).fill(
    JSON.stringify({
      course: "tyt_matematik",
      subject: "matematik",
      unit: {
        title: "İçe Aktarılan Ünite",
        template: "standard",
        nested: { preserved: true },
      },
      topics: [{ code: "temel_kavramlar" }],
      exercises: [
        { type: "multiple_choice", answer_key: { correct: "secret" } },
      ],
    }),
  );
  await expect(
    page.getByText("İçe Aktarılan Ünite", { exact: true }),
  ).toBeVisible();
  const preview = page
    .locator("section")
    .filter({ hasText: "Güvenli önizleme" });
  await expect(preview.getByText("secret")).toHaveCount(0);
  await page.getByRole("button", { name: "Paketi içe aktar" }).click();
  await expect(
    page.getByText("İçe Aktarılan Ünite içe aktarıldı."),
  ).toBeVisible();
  await page.goto("/courses/2");
  await expect(page.getByText("İçe Aktarılan Ünite")).toBeVisible();
});

test("saves and reloads a source-id curriculum full replacement", async ({
  page,
}) => {
  await signIn(page, E2E_SUPER_ADMIN_EMAIL);
  await page.goto("/curriculum");
  await page.getByLabel("Sınav varyantı").selectOption("7");
  await expect(page.getByText("TYT Türkçe", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Kaldır" }).click();
  await expect(page.getByText(/1 kaldırıldı/)).toBeVisible();
  await page.getByLabel("Eklenecek ders").selectOption("2");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Tam listeyi kaydet" }).click();
  await expect(page.getByText("Müfredat kaydedildi.")).toBeVisible();
  await page.reload();
  await page.getByLabel("Sınav varyantı").selectOption("7");
  await expect(
    page.getByText("TYT Temel Matematik", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("table").getByText("TYT Türkçe", { exact: true }),
  ).toHaveCount(0);
});

test("creates, edits, and deactivates another admin while protecting self", async ({
  page,
}) => {
  await signIn(page, E2E_SUPER_ADMIN_EMAIL);
  await page.goto("/admins");
  const self = page.locator("article").filter({ hasText: "admin@bilgin.test" });
  await expect(self.getByText("Kendi hesabınız")).toBeVisible();
  await expect(self.getByRole("button", { name: "Pasif yap" })).toHaveCount(0);

  const createForm = page.locator("form").filter({ hasText: "Yeni yönetici" });
  await createForm.getByPlaceholder("Ad soyad").fill("E2E Yönetici");
  await createForm.getByPlaceholder("E-posta").fill("e2e-new@bilgin.test");
  await createForm
    .getByPlaceholder("En az 12 karakter parola")
    .fill("e2e-password-123");
  await createForm.locator("select").selectOption("content_editor");
  await createForm.getByRole("button", { name: "Yönetici oluştur" }).click();
  const account = page
    .locator("article")
    .filter({ hasText: "e2e-new@bilgin.test" });
  await expect(account).toBeVisible();
  await account.getByRole("button", { name: "Düzenle" }).click();
  await account.locator("select").selectOption("content_reviewer");
  await account.getByRole("button", { name: "Kaydet" }).click();
  await expect(account).toContainText("İçerik Denetçisi");
  page.once("dialog", (dialog) => dialog.accept());
  await account.getByRole("button", { name: "Pasif yap" }).click();
  await expect(account).toContainText("Pasif");
});
