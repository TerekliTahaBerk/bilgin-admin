import { expect, test, type Page } from "@playwright/test";

import {
  E2E_BASE_URL,
  E2E_EMAIL,
  E2E_PASSWORD,
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

async function signIn(page: Page) {
  await page.goto("/login");
  await page.waitForFunction(() => {
    const form = document.querySelector("form");

    return (
      form !== null &&
      Object.keys(form).some((key) => key.startsWith("__react"))
    );
  });
  await page.getByLabel("E-posta").fill(E2E_EMAIL);
  await page.getByLabel("Şifre").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /giriş/i }).click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}/`);
}

function problems(page: Page) {
  return page.getByRole("list", { name: "Problem listesi" });
}

test("redirects to login without a session", async ({ page }) => {
  await page.goto("/health");

  await expect(page).toHaveURL(`${E2E_BASE_URL}/login`);
});

test("refuses to show a dashboard before a full scan, then builds one", async ({
  page,
}) => {
  await signIn(page);

  await page.getByRole("link", { name: "İçerik Sağlığı" }).first().click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}/health`);
  await expect(
    page.getByRole("heading", { name: "Tam içerik taraması yapılmadı" }),
  ).toBeVisible();
  await expect(page.getByText("Toplam ders")).toHaveCount(0);

  await page.getByRole("button", { name: "Taramayı başlat" }).click();

  await expect(
    page.getByRole("heading", { name: /Yapılacaklar/ }),
  ).toBeVisible();
  await expect(page.getByText("Konu listeleri yükleniyor…")).toHaveCount(0);

  // Course 2 has no units; it links to its own page.
  const emptyCourse = problems(page)
    .getByRole("listitem")
    .filter({ hasText: "TYT Temel Matematik" })
    .filter({ hasText: "Ünitesi olmayan ders" });
  await expect(
    emptyCourse.getByRole("link", { name: /Dersi aç/ }),
  ).toHaveAttribute("href", "/courses/2");

  // The backend-flagged question opens in the editor.
  await expect(
    problems(page).getByRole("link", {
      name: "Soruyu düzenle: Uygurlar yerleşik hayata geçen ilk Türk devletidir.",
    }),
  ).toHaveAttribute("href", "/courses/1/units/11/exercises/102");

  // Topics come from the topic lists; the mock has none for course 4.
  await expect(
    problems(page).getByRole("listitem").filter({ hasText: "Temel Kavramlar" }),
  ).toContainText("Sorusu olmayan konu");
  await expect(
    page.getByText("1 dersin konu listesi okunamadı; konu sayıları eksik."),
  ).toBeVisible();

  // The score is labelled as the panel's own product metric.
  const score = page.getByRole("region", { name: "İçerik Sağlığı Skoru" });
  await expect(score).toContainText("backend'in resmi bir metriği değildir");
  await score.getByText("Skor nasıl hesaplanıyor?").click();
  await expect(
    score.getByText("Sorusu olan üniteler", { exact: true }),
  ).toBeVisible();

  // Filtering narrows the list to one kind.
  await page
    .getByRole("group", { name: "Problem türü" })
    .getByRole("button", { name: /^İnceleme gerekli soru/ })
    .click();
  await expect(problems(page).getByRole("listitem")).toHaveCount(2);
});

test("fits a phone screen", async ({ page }) => {
  await signIn(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/health");
  await page.getByRole("button", { name: "Taramayı başlat" }).click();
  await expect(
    page.getByRole("heading", { name: /Yapılacaklar/ }),
  ).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
