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

function summary(page: Page) {
  return page.getByRole("region", { name: "Tarama sonucu" });
}

/** One figure in the result's stats list (not the per-course table). */
function stat(page: Page, label: string) {
  return summary(page)
    .locator("dl > div")
    .filter({ has: page.getByText(label, { exact: true }) });
}

test("redirects to login without a session", async ({ page }) => {
  await page.goto("/scan");

  await expect(page).toHaveURL(`${E2E_BASE_URL}/login`);
});

test("scans the whole catalogue and shares the result", async ({ page }) => {
  await signIn(page);

  await page.getByRole("link", { name: "Tam Tarama" }).first().click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}/scan`);
  await expect(
    page.getByText("Bu oturumda henüz eksiksiz bir tarama yapılmadı."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Taramayı başlat" }).click();
  await expect(page.getByText("Tarama eksiksiz tamamlandı.")).toBeVisible();

  // 4 courses, 5 units across them, 9 exercise rows in the mock fixture —
  // every unit is read, including one whose unit list reports 0 exercises.
  await expect(stat(page, "Ders")).toContainText("4");
  await expect(stat(page, "Ünite")).toContainText("5");
  await expect(stat(page, "Soru")).toContainText("9");
  await expect(
    page.getByRole("region", { name: "Son tam tarama" }).locator("time"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Yeniden tara" }),
  ).toBeVisible();

  // The Quality Center reads the same session snapshot.
  await page.getByRole("link", { name: "Soru Kalitesi" }).first().click();
  await expect(
    page.getByText(/5\/5 ünite tarandı · 9 soru yüklendi/),
  ).toBeVisible();

  // The snapshot is session memory only: a reload starts over.
  await page.goto("/scan");
  await expect(
    page.getByText("Bu oturumda henüz eksiksiz bir tarama yapılmadı."),
  ).toBeVisible();
});

test("shows a partial failure and retries just that unit", async ({ page }) => {
  await signIn(page);
  await page.route("**/api/admin/units/13/exercises", (route) =>
    route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          kind: "server",
          status: 502,
          message: "Sunucu hatası oluştu.",
        },
      }),
    }),
  );
  await page.goto("/scan");

  await page.getByRole("button", { name: "Taramayı başlat" }).click();

  await expect(
    page.getByText(
      "Tarama tamamlandı ama bazı listeler okunamadı; sonuçlar eksik.",
    ),
  ).toBeVisible();
  const failures = page.getByRole("region", { name: "1 liste okunamadı" });
  await expect(failures).toContainText(
    "TYT Türkçe › Hazırlanıyor — soru listesi okunamadı: Sunucu hatası oluştu.",
  );
  await expect(
    page.getByText("Bu oturumda henüz eksiksiz bir tarama yapılmadı."),
  ).toBeVisible();

  await page.unroute("**/api/admin/units/13/exercises");
  await failures
    .getByRole("button", { name: "Başarısız olanları tekrar dene" })
    .click();

  await expect(
    page.getByText("Tekrar deneme tamamlandı; tarama artık eksiksiz."),
  ).toBeVisible();
  await expect(stat(page, "Soru")).toContainText("9");
});

test("cancels a running scan and keeps the page usable", async ({ page }) => {
  await signIn(page);
  await page.route("**/api/admin/units/*/exercises", async (route) => {
    await new Promise((done) => setTimeout(done, 5_000));
    await route.continue().catch(() => undefined);
  });
  await page.goto("/scan");

  await page.getByRole("button", { name: "Taramayı başlat" }).click();
  await expect(page.getByText("Soru listeleri okunuyor")).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "Tarama ilerlemesi" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Taramayı iptal et" }).click();

  await expect(
    page.getByText(
      "Tarama iptal edildi. Önceki tarama sonucu (varsa) korunuyor.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Taramayı başlat" }),
  ).toBeVisible();
});

test("fits a phone screen", async ({ page }) => {
  await signIn(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/scan");
  await page.getByRole("button", { name: "Taramayı başlat" }).click();
  await expect(page.getByText("Tarama eksiksiz tamamlandı.")).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
