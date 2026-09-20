import { expect, test, type Page } from "@playwright/test";

import {
  E2E_BASE_URL,
  E2E_COURSE_WITH_UNITS_ID,
  E2E_EMAIL,
  E2E_PASSWORD,
  E2E_REVIEWER_EMAIL,
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

const LIST_PATH = `/courses/${E2E_COURSE_WITH_UNITS_ID}/units/${E2E_UNIT_WITH_EXERCISES_ID}`;
const NEW_PATH = `${LIST_PATH}/exercises/new`;

async function signIn(page: Page, email = E2E_EMAIL) {
  await page.goto("/login");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /giriş/i }).click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}/`);
}

async function fillQuestion(page: Page, stem: string) {
  await page.getByLabel("Konu").selectOption("1");
  await page.getByLabel("Soru kökü").fill(stem);
  for (const id of ["a", "b", "c", "d"]) {
    await page.getByLabel(`${id} şıkkı metni`).fill(`E2E şık ${id}`);
  }
  await page.getByLabel("b şıkkını doğru cevap seç").check();
}

test("creates a real multiple-choice draft and enters edit mode", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(LIST_PATH);
  await page.getByRole("link", { name: "Çoktan seçmeli" }).click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}${NEW_PATH}`);

  await fillQuestion(page, "E2E yeni çoktan seçmeli soru");
  await expect(page.getByLabel("Canlı önizleme")).toContainText(
    "E2E yeni çoktan seçmeli soru",
  );
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`${LIST_PATH}/exercises/\\d+$`));
  await expect(
    page.getByRole("heading", { name: "Çoktan seçmeli soruyu düzenle" }),
  ).toBeVisible();
  await expect(page.getByText("Taslak")).toBeVisible();
  await expect(page.getByText("v1")).toBeVisible();
});

test("edits an existing answer key, increments version and shows warning", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`${LIST_PATH}/exercises/101`);
  await expect(page.getByLabel("b şıkkını doğru cevap seç")).toBeChecked();
  await page.getByLabel("Soru kökü").fill("E2E güncellenmiş Orhun sorusu");
  await page.getByLabel("a şıkkını doğru cevap seç").check();
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();

  await expect(page.getByText("v2")).toBeVisible();
  await expect(page.getByText(/Cevap anahtarı değişti/)).toBeVisible();
  await expect(page.getByText("Kaydedildi", { exact: true })).toBeVisible();
});

test("Save & New preserves common fields and resets question content", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(NEW_PATH);
  await fillQuestion(page, "Save and new source");
  await page.getByLabel("Zorluk").selectOption("5");
  await page.getByRole("button", { name: "Kaydet ve Yeni" }).click();

  await expect(page).toHaveURL(`${E2E_BASE_URL}${NEW_PATH}`);
  await expect(page.getByText("Kaydedildi. Yeni soru hazır.")).toBeVisible();
  await expect(page.getByLabel("Konu")).toHaveValue("1");
  await expect(page.getByLabel("Zorluk")).toHaveValue("5");
  await expect(page.getByLabel("TYT")).toBeChecked();
  await expect(page.getByLabel("Soru kökü")).toHaveValue("");
  await expect(page.getByLabel("a şıkkı metni")).toHaveValue("");
});

test("reviewer can read the list but cannot see or open editor actions", async ({
  page,
}) => {
  await signIn(page, E2E_REVIEWER_EMAIL);
  await page.goto(LIST_PATH);
  await expect(
    page.getByText("Uygurlar yerleşik hayata geçen ilk Türk devletidir."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Çoktan seçmeli" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("link", { name: "Düzenle" })).toHaveCount(0);

  await page.goto(NEW_PATH);
  await expect(page.getByText("Düzenleme yetkiniz yok.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Kaydet", exact: true }),
  ).toHaveCount(0);

  const status = await page.evaluate(async () => {
    const response = await fetch("/api/admin/exercises", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "multiple_choice",
        topic_id: 1,
        owner_unit_id: 11,
        difficulty: 3,
        content: {
          stem: "x",
          options: [
            { id: "a", text: "A" },
            { id: "b", text: "B" },
          ],
        },
        answer_key: { correct_option_id: "a" },
        explanation: null,
        applicable_scopes: ["tyt"],
      }),
    });
    return response.status;
  });
  expect(status).toBe(403);
});

test("editor stacks without horizontal overflow on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await signIn(page);
  await page.goto(NEW_PATH);
  await expect(
    page.getByRole("heading", { name: "Yeni çoktan seçmeli soru" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByLabel("Canlı önizleme")).toBeVisible();
});
