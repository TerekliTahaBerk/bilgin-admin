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
const NEW_PATH = `${LIST_PATH}/exercises/new?type=fill_blank`;
/** Seeded by the mock backend with a template, four choices and one answer. */
const FILL_BLANK_PATH = `${LIST_PATH}/exercises/103`;

async function signIn(page: Page, email = E2E_EMAIL) {
  await page.goto("/login");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /giriş/i }).click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}/`);
}

/** Places the caret inside the template, the way a person clicking would. */
async function putCaretAt(page: Page, offset: number) {
  await page.getByLabel("Cümle şablonu").focus();
  await page.getByLabel("Cümle şablonu").evaluate((element, position) => {
    (element as HTMLTextAreaElement).setSelectionRange(position, position);
  }, offset);
}

test("creates a real fill blank draft from a caret insertion and enters edit mode", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(LIST_PATH);
  await page.getByRole("link", { name: "Boşluk doldurma" }).click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}${NEW_PATH}`);
  await expect(
    page.getByRole("heading", { name: "Yeni boşluk doldurma sorusu" }),
  ).toBeVisible();

  // Nothing is invented before the editor asks for it.
  await expect(
    page.getByText("Boşluk bulunamadı.", { exact: false }),
  ).toBeVisible();

  await page.getByLabel("Konu").selectOption("1");
  await page.getByLabel("Cümle şablonu").fill("Türklerde  adı verilir.");
  await putCaretAt(page, 10);
  await page.getByRole("button", { name: "Boşluk ekle" }).click();

  await expect(page.getByLabel("Cümle şablonu")).toHaveValue(
    "Türklerde {{0}} adı verilir.",
  );
  await expect(page.getByText("1 boşluk bulundu.")).toBeVisible();

  await page.getByRole("button", { name: "Seçenek ekle" }).click();
  await page.getByLabel("1. seçenek metni").fill("Töre");
  await page.getByRole("button", { name: "Seçenek ekle" }).click();
  await page.getByLabel("2. seçenek metni").fill("Kurultay");
  await page.getByLabel("Boşluk 1 · {{0}}").selectOption("Töre");

  const preview = page.getByLabel("Canlı önizleme");
  await expect(preview).toContainText("Türklerde");
  await expect(preview).toContainText("Töre");
  await expect(preview).not.toContainText("{{0}}");

  await page.getByRole("button", { name: "Kaydet", exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`${LIST_PATH}/exercises/\\d+$`));
  await expect(
    page.getByRole("heading", { name: "Boşluk doldurma sorusunu düzenle" }),
  ).toBeVisible();
  await expect(page.getByText("Tip: Boşluk doldurma")).toBeVisible();
  await expect(page.getByText("Taslak")).toBeVisible();
  await expect(page.getByText("v1")).toBeVisible();

  // Re-read the persisted question.
  await page.reload();
  await expect(page.getByLabel("Cümle şablonu")).toHaveValue(
    "Türklerde {{0}} adı verilir.",
  );
  await expect(page.getByLabel("1. seçenek metni")).toHaveValue("Töre");
  await expect(page.getByLabel("2. seçenek metni")).toHaveValue("Kurultay");
  await expect(page.getByLabel("Boşluk 1 · {{0}}")).toHaveValue("Töre");
});

test("renders one answer control per placeholder occurrence", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(NEW_PATH);

  await page.getByLabel("Konu").selectOption("1");
  await page.getByLabel("Cümle şablonu").fill("{{0}} ve {{1}} birlikte gelir.");

  await expect(page.getByText("2 boşluk bulundu.")).toBeVisible();
  await expect(page.getByLabel("Boşluk 1 · {{0}}")).toBeVisible();
  await expect(page.getByLabel("Boşluk 2 · {{1}}")).toBeVisible();

  await page.getByLabel("Boşluk 1 · {{0}}").fill("birinci");
  await page.getByLabel("Boşluk 2 · {{1}}").fill("ikinci");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`${LIST_PATH}/exercises/\\d+$`));
  await page.reload();
  await expect(page.getByLabel("Boşluk 1 · {{0}}")).toHaveValue("birinci");
  await expect(page.getByLabel("Boşluk 2 · {{1}}")).toHaveValue("ikinci");
});

