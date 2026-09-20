import { expect, test, type Page } from "@playwright/test";

import {
  E2E_BASE_URL,
  E2E_COURSE_WITH_UNITS_ID,
  E2E_EMAIL,
  E2E_PASSWORD,
  E2E_REVIEWER_EMAIL,
  E2E_UNIT_WITH_EXERCISES_ID,
} from "./support/fixtures";

const LIST_PATH = `/courses/${E2E_COURSE_WITH_UNITS_ID}/units/${E2E_UNIT_WITH_EXERCISES_ID}`;
const NUMERIC_NEW_PATH = `${LIST_PATH}/exercises/new?type=numeric_input`;
const FLASHCARD_NEW_PATH = `${LIST_PATH}/exercises/new?type=flashcard`;

async function signIn(page: Page, email = E2E_EMAIL) {
  await page.goto("/login");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /giriş/i }).click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}/`);
}

test("creates a numeric question whose correct answer is 0 and reopens it", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(LIST_PATH);
  await page
    .getByRole("group", { name: "Yeni soru oluştur" })
    .getByRole("link", { name: "Sayısal cevap" })
    .click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}${NUMERIC_NEW_PATH}`);
  await expect(
    page.getByRole("heading", { name: "Yeni sayısal cevap sorusu" }),
  ).toBeVisible();

  // Nothing is prefilled: 0 has to be entered deliberately.
  await expect(page.getByLabel("Doğru sayı")).toHaveValue("");
  await expect(page.getByLabel("Tolerans")).toHaveValue("0");

  await page.getByLabel("Konu").selectOption("1");
  await page.getByLabel("Soru kökü").fill("E2E sıfır cevaplı soru");
  await page.getByLabel("Doğru sayı").fill("0");
  await page.getByLabel("Birim / son ek (opsiyonel)").fill("yılı");

  const preview = page.getByLabel("Canlı önizleme");
  await expect(preview).toContainText("E2E sıfır cevaplı soru");
  await expect(preview).toContainText("yılı");
  await expect(preview).toContainText("Tolerans: ±0");

  await page.getByRole("button", { name: "Kaydet", exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`${LIST_PATH}/exercises/\\d+$`));
  await expect(
    page.getByRole("heading", { name: "Sayısal cevap sorusunu düzenle" }),
  ).toBeVisible();
  await expect(page.getByText("Tip: Sayısal cevap")).toBeVisible();
  await expect(page.getByText("Taslak")).toBeVisible();
  await expect(page.getByText("v1")).toBeVisible();

  // Re-read the persisted question: the stored answer really is 0.
  await page.reload();
  await expect(page.getByLabel("Doğru sayı")).toHaveValue("0");
  await expect(page.getByLabel("Tolerans")).toHaveValue("0");
  await expect(page.getByLabel("Birim / son ek (opsiyonel)")).toHaveValue(
    "yılı",
  );

  // Edit the stored zero into a decimal and confirm the version moves.
  await page.getByLabel("Doğru sayı").fill("0.33");
  await page.getByLabel("Tolerans").fill("0.01");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();

  await expect(page.getByText("v2")).toBeVisible();
  await expect(page.getByText("Kaydedildi", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Doğru sayı")).toHaveValue("0.33");
  await expect(page.getByLabel("Tolerans")).toHaveValue("0.01");
});

test("blocks a numeric save on an empty answer or a negative tolerance", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(NUMERIC_NEW_PATH);

  await page.getByLabel("Konu").selectOption("1");
  await page.getByLabel("Soru kökü").fill("E2E doğrulama sorusu");
  const save = page.getByRole("button", { name: "Kaydet", exact: true });

  await expect(save).toBeDisabled();

  await page.getByLabel("Doğru sayı").fill("5");
  await expect(save).toBeEnabled();

  await page.getByLabel("Doğru sayı").fill("");
  await expect(save).toBeDisabled();

  await page.getByLabel("Doğru sayı").fill("5");
  await page.getByLabel("Tolerans").fill("-1");
  await expect(save).toBeDisabled();
  await expect(page.getByText("Tolerans negatif olamaz.")).toBeVisible();
});

