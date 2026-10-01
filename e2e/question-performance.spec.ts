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

async function scan(page: Page) {
  await page.getByRole("button", { name: "Taramayı başlat" }).click();
  await expect(page.getByText(/tarihli tam tarama/)).toBeVisible();
}

test("redirects to login without a session", async ({ page }) => {
  await page.goto("/analytics/questions");

  await expect(page).toHaveURL(`${E2E_BASE_URL}/login`);
});

test("reaches the explorer from the Veri Paneli and asks for a scan first", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/analytics");

  await page
    .getByRole("navigation", { name: "Veri Paneli bölümleri" })
    .getByRole("link", { name: "Soru performansı" })
    .click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}/analytics/questions`);
  await expect(
    page.getByRole("link", { name: "Soru performansı" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { name: "Tam içerik taraması yapılmadı" }),
  ).toBeVisible();
});

test("charts the scanned stats and applies the minimum sample", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/analytics/questions");
  await scan(page);

  await expect(
    page.getByRole("heading", { name: "Zorluğa göre doğru oranı" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Soru türüne göre deneme sayısı" }),
  ).toBeVisible();
  // Question 102 (41 attempts) leads the most-solved ranking.
  const ranking = page.getByRole("table", { name: /En çok çözülen/ });
  await expect(ranking.getByRole("row").nth(1)).toContainText("41");

  await page.getByLabel("Minimum örneklem").selectOption("20");
  await expect(page).toHaveURL(/min=20/);
  await page.getByRole("button", { name: "En düşük doğru oranı" }).click();
  // 104 (22 attempts, %9) is the weakest question with at least 20 attempts.
  await expect(
    page.getByRole("table", { name: "En düşük doğru oranı" }).getByRole("row"),
  ).toHaveCount(3);
  await expect(
    page
      .getByRole("table", { name: "En düşük doğru oranı" })
      .getByRole("row")
      .nth(1),
  ).toContainText("%9");
});

test("fits a phone screen", async ({ page }) => {
  await signIn(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/analytics/questions");
  await scan(page);
  await expect(
    page.getByRole("heading", { name: "Soru sıralamaları" }),
  ).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
