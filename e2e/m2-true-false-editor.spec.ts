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
const NEW_PATH = `${LIST_PATH}/exercises/new?type=true_false`;
/** Seeded by the mock backend with the falsy boolean answer `false`. */
const TRUE_FALSE_PATH = `${LIST_PATH}/exercises/102`;

async function signIn(page: Page, email = E2E_EMAIL) {
  await page.goto("/login");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /giriş/i }).click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}/`);
}

test("creates a real true/false draft with a false answer and enters edit mode", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(LIST_PATH);
  await page.getByRole("link", { name: "Yeni doğru / yanlış" }).click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}${NEW_PATH}`);
  await expect(
    page.getByRole("heading", { name: "Yeni doğru / yanlış sorusu" }),
  ).toBeVisible();

  // Nothing is preselected: the editor must not invent an answer.
  await expect(page.getByLabel("Doğru")).not.toBeChecked();
  await expect(page.getByLabel("Yanlış")).not.toBeChecked();

  await page.getByLabel("Konu").selectOption("1");
  await page.getByLabel("İfade").fill("E2E yeni doğru yanlış ifadesi");
  await page.getByLabel("Yanlış").check();

  const preview = page.getByLabel("Canlı önizleme");
  await expect(preview).toContainText("E2E yeni doğru yanlış ifadesi");
  await expect(preview).toContainText("Yanlış");
  await expect(preview).not.toContainText("Seçilmedi");

  await page.getByRole("button", { name: "Kaydet", exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`${LIST_PATH}/exercises/\\d+$`));
  await expect(
    page.getByRole("heading", { name: "Doğru / yanlış sorusunu düzenle" }),
  ).toBeVisible();
  await expect(page.getByText("Tip: Doğru / Yanlış")).toBeVisible();
  await expect(page.getByText("Taslak")).toBeVisible();
  await expect(page.getByText("v1")).toBeVisible();

  // Re-read the persisted question: the stored answer really is `false`.
  await page.reload();
  await expect(page.getByLabel("İfade")).toHaveValue(
    "E2E yeni doğru yanlış ifadesi",
  );
  await expect(page.getByLabel("Yanlış")).toBeChecked();
  await expect(page.getByLabel("Doğru")).not.toBeChecked();
});

test("hydrates a stored false answer as Yanlış and increments the version on a flip", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(TRUE_FALSE_PATH);

  await expect(
    page.getByRole("heading", { name: "Doğru / yanlış sorusunu düzenle" }),
  ).toBeVisible();
  // The falsy boolean must survive hydration.
  await expect(page.getByLabel("Yanlış")).toBeChecked();
  await expect(page.getByLabel("Doğru")).not.toBeChecked();
  await expect(page.getByText("v2")).toBeVisible();

  await page.getByLabel("İfade").fill("E2E güncellenmiş Uygur ifadesi");
  await page.getByLabel("Doğru").check();
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();

  await expect(page.getByText("v3")).toBeVisible();
  await expect(page.getByText("Kaydedildi", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Doğru")).toBeChecked();
  await expect(page.getByLabel("İfade")).toHaveValue(
    "E2E güncellenmiş Uygur ifadesi",
  );
});

test("Save & New keeps the true/false context and clears the answer", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(NEW_PATH);
  await page.getByLabel("Konu").selectOption("1");
  await page.getByLabel("Zorluk").selectOption("5");
  await page.getByLabel("İfade").fill("Save and new true false source");
  await page.getByLabel("Açıklama").fill("E2E açıklama");
  await page.getByLabel("Doğru").check();
  await page.getByRole("button", { name: "Kaydet ve Yeni" }).click();

  await expect(page.getByText("Kaydedildi. Yeni soru hazır.")).toBeVisible();
  await expect(page.getByText("Tip: Doğru / Yanlış")).toBeVisible();
  await expect(page.getByLabel("Konu")).toHaveValue("1");
  await expect(page.getByLabel("Zorluk")).toHaveValue("5");
  await expect(page.getByLabel("TYT")).toBeChecked();
  await expect(page.getByLabel("İfade")).toHaveValue("");
  await expect(page.getByLabel("Açıklama")).toHaveValue("");
  await expect(page.getByLabel("Doğru")).not.toBeChecked();
  await expect(page.getByLabel("Yanlış")).not.toBeChecked();
});