test("Save & New keeps the numeric context and clears the answer", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(NUMERIC_NEW_PATH);

  await page.getByLabel("Konu").selectOption("1");
  await page.getByLabel("Zorluk").selectOption("5");
  await page.getByLabel("Soru kökü").fill("E2E save and new numeric");
  await page.getByLabel("Doğru sayı").fill("375");
  await page.getByLabel("Birim / son ek (opsiyonel)").fill("yılı");
  await page.getByLabel("Açıklama").fill("E2E açıklama");
  await page.getByRole("button", { name: "Kaydet ve Yeni" }).click();

  await expect(page.getByText("Kaydedildi. Yeni soru hazır.")).toBeVisible();
  await expect(page.getByText("Tip: Sayısal cevap")).toBeVisible();
  await expect(page.getByLabel("Konu")).toHaveValue("1");
  await expect(page.getByLabel("Zorluk")).toHaveValue("5");
  await expect(page.getByLabel("TYT")).toBeChecked();
  await expect(page.getByLabel("Soru kökü")).toHaveValue("");
  await expect(page.getByLabel("Doğru sayı")).toHaveValue("");
  await expect(page.getByLabel("Tolerans")).toHaveValue("0");
  await expect(page.getByLabel("Birim / son ek (opsiyonel)")).toHaveValue("");
  await expect(page.getByLabel("Açıklama")).toHaveValue("");
});

