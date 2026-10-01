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

function table(page: Page) {
  return page.getByRole("table", { name: "Konu kapsam tablosu" });
}

/** A topic's row, matched by its row header (not the "Üst konu" column). */
function topicRow(page: Page, name: string) {
  return table(page)
    .getByRole("row")
    .filter({
      has: page.getByRole("rowheader", { name: new RegExp(`^${name}`) }),
    });
}

test("redirects to login without a session", async ({ page }) => {
  await page.goto("/coverage");

  await expect(page).toHaveURL(`${E2E_BASE_URL}/login`);
});

test("shows backend topic counts without a scan and marks scanned counts unknown", async ({
  page,
}) => {
  await signIn(page);

  await page.getByRole("link", { name: "Kapsama Analizi" }).first().click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}/coverage`);

  const rows = table(page).getByRole("row");
  await expect(rows).toHaveCount(3);
  const first = topicRow(page, "İlk Türk Devletleri");
  await expect(first).toContainText("9. sınıf");
  await expect(first).toContainText("2");
  await expect(first).toContainText("Bilinmiyor");
  await expect(first).toContainText("Düşük");
  await expect(topicRow(page, "Kültür ve Medeniyet")).toContainText(
    "İlk Türk Devletleri",
  );
  await expect(
    page.getByText(/uygulama içi bir sınıflandırmadır/),
  ).toBeVisible();

  // The other course has a topic with no content.
  await page
    .getByLabel("Ders", { exact: true })
    .selectOption({ label: "TYT Temel Matematik" });
  await expect(page).toHaveURL(/course=2/);
  await expect(topicRow(page, "Temel Kavramlar")).toContainText("İçerik yok");

  // The matrix needs a scan; without one its cells are unknown.
  await page.getByRole("button", { name: "Konu × Sınav kapsamı" }).click();
  await expect(
    page.getByRole("table", { name: "Konu × sınav kapsamı matrisi" }),
  ).toContainText("Bilinmiyor");
});

test("fills scanned counts and the matrix after a full scan", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/coverage");

  await page.getByRole("button", { name: "Taramayı başlat" }).click();
  await expect(page.getByText(/tarihli tam taramadan/)).toBeVisible();

  // Course 1's units hold 2 + 2 scanned questions of topic 1.
  const first = topicRow(page, "İlk Türk Devletleri");
  await expect(first).not.toContainText("Bilinmiyor");

  await page.getByRole("button", { name: "Konu × Ders" }).click();
  const matrix = page.getByRole("table", { name: "Konu × ders matrisi" });
  await expect(
    matrix.getByRole("columnheader", { name: "TYT Türkçe" }),
  ).toBeVisible();
  await expect(matrix).not.toContainText("Bilinmiyor");
});

test("filters by view and search, and keeps them in the URL", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/coverage?course=1");

  await page.getByRole("searchbox", { name: "Ara" }).fill("kültür");
  await expect(page).toHaveURL(/q=k%C3%BClt%C3%BCr/);
  await expect(table(page).getByRole("row")).toHaveCount(2);

  await page.getByRole("button", { name: "Yalnız boş" }).click();
  await expect(
    page.getByText("Bu filtrelerle eşleşen konu bulunmuyor."),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Filtreleri temizle" })
    .first()
    .click();
  await expect(table(page).getByRole("row")).toHaveCount(3);
});

test("fits a phone screen", async ({ page }) => {
  await signIn(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/coverage");
  await expect(table(page)).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
