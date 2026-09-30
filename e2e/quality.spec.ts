import { expect, test, type Page } from "@playwright/test";

import {
  E2E_BASE_URL,
  E2E_COURSE_WITH_UNITS_ID,
  E2E_EMAIL,
  E2E_PASSWORD,
  E2E_UNIT_WITH_EXERCISES_ID,
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

function rows(page: Page) {
  return page.getByRole("list", { name: "Soru listesi" }).locator("li");
}

test("scans the catalogue on request and narrows to backend-flagged questions", async ({
  page,
}) => {
  await signIn(page);

  await page.getByRole("link", { name: "Soru Kalitesi" }).first().click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}/quality`);
  await expect(
    page.getByRole("heading", { name: "Soru Kalite Merkezi" }),
  ).toBeVisible();

  // Nothing is scanned on arrival.
  await expect(
    page.getByText("Bu kapsamda henüz yüklenmiş soru yok."),
  ).toBeVisible();

  await page.getByRole("button", { name: /^Tara \(/ }).click();
  await expect(page.getByText("Tarama tamamlandı.")).toBeVisible();
  await expect(
    page.getByText(/5\/5 ünite tarandı · 5 soru yüklendi/),
  ).toBeVisible();
  await expect(rows(page)).toHaveCount(5);
  await expect(page.getByText("Henüz çözülmedi")).toBeVisible();

  await page
    .getByRole("group", { name: "Hazır görünümler" })
    .getByRole("button", { name: "İnceleme gerekli" })
    .click();

  await expect(page).toHaveURL(/review=yes/);
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).nth(0)).toContainText("Uygurlar");
  await expect(rows(page).nth(1)).toContainText("Kavramı karşılığıyla");

  await page
    .getByRole("link", {
      name: "Soruyu düzenle: Uygurlar yerleşik hayata geçen ilk Türk devletidir.",
    })
    .click();
  await expect(page).toHaveURL(
    `${E2E_BASE_URL}/courses/${E2E_COURSE_WITH_UNITS_ID}/units/${E2E_UNIT_WITH_EXERCISES_ID}/exercises/102`,
  );
});

test("shows a unit list browsed earlier without scanning", async ({ page }) => {
  await signIn(page);

  await page.goto(
    `/courses/${E2E_COURSE_WITH_UNITS_ID}/units/${E2E_UNIT_WITH_EXERCISES_ID}`,
  );
  await expect(page.getByRole("list", { name: "Sorular" })).toBeVisible();

  await page.getByRole("link", { name: "Soru Kalitesi" }).first().click();

  await expect(rows(page)).toHaveCount(5);
  await expect(page.getByText(/5 soru yüklendi/)).toBeVisible();
});

test("keeps the view in the URL and fits a phone screen", async ({ page }) => {
  await signIn(page);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto(`/quality?course=${E2E_COURSE_WITH_UNITS_ID}`);
  await expect(
    page.getByRole("heading", { name: "Veri kapsamı: TYT Türkçe" }),
  ).toBeVisible();
  await expect(page.getByLabel("Ders")).toHaveValue(
    String(E2E_COURSE_WITH_UNITS_ID),
  );

  await page.getByRole("button", { name: /^Tara \(/ }).click();
  await expect(page.getByText("Tarama tamamlandı.")).toBeVisible();
  await expect(rows(page)).toHaveCount(5);

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
