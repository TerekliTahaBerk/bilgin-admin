import { expect, test, type Page } from "@playwright/test";

import {
  E2E_BASE_URL,
  E2E_COURSE_WITH_UNITS_ID,
  E2E_EMAIL,
  E2E_EXERCISES,
  E2E_MISSING_UNIT_ID,
  E2E_PASSWORD,
  E2E_UNIT_WITHOUT_EXERCISES_ID,
  E2E_UNIT_WITH_EXERCISES_ID,
} from "./support/fixtures";

const EXERCISES_PATH = `/courses/${E2E_COURSE_WITH_UNITS_ID}/units/${E2E_UNIT_WITH_EXERCISES_ID}`;

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
  return page.locator("main ul li");
}

test("walks from the panel down to a unit's exercise list", async ({
  page,
}) => {
  await signIn(page);

  await page.getByRole("link", { name: "İçerik", exact: true }).first().click();
  await page.getByRole("link", { name: /TYT Türkçe/ }).click();
  await page.getByRole("link", { name: /İlk ve Orta Çağlarda/ }).click();

  await expect(page).toHaveURL(`${E2E_BASE_URL}${EXERCISES_PATH}`);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "İlk ve Orta Çağlarda Türk Dünyası",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "İçerik", exact: true }).first(),
  ).toHaveAttribute("aria-current", "page");
});

test("renders the real exercise data", async ({ page }) => {
  await signIn(page);
  await page.goto(EXERCISES_PATH);

  await expect(rows(page)).toHaveCount(E2E_EXERCISES.length);

  for (const exercise of E2E_EXERCISES) {
    const row = rows(page).filter({ hasText: exercise.preview });

    await expect(row).toHaveCount(1);
    await expect(row).toContainText(exercise.type);
    await expect(row).toContainText(exercise.topic);
    await expect(row).toContainText(exercise.status);
  }

  // Flagged exercises come first, in backend order.
  await expect(rows(page).nth(0)).toContainText(
    "Uygurlar yerleşik hayata geçen ilk Türk devletidir.",
  );
  await expect(rows(page).nth(1)).toContainText(
    "Kavramı karşılığıyla birleştir.",
  );
  await expect(page.getByText("İnceleme gerekli")).toHaveCount(2);

  // Never attempted → not solved yet, never 0%.
  await expect(page.getByText("Henüz çözülmedi")).toHaveCount(1);
  await expect(page.getByText("%0 doğru")).toHaveCount(0);

  await expect(page.getByText("Düzenlenmiş (v2)")).toBeVisible();
  await expect(
    page.getByText(/41 deneme · %97 doğru · Ort\. 7 sn/),
  ).toBeVisible();
});

test("filters by type and status through the server", async ({ page }) => {
  await signIn(page);
  await page.goto(EXERCISES_PATH);
  await expect(rows(page)).toHaveCount(5);

  await page.getByLabel("Tip").selectOption("true_false");

  await expect(page).toHaveURL(new RegExp("type=true_false"));
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("Doğru / Yanlış");

  await page.getByLabel("Tip").selectOption("");
  await page.getByLabel("Durum").selectOption("published");

  await expect(page).toHaveURL(new RegExp("status=published"));
  await expect(rows(page)).toHaveCount(2);
});

test("filters by topic and difficulty in the browser", async ({ page }) => {
  await signIn(page);
  await page.goto(EXERCISES_PATH);
  await expect(rows(page)).toHaveCount(5);

  await page.getByLabel("Konu").selectOption({ label: "Kültür ve Medeniyet" });

  await expect(page).toHaveURL(new RegExp("topic=2"));
  await expect(rows(page)).toHaveCount(3);

  await page.getByLabel("Zorluk").selectOption("1");

  await expect(page).toHaveURL(new RegExp("difficulty=1"));
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("(önizleme yok)");
});

test("clears every filter and restores the full list", async ({ page }) => {
  await signIn(page);
  await page.goto(`${EXERCISES_PATH}?type=true_false&difficulty=3`);

  await expect(rows(page)).toHaveCount(1);

  await page.getByRole("button", { name: "Filtreleri temizle" }).click();

  await expect(page).toHaveURL(`${E2E_BASE_URL}${EXERCISES_PATH}`);
  await expect(rows(page)).toHaveCount(5);
});

test("ignores invalid filters in the URL instead of crashing", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(
    `${EXERCISES_PATH}?type=banana&status=nope&topic=abc&difficulty=999`,
  );

  await expect(rows(page)).toHaveCount(5);
  await expect(page.getByLabel("Tip")).toHaveValue("");
  await expect(page.getByLabel("Zorluk")).toHaveValue("");
});

test("shows an empty state for a unit with no exercises", async ({ page }) => {
  await signIn(page);
  await page.goto(
    `/courses/${E2E_COURSE_WITH_UNITS_ID}/units/${E2E_UNIT_WITHOUT_EXERCISES_ID}`,
  );

  await expect(
    page.getByText("Bu ünitede henüz soru bulunmuyor."),
  ).toBeVisible();
  await expect(page.getByText("Yeni Soru")).toHaveCount(0);
});

test("keeps the session when the unit does not exist", async ({ page }) => {
  await signIn(page);
  await page.goto(
    `/courses/${E2E_COURSE_WITH_UNITS_ID}/units/${E2E_MISSING_UNIT_ID}`,
  );

  await expect(
    page.getByRole("heading", { level: 1, name: "Ünite bulunamadı" }),
  ).toBeVisible();
  await expect(page).toHaveURL(
    `${E2E_BASE_URL}/courses/${E2E_COURSE_WITH_UNITS_ID}/units/${E2E_MISSING_UNIT_ID}`,
  );
});

test("offers only the supported editor actions", async ({ page }) => {
  await signIn(page);
  await page.goto(EXERCISES_PATH);
  await expect(rows(page)).toHaveCount(5);

  await expect(
    page.getByRole("link", { name: "Yeni çoktan seçmeli" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Yeni doğru / yanlış" }),
  ).toBeVisible();
  // Multiple choice and true/false are editable; the other three rows
  // (fill_blank, matching, image_hotspot) are read-only until later steps.
  await expect(page.getByRole("link", { name: "Düzenle" })).toHaveCount(2);

  for (const absent of ["Arşivle", "Yayınla", "Kaydet"]) {
    await expect(page.getByText(absent, { exact: false })).toHaveCount(0);
  }
  await expect(page.locator("main ul li a")).toHaveCount(2);
  await expect(page.locator("main ul li button")).toHaveCount(0);
});

test("fits a phone viewport without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await signIn(page);
  await page.goto(EXERCISES_PATH);
  await expect(rows(page)).toHaveCount(5);

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByLabel("Tip")).toBeVisible();
});