test("creates a flashcard, reopens it and updates a face", async ({ page }) => {
  await signIn(page);
  await page.goto(LIST_PATH);
  await page
    .getByRole("group", { name: "Yeni soru oluştur" })
    .getByRole("link", { name: "Bilgi kartı" })
    .click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}${FLASHCARD_NEW_PATH}`);
  await expect(
    page.getByRole("heading", { name: "Yeni bilgi kartı" }),
  ).toBeVisible();

  await page.getByLabel("Konu").selectOption("1");
  await page.getByLabel("Ön yüz").fill("E2E kart ön yüzü");
  await page.getByLabel("Arka yüz").fill("E2E kart arka yüzü");

  const preview = page.getByLabel("Canlı önizleme");
  await expect(preview).toContainText("E2E kart ön yüzü");
  await expect(preview).toContainText("E2E kart arka yüzü");

  await page.getByRole("button", { name: "Kaydet", exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`${LIST_PATH}/exercises/\\d+$`));
  await expect(
    page.getByRole("heading", { name: "Bilgi kartını düzenle" }),
  ).toBeVisible();
  await expect(page.getByText("Tip: Bilgi kartı")).toBeVisible();
  await expect(page.getByText("v1")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Ön yüz")).toHaveValue("E2E kart ön yüzü");
  await expect(page.getByLabel("Arka yüz")).toHaveValue("E2E kart arka yüzü");
  // self_assessed is metadata, never an author-facing control.
  await expect(page.getByLabel(/kendi değerlendir/i)).toHaveCount(0);

  await page.getByLabel("Arka yüz").fill("E2E güncellenmiş arka yüz");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();

  await expect(page.getByText("v2")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Arka yüz")).toHaveValue(
    "E2E güncellenmiş arka yüz",
  );
});

test("Save & New keeps the flashcard context and clears both faces", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(FLASHCARD_NEW_PATH);

  await page.getByLabel("Konu").selectOption("1");
  await page.getByLabel("Zorluk").selectOption("4");
  await page.getByLabel("Ön yüz").fill("E2E ön");
  await page.getByLabel("Arka yüz").fill("E2E arka");
  await page.getByRole("button", { name: "Kaydet ve Yeni" }).click();

  await expect(page.getByText("Kaydedildi. Yeni soru hazır.")).toBeVisible();
  await expect(page.getByText("Tip: Bilgi kartı")).toBeVisible();
  await expect(page.getByLabel("Konu")).toHaveValue("1");
  await expect(page.getByLabel("Zorluk")).toHaveValue("4");
  await expect(page.getByLabel("Ön yüz")).toHaveValue("");
  await expect(page.getByLabel("Arka yüz")).toHaveValue("");
});

test("reviewer sees none of the five create options and is refused by the BFF", async ({
  page,
}) => {
  await signIn(page, E2E_REVIEWER_EMAIL);
  await page.goto(LIST_PATH);

  await expect(
    page.getByRole("group", { name: "Yeni soru oluştur" }),
  ).toHaveCount(0);
  for (const label of [
    "Çoktan seçmeli",
    "Doğru / yanlış",
    "Boşluk doldurma",
    "Sayısal cevap",
    "Bilgi kartı",
    "Düzenle",
  ]) {
    await expect(page.getByRole("link", { name: label })).toHaveCount(0);
  }

  for (const path of [NUMERIC_NEW_PATH, FLASHCARD_NEW_PATH]) {
    await page.goto(path);
    await expect(page.getByText("Düzenleme yetkiniz yok.")).toBeVisible();
    await expect(page.getByLabel("Doğru sayı")).toHaveCount(0);
    await expect(page.getByLabel("Ön yüz")).toHaveCount(0);
  }

  const statuses = await page.evaluate(async () => {
    const base = {
      topic_id: 1,
      owner_unit_id: 11,
      difficulty: 3,
      explanation: null,
      applicable_scopes: ["tyt"],
    };
    const bodies = [
      {
        ...base,
        type: "numeric_input",
        content: { stem: "x" },
        answer_key: { value: 1, tolerance: 0 },
      },
      {
        ...base,
        type: "flashcard",
        content: { front: "a", back: "b" },
        answer_key: { self_assessed: true },
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

  expect(statuses).toEqual([403, 403]);
});

test("rejects tampered numeric and unsupported-type bodies before the backend", async ({
  page,
}) => {
  await signIn(page);

  const statuses = await page.evaluate(async () => {
    const base = {
      topic_id: 1,
      owner_unit_id: 11,
      difficulty: 3,
      explanation: null,
      applicable_scopes: ["tyt"],
    };
    const bodies = [
      // A numeric answer sent as a string.
      {
        ...base,
        type: "numeric_input",
        content: { stem: "x" },
        answer_key: { value: "0", tolerance: 0 },
      },
      // A negative tolerance.
      {
        ...base,
        type: "numeric_input",
        content: { stem: "x" },
        answer_key: { value: 1, tolerance: -1 },
      },
      // Types this editor still does not support.
      {
        ...base,
        type: "matching",
        content: { front: "a", back: "b" },
        answer_key: { self_assessed: true },
      },
      {
        ...base,
        type: "ordering",
        content: { front: "a", back: "b" },
        answer_key: { self_assessed: true },
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

test("never writes numeric or flashcard content to the URL or storage", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(NUMERIC_NEW_PATH);

  const STEM = "E2E depolama sizinti soru kökü";
  await page.getByLabel("Konu").selectOption("1");
  await page.getByLabel("Soru kökü").fill(STEM);
  await page.getByLabel("Doğru sayı").fill("1234");
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
      STEM,
      "1234",
      "answerValue",
      "answer_key",
      "tolerance",
      "suffix",
    ]) {
      expect(haystack).not.toContain(secret);
    }
  }

  // Only the safe routing enum stays in the URL.
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual({
    type: "numeric_input",
  });
});

test("both editors stack without horizontal overflow on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await signIn(page);

  for (const path of [NUMERIC_NEW_PATH, FLASHCARD_NEW_PATH]) {
    await page.goto(path);
    await expect(page.getByLabel("Konu")).toBeVisible();
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
  }

  // The create group has to wrap on a phone too.
  await page.goto(LIST_PATH);
  await expect(
    page.getByRole("group", { name: "Yeni soru oluştur" }).getByRole("link"),
  ).toHaveCount(8);
  const listOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(listOverflow).toBeLessThanOrEqual(0);
});
