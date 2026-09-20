import { expect, test, type Page } from "@playwright/test";

import {
  E2E_BASE_URL,
  E2E_COURSE_WITH_UNITS_ID,
  E2E_EMAIL,
  E2E_PASSWORD,
  E2E_REVIEWER_EMAIL,
  E2E_UNIT_WITH_EXERCISES_ID,
  E2E_UNIT_WITH_STRUCTURED_ID,
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
const STRUCTURED_LIST_PATH = `/courses/${E2E_COURSE_WITH_UNITS_ID}/units/${E2E_UNIT_WITH_STRUCTURED_ID}`;
const MATCHING_NEW_PATH = `${LIST_PATH}/exercises/new?type=matching`;
const ORDERING_NEW_PATH = `${LIST_PATH}/exercises/new?type=ordering`;
const WORD_ORDER_NEW_PATH = `${LIST_PATH}/exercises/new?type=word_order`;
/** The seeded matching, ordering, word order and diagram_label rows. */
const MATCHING_EDIT_PATH = `${LIST_PATH}/exercises/104`;
const ORDERING_EDIT_PATH = `${STRUCTURED_LIST_PATH}/exercises/106`;
const WORD_ORDER_EDIT_PATH = `${STRUCTURED_LIST_PATH}/exercises/107`;
const DIAGRAM_EDIT_PATH = `${STRUCTURED_LIST_PATH}/exercises/108`;
const HOTSPOT_EDIT_PATH = `${LIST_PATH}/exercises/105`;
/** A matching row no other spec mutates, so its mapping is always pristine. */
const PRISTINE_MATCHING_PATH = `${STRUCTURED_LIST_PATH}/exercises/109`;

async function signIn(page: Page, email = E2E_EMAIL) {
  await page.goto("/login");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /giriş/i }).click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}/`);
}

/** The correct-order rows, as the author reads them. */
function orderRows(page: Page, heading: string) {
  return page.getByRole("region", { name: heading }).getByRole("listitem");
}

test("creates a matching question and reopens the persisted mapping", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(LIST_PATH);
  await page
    .getByRole("group", { name: "Yeni soru oluştur" })
    .getByRole("link", { name: "Eşleştirme" })
    .click();

  await expect(page).toHaveURL(`${E2E_BASE_URL}${MATCHING_NEW_PATH}`);
  await expect(
    page.getByRole("heading", { name: "Yeni eşleştirme sorusu" }),
  ).toBeVisible();

  await page.getByLabel("Konu").selectOption("1");
  await page.getByLabel("Zorluk").selectOption("4");
  await page.getByLabel("Sol öğe 1 metni").fill("E2E Kurultay");
  await page.getByLabel("Sol öğe 2 metni").fill("E2E Kut");
  await page.getByRole("button", { name: "Sol öğe ekle" }).click();
  await page.getByLabel("Sol öğe 3 metni").fill("E2E Töre");
  await page.getByLabel("Sağ öğe 1 metni").fill("E2E Meclis");
  await page.getByLabel("Sağ öğe 2 metni").fill("E2E Yetki");

  await page.getByLabel("E2E Kurultay için eşleşen sağ öğe").selectOption("a");
  await page.getByLabel("E2E Kut için eşleşen sağ öğe").selectOption("b");
  // The same right item may serve two left items; the backend allows it.
  await page.getByLabel("E2E Töre için eşleşen sağ öğe").selectOption("a");
  await page.getByLabel("Kısmi puan ver").check();
  await page.getByLabel("Açıklama").fill("E2E eşleştirme açıklaması");

  const preview = page.getByLabel("Canlı önizleme");
  await expect(preview.getByText("E2E Kurultay → E2E Meclis")).toBeVisible();
  await expect(preview.getByText("E2E Töre → E2E Meclis")).toBeVisible();
  await expect(preview.getByText("Kısmi puan: Açık")).toBeVisible();

  await page.getByRole("button", { name: "Kaydet", exact: true }).click();

  await expect(page).toHaveURL(
    new RegExp(`${LIST_PATH}/exercises/\\d+$`.replace(/\//g, "\\/")),
  );
  await expect(
    page.getByRole("heading", { name: "Eşleştirme sorusunu düzenle" }),
  ).toBeVisible();

  // The mapping came back from the backend, not from client state.
  await expect(
    page.getByLabel("E2E Kurultay için eşleşen sağ öğe"),
  ).toHaveValue("a");
  await expect(page.getByLabel("E2E Kut için eşleşen sağ öğe")).toHaveValue(
    "b",
  );
  await expect(page.getByLabel("E2E Töre için eşleşen sağ öğe")).toHaveValue(
    "a",
  );
  await expect(page.getByLabel("Kısmi puan ver")).toBeChecked();
});

test("edits a stored matching question and surfaces the answer-key warning", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(MATCHING_EDIT_PATH);

  await expect(
    page.getByRole("heading", { name: "Eşleştirme sorusunu düzenle" }),
  ).toBeVisible();
  await expect(page.getByLabel("Töre için eşleşen sağ öğe")).toHaveValue("r1");
  await expect(page.getByLabel("Kurultay için eşleşen sağ öğe")).toHaveValue(
    "r2",
  );
  await expect(page.getByLabel("Kısmi puan ver")).toBeChecked();
  await expect(page.getByText("v1")).toBeVisible();

  await page.getByLabel("Kurultay için eşleşen sağ öğe").selectOption("r3");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();

  await expect(page.getByText("Kaydedildi")).toBeVisible();
  await expect(page.getByText("v2")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Kurultay için eşleşen sağ öğe")).toHaveValue(
    "r3",
  );
  await expect(page.getByLabel("Töre için eşleşen sağ öğe")).toHaveValue("r1");
});

test("clears a matching pair whose right item is removed", async ({ page }) => {
  await signIn(page);
  await page.goto(PRISTINE_MATCHING_PATH);
  await expect(page.getByLabel("Yuğ için eşleşen sağ öğe")).toHaveValue("r1");

  await page
    .getByRole("button", { name: "Cenaze töreni sağ öğesini kaldır" })
    .click();

  // The affected selection is cleared, never re-pointed at a neighbour, and
  // the untouched row keeps its answer.
  await expect(page.getByLabel("Yuğ için eşleşen sağ öğe")).toHaveValue("");
  await expect(page.getByLabel("Toy için eşleşen sağ öğe")).toHaveValue("r2");
  await expect(
    page.getByRole("button", { name: "Kaydet", exact: true }),
  ).toBeDisabled();
});

test("creates an ordering question with the move controls and persists the order", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(LIST_PATH);
  await page
    .getByRole("group", { name: "Yeni soru oluştur" })
    .getByRole("link", { name: "Sıralama", exact: true })
    .click();

  await expect(page).toHaveURL(`${E2E_BASE_URL}${ORDERING_NEW_PATH}`);
  await page.getByLabel("Konu").selectOption("1");
  await page.getByLabel("Yönerge").fill("E2E eskiden yeniye sırala.");
  await page.getByLabel("Öğe 1 metni").fill("E2E Göktürkler");
  await page.getByLabel("Öğe 2 metni").fill("E2E Uygurlar");
  await page.getByRole("button", { name: "Öğe ekle" }).click();
  await page.getByLabel("Öğe 3 metni").fill("E2E Asya Hunları");

  await expect(orderRows(page, "Doğru sıra")).toHaveText([
    /E2E Göktürkler/,
    /E2E Uygurlar/,
    /E2E Asya Hunları/,
  ]);

  // Stable move buttons rather than a brittle pixel drag: the keyboard path is
  // the one an author has to be able to rely on.
  await page
    .getByRole("button", { name: "E2E Asya Hunları öğesini yukarı taşı" })
    .click();
  await page
    .getByRole("button", { name: "E2E Asya Hunları öğesini yukarı taşı" })
    .click();

  await expect(orderRows(page, "Doğru sıra")).toHaveText([
    /E2E Asya Hunları/,
    /E2E Göktürkler/,
    /E2E Uygurlar/,
  ]);

  const preview = page.getByLabel("Canlı önizleme");
  await expect(preview.getByText("1. E2E Asya Hunları")).toBeVisible();
  await expect(preview.getByText("3. E2E Uygurlar")).toBeVisible();

  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sıralama sorusunu düzenle" }),
  ).toBeVisible();

  await page.reload();
  // The persisted answer order came back in the order the author set, while
  // the content list kept its own authoring order.
  await expect(orderRows(page, "Doğru sıra")).toHaveText([
    /E2E Asya Hunları/,
    /E2E Göktürkler/,
    /E2E Uygurlar/,
  ]);
  await expect(page.getByLabel("Öğe 1 metni")).toHaveValue("E2E Göktürkler");
});

test("reorders a stored ordering answer with the keyboard alone", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(ORDERING_EDIT_PATH);

  await expect(
    page.getByRole("heading", { name: "Sıralama sorusunu düzenle" }),
  ).toBeVisible();
  await expect(orderRows(page, "Doğru sıra")).toHaveText([
    /Asya Hunları/,
    /Göktürkler/,
    /Uygurlar/,
  ]);
  // The content list order is its own concept and is not the answer order.
  await expect(page.getByLabel("Öğe 1 metni")).toHaveValue("Uygurlar");

  await page
    .getByRole("button", { name: "Uygurlar öğesini yukarı taşı" })
    .focus();
  await page.keyboard.press("Enter");

  await expect(orderRows(page, "Doğru sıra")).toHaveText([
    /Asya Hunları/,
    /Uygurlar/,
    /Göktürkler/,
  ]);
  // Focus stays on the row the author just moved.
  await expect(
    page.getByRole("button", { name: "Uygurlar öğesini yukarı taşı" }),
  ).toBeFocused();

  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(page.getByText("v2")).toBeVisible();

  await page.reload();
  await expect(orderRows(page, "Doğru sıra")).toHaveText([
    /Asya Hunları/,
    /Uygurlar/,
    /Göktürkler/,
  ]);
  await expect(page.getByLabel("Öğe 1 metni")).toHaveValue("Uygurlar");
});

test("creates a word order question and previews the correct sentence", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(LIST_PATH);
  await page
    .getByRole("group", { name: "Yeni soru oluştur" })
    .getByRole("link", { name: "Kelime sıralama" })
    .click();

  await expect(page).toHaveURL(`${E2E_BASE_URL}${WORD_ORDER_NEW_PATH}`);
  // Word order has no partial credit at all: the grader is all-or-nothing.
  await expect(page.getByLabel("Kısmi puan ver")).toHaveCount(0);
  await expect(page.getByText(/kısmi puan yoktur/i)).toBeVisible();

  await page.getByLabel("Konu").selectOption("1");
  await page.getByLabel("Yönerge").fill("E2E doğru cümleyi oluştur.");
  await page.getByLabel("Kelime 1 metni").fill("Ben");
  await page.getByLabel("Kelime 2 metni").fill("gittim");
  await page.getByRole("button", { name: "Kelime ekle" }).click();
  await page.getByLabel("Kelime 3 metni").fill("okula");

  await page.getByRole("button", { name: "okula öğesini yukarı taşı" }).click();

  const preview = page.getByLabel("Canlı önizleme");
  await expect(preview.getByText("Ben okula gittim")).toBeVisible();

  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Kelime sıralama sorusunu düzenle" }),
  ).toBeVisible();

  await page.reload();
  await expect(orderRows(page, "Doğru cümle sırası")).toHaveText([
    /Ben/,
    /okula/,
    /gittim/,
  ]);
});

test("edits a stored word order question", async ({ page }) => {
  await signIn(page);
  await page.goto(WORD_ORDER_EDIT_PATH);

  await expect(
    page.getByRole("heading", { name: "Kelime sıralama sorusunu düzenle" }),
  ).toBeVisible();
  await expect(orderRows(page, "Doğru cümle sırası")).toHaveText([
    /Ben/,
    /okula/,
    /gittim/,
  ]);

  await page
    .getByRole("button", { name: "gittim öğesini yukarı taşı" })
    .click();
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(page.getByText("v2")).toBeVisible();

  await page.reload();
  await expect(orderRows(page, "Doğru cümle sırası")).toHaveText([
    /Ben/,
    /gittim/,
    /okula/,
  ]);
});

test("uses Save & New to start a fresh structured question", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(ORDERING_NEW_PATH);

  await page.getByLabel("Konu").selectOption("1");
  await page.getByLabel("Zorluk").selectOption("5");
  await page.getByLabel("Yönerge").fill("E2E kaydet ve yeni");
  await page.getByLabel("Öğe 1 metni").fill("E2E bir");
  await page.getByLabel("Öğe 2 metni").fill("E2E iki");

  await page.getByRole("button", { name: "Kaydet ve Yeni" }).click();
  await expect(page.getByText("Kaydedildi. Yeni soru hazır.")).toBeVisible();

  // Shared context survives; the question itself does not.
  await expect(page.getByLabel("Konu")).toHaveValue("1");
  await expect(page.getByLabel("Zorluk")).toHaveValue("5");
  await expect(page.getByLabel("Yönerge")).toHaveValue("");
  await expect(page.getByLabel("Öğe 1 metni")).toHaveValue("");
  await expect(page.getByLabel("Öğe 2 metni")).toHaveValue("");
  await expect(orderRows(page, "Doğru sıra")).toHaveCount(2);
});

test("keeps the media types readable and non-editable", async ({ page }) => {
  await signIn(page);
  await page.goto(STRUCTURED_LIST_PATH);

  // The diagram_label row is listed and readable; it just has no edit action.
  const rows = page.getByRole("listitem");
  await expect(rows.filter({ hasText: "Diyagram Etiketleme" })).toHaveCount(1);
  // ordering, word_order and matching are editable; diagram_label is not.
  await expect(page.getByRole("link", { name: "Düzenle" })).toHaveCount(3);

  for (const path of [DIAGRAM_EDIT_PATH, HOTSPOT_EDIT_PATH]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", {
        name: "Bu soru tipi henüz bu editörde desteklenmiyor.",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Kaydet", exact: true }),
    ).toHaveCount(0);
  }
});

test("renders an unsupported state for an unknown or repeated create type", async ({
  page,
}) => {
  await signIn(page);

  for (const search of [
    "?type=image_hotspot",
    "?type=diagram_label",
    "?type=banana",
    "?type=matching&type=ordering",
  ]) {
    await page.goto(`${LIST_PATH}/exercises/new${search}`);
    await expect(
      page.getByRole("heading", {
        name: "Bu soru tipi henüz bu editörde desteklenmiyor.",
      }),
    ).toBeVisible();
    await expect(page.getByLabel("Sol öğe 1 metni")).toHaveCount(0);
    await expect(page.getByLabel("Yönerge")).toHaveCount(0);
  }
});

test("reviewer sees no structured create or edit surface and is refused by the BFF", async ({
  page,
}) => {
  await signIn(page, E2E_REVIEWER_EMAIL);
  await page.goto(STRUCTURED_LIST_PATH);

  await expect(
    page.getByRole("group", { name: "Yeni soru oluştur" }),
  ).toHaveCount(0);
  for (const label of [
    "Eşleştirme",
    "Sıralama",
    "Kelime sıralama",
    "Düzenle",
  ]) {
    await expect(page.getByRole("link", { name: label })).toHaveCount(0);
  }

  for (const path of [
    MATCHING_NEW_PATH,
    ORDERING_NEW_PATH,
    WORD_ORDER_NEW_PATH,
  ]) {
    await page.goto(path);
    await expect(page.getByText("Düzenleme yetkiniz yok.")).toBeVisible();
    await expect(page.getByLabel("Sol öğe 1 metni")).toHaveCount(0);
    await expect(page.getByLabel("Yönerge")).toHaveCount(0);
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
        type: "matching",
        content: {
          left: [
            { id: "1", text: "A" },
            { id: "2", text: "B" },
          ],
          right: [
            { id: "a", text: "X" },
            { id: "b", text: "Y" },
          ],
        },
        answer_key: { pairs: { "1": "a", "2": "b" }, partial_credit: false },
      },
      {
        ...base,
        type: "ordering",
        content: {
          instruction: "Sırala.",
          items: [
            { id: "1", text: "A" },
            { id: "2", text: "B" },
          ],
        },
        answer_key: { order: ["1", "2"] },
      },
      {
        ...base,
        type: "word_order",
        content: {
          instruction: "Cümle kur.",
          words: [
            { id: "1", text: "A" },
            { id: "2", text: "B" },
          ],
        },
        answer_key: { order: ["1", "2"] },
      },
    ];

    const results: number[] = [];
    for (const body of bodies) {
      const response = await fetch("/api/admin/exercises", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      results.push(response.status);
    }
    return results;
  });

  expect(statuses).toEqual([403, 403, 403]);
});

test("fits a phone and a desktop viewport without horizontal overflow", async ({
  page,
}) => {
  await signIn(page);

  for (const size of [
    { width: 1440, height: 900 },
    { width: 375, height: 760 },
  ]) {
    await page.setViewportSize(size);

    for (const path of [
      MATCHING_NEW_PATH,
      ORDERING_NEW_PATH,
      MATCHING_EDIT_PATH,
      ORDERING_EDIT_PATH,
    ]) {
      await page.goto(path);
      await expect(
        page.getByRole("button", { name: "Kaydet", exact: true }),
      ).toBeVisible();

      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, `${path} at ${size.width}px`).toBeLessThanOrEqual(0);
    }
  }
});