test("hydrates a stored question and saves a changed answer", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(FILL_BLANK_PATH);

  await expect(
    page.getByRole("heading", { name: "Boşluk doldurma sorusunu düzenle" }),
  ).toBeVisible();
  await expect(page.getByLabel("Cümle şablonu")).toHaveValue(
    "Yazısız hukuk kurallarına {{0}} denir.",
  );
  await expect(page.getByLabel("1. seçenek metni")).toHaveValue("Töre");
  await expect(page.getByLabel("4. seçenek metni")).toHaveValue("Yuğ");
  await expect(page.getByLabel("Boşluk 1 · {{0}}")).toHaveValue("Töre");
  await expect(page.getByText("v1")).toBeVisible();

  await page.getByLabel("Boşluk 1 · {{0}}").selectOption("Kurultay");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();

  await expect(page.getByText("v2")).toBeVisible();
  await expect(page.getByText("Kaydedildi", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Boşluk 1 · {{0}}")).toHaveValue("Kurultay");
});

test("removing the used choice clears the answer instead of guessing", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(NEW_PATH);

  await page.getByLabel("Konu").selectOption("1");
  await page.getByLabel("Cümle şablonu").fill("Türklerde {{0}} denir.");
  await page.getByRole("button", { name: "Seçenek ekle" }).click();
  await page.getByLabel("1. seçenek metni").fill("Töre");
  await page.getByRole("button", { name: "Seçenek ekle" }).click();
  await page.getByLabel("2. seçenek metni").fill("Kurultay");
  await page.getByLabel("Boşluk 1 · {{0}}").selectOption("Töre");
  await expect(
    page.getByRole("button", { name: "Kaydet", exact: true }),
  ).toBeEnabled();

  await page.getByRole("button", { name: "1. seçeneği kaldır" }).click();

  await expect(page.getByLabel("Boşluk 1 · {{0}}")).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Kaydet", exact: true }),
  ).toBeDisabled();
});

test("Save & New keeps the fill blank context and clears the question", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(NEW_PATH);

  await page.getByLabel("Konu").selectOption("1");
  await page.getByLabel("Zorluk").selectOption("5");
  await page.getByLabel("Cümle şablonu").fill("Save and new {{0}} source.");
  await page.getByLabel("Boşluk 1 · {{0}}").fill("cevap");
  await page.getByLabel("Açıklama").fill("E2E açıklama");
  await page.getByRole("button", { name: "Kaydet ve Yeni" }).click();

  await expect(page.getByText("Kaydedildi. Yeni soru hazır.")).toBeVisible();
  await expect(page.getByText("Tip: Boşluk doldurma")).toBeVisible();
  await expect(page.getByLabel("Konu")).toHaveValue("1");
  await expect(page.getByLabel("Zorluk")).toHaveValue("5");
  await expect(page.getByLabel("TYT")).toBeChecked();
  await expect(page.getByLabel("Cümle şablonu")).toHaveValue("");
  await expect(page.getByLabel("Açıklama")).toHaveValue("");
  await expect(
    page.getByText("Boşluk bulunamadı.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("1. seçenek metni")).toHaveCount(0);
});

test("reviewer sees no fill blank create or edit surface and is refused by the BFF", async ({
  page,
}) => {
  await signIn(page, E2E_REVIEWER_EMAIL);
  await page.goto(LIST_PATH);

  for (const name of [
    "Çoktan seçmeli",
    "Doğru / yanlış",
    "Boşluk doldurma",
    "Sayısal cevap",
    "Bilgi kartı",
    "Düzenle",
  ]) {
    await expect(page.getByRole("link", { name })).toHaveCount(0);
  }

  await page.goto(NEW_PATH);
  await expect(page.getByText("Düzenleme yetkiniz yok.")).toBeVisible();
  await expect(page.getByLabel("Cümle şablonu")).toHaveCount(0);

  await page.goto(FILL_BLANK_PATH);
  await expect(page.getByText("Düzenleme yetkiniz yok.")).toBeVisible();

  const status = await page.evaluate(async () => {
    const response = await fetch("/api/admin/exercises", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "fill_blank",
        topic_id: 1,
        owner_unit_id: 11,
        difficulty: 3,
        content: { template: "x {{0}}", choices: [] },
        answer_key: { blanks: ["y"] },
        explanation: null,
        applicable_scopes: ["tyt"],
      }),
    });
    return response.status;
  });
  expect(status).toBe(403);
});