test("renders a safe state for an unsupported or malformed create type", async ({
  page,
}) => {
  await signIn(page);

  for (const query of ["?type=matching", "?type=banana", "?type=fill_blank"]) {
    await page.goto(`${LIST_PATH}/exercises/new${query}`);
    await expect(
      page.getByRole("heading", {
        name: "Bu soru tipi henüz bu editörde desteklenmiyor.",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Kaydet", exact: true }),
    ).toHaveCount(0);
  }

  // A repeated parameter arrives as an array and must not open an editor.
  await page.goto(
    `${LIST_PATH}/exercises/new?type=true_false&type=multiple_choice`,
  );
  await expect(
    page.getByRole("heading", {
      name: "Bu soru tipi henüz bu editörde desteklenmiyor.",
    }),
  ).toBeVisible();
});

test("keeps an unsupported stored type readable but not editable", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(LIST_PATH);
  // fill_blank stays listed and readable, with no edit link on its own row.
  const fillBlankRow = page
    .locator("main ul li")
    .filter({ hasText: "Yazısız hukuk kurallarına {{0}} denir." });
  await expect(fillBlankRow).toHaveCount(1);
  await expect(fillBlankRow.getByRole("link", { name: "Düzenle" })).toHaveCount(
    0,
  );

  await page.goto(`${LIST_PATH}/exercises/103`);
  await expect(
    page.getByRole("heading", {
      name: "Bu soru tipi henüz bu editörde desteklenmiyor.",
    }),
  ).toBeVisible();
});

test("reviewer sees no true/false create or edit surface and is refused by the BFF", async ({
  page,
}) => {
  await signIn(page, E2E_REVIEWER_EMAIL);
  await page.goto(LIST_PATH);

  // Earlier tests in this suite mutate the seeded previews, so assert the
  // list renders at all rather than pinning one row's text.
  await expect(page.locator("main ul li").first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Yeni doğru / yanlış" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Yeni çoktan seçmeli" }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Düzenle" })).toHaveCount(0);

  await page.goto(NEW_PATH);
  await expect(page.getByText("Düzenleme yetkiniz yok.")).toBeVisible();
  await expect(page.getByLabel("İfade")).toHaveCount(0);

  await page.goto(TRUE_FALSE_PATH);
  await expect(page.getByText("Düzenleme yetkiniz yok.")).toBeVisible();

  const status = await page.evaluate(async () => {
    const response = await fetch("/api/admin/exercises", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "true_false",
        topic_id: 1,
        owner_unit_id: 11,
        difficulty: 3,
        content: { statement: "x" },
        answer_key: { value: false },
        explanation: null,
        applicable_scopes: ["tyt"],
      }),
    });
    return response.status;
  });
  expect(status).toBe(403);
});

test("rejects a tampered true/false body before it reaches the backend", async ({
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
      // A string boolean the backend grader would never match.
      {
        ...base,
        type: "true_false",
        content: { statement: "x" },
        answer_key: { value: "false" },
      },
      {
        ...base,
        type: "true_false",
        content: { statement: "x" },
        answer_key: { value: 1 },
      },
      // A type this editor does not support.
      {
        ...base,
        type: "matching",
        content: { statement: "x" },
        answer_key: { value: true },
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

  expect(statuses).toEqual([400, 400, 400]);
});

test("true/false editor stacks without horizontal overflow on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await signIn(page);
  await page.goto(NEW_PATH);

  await expect(
    page.getByRole("heading", { name: "Yeni doğru / yanlış sorusu" }),
  ).toBeVisible();
  await expect(page.getByLabel("İfade")).toBeVisible();
  await expect(page.getByLabel("Doğru")).toBeVisible();
  await expect(page.getByLabel("Yanlış")).toBeVisible();
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

test("never writes the answer to browser storage or the URL", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(NEW_PATH);

  const STATEMENT = "E2E depolama sizinti ifadesi";
  await page.getByLabel("Konu").selectOption("1");
  await page.getByLabel("İfade").fill(STATEMENT);
  await page.getByLabel("Yanlış").check();
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
      STATEMENT,
      "answerValue",
      "answer_key",
      "statement",
    ]) {
      expect(haystack).not.toContain(secret);
    }
  }

  // The preserved Save & New context never carries the answer either.
  expect(new URL(page.url()).searchParams.get("type")).toBe("true_false");
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual({
    type: "true_false",
  });
});