test("rejects a cross-field-invalid fill blank body before the backend", async ({
  page,
}) => {
  await signIn(page);

  const statuses = await page.evaluate(async () => {
    const base = {
      type: "fill_blank",
      topic_id: 1,
      owner_unit_id: 11,
      difficulty: 3,
      explanation: null,
      applicable_scopes: ["tyt"],
    };
    const bodies = [
      // No placeholder at all.
      {
        ...base,
        content: { template: "Düz metin.", choices: [] },
        answer_key: { blanks: ["A"] },
      },
      // Two placeholders, one answer.
      {
        ...base,
        content: { template: "{{0}} ve {{1}}", choices: [] },
        answer_key: { blanks: ["A"] },
      },
      // An answer that is not among the offered choices.
      {
        ...base,
        content: { template: "{{0}}", choices: ["A", "B"] },
        answer_key: { blanks: ["Z"] },
      },
      // A type this editor does not support.
      {
        ...base,
        type: "matching",
        content: { template: "{{0}}", choices: [] },
        answer_key: { blanks: ["A"] },
      },
    ];

    const results: number[] = [];
    for (const body of bodies) {
      const response = await fetch("/api/admin/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      results.push(response.status);
    }
    return results;
  });

  expect(statuses).toEqual([400, 400, 400, 400]);
});

test("never writes the template, choices or answers to the URL or storage", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(NEW_PATH);

  const TEMPLATE = "E2E depolama {{0}} sizintisi";
  const ANSWER = "E2E gizli cevap";
  await page.getByLabel("Konu").selectOption("1");
  await page.getByLabel("Cümle şablonu").fill(TEMPLATE);
  await page.getByLabel("Boşluk 1 · {{0}}").fill(ANSWER);
  await page.getByRole("button", { name: "Kaydet ve Yeni" }).click();
  await expect(page.getByText("Kaydedildi. Yeni soru hazır.")).toBeVisible();

  const stored = await page.evaluate(() => {
    const dump = (storage: Storage) =>
      Object.entries({ ...storage })
        .map(([key, value]) => `${key}=${String(value)}`)
        .join("|");
    return {
      local: dump(window.localStorage),
      session: dump(window.sessionStorage),
      cookie: document.cookie,
    };
  });

  for (const haystack of [stored.local, stored.session, stored.cookie]) {
    for (const secret of [
      TEMPLATE,
      ANSWER,
      "template",
      "choices",
      "blanks",
      "answer_key",
    ]) {
      expect(haystack).not.toContain(secret);
    }
  }

  // Only the safe routing enum stays in the URL.
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual({
    type: "fill_blank",
  });
});

test("fill blank editor stacks without horizontal overflow on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await signIn(page);
  await page.goto(NEW_PATH);

  await expect(
    page.getByRole("heading", { name: "Yeni boşluk doldurma sorusu" }),
  ).toBeVisible();
  await page
    .getByLabel("Cümle şablonu")
    .fill("Çok uzun {{0}} bir şablon {{1}} metni.");
  await page.getByRole("button", { name: "Seçenek ekle" }).click();
  await page.getByLabel("1. seçenek metni").fill("Uzunca bir seçenek metni");

  await expect(page.getByLabel("Boşluk 1 · {{0}}")).toBeVisible();
  await expect(page.getByLabel("Boşluk 2 · {{1}}")).toBeVisible();
  await expect(page.getByRole("button", { name: "Boşluk ekle" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Kaydet", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Canlı önizleme")).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
