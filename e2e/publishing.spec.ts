import { expect, test, type Page } from "@playwright/test";

import {
  E2E_BASE_URL,
  E2E_BLOCKED_NODE_TITLE,
  E2E_EMAIL,
  E2E_PASSWORD,
  E2E_REVIEWER_EMAIL,
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

async function signIn(page: Page, email = E2E_EMAIL) {
  await page.goto("/login");
  await page.waitForFunction(() => {
    const form = document.querySelector("form");

    return (
      form !== null &&
      Object.keys(form).some((key) => key.startsWith("__react"))
    );
  });
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /giriş/i }).click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}/`);
}

function group(page: Page, name: RegExp) {
  return page.getByRole("region", { name });
}

function card(page: Page, unitTitle: string) {
  return page.getByRole("article", { name: unitTitle });
}

async function checkEverything(page: Page) {
  await page
    .getByRole("button", { name: /^Bilinmeyenleri kontrol et/ })
    .click();
  await expect(page.getByText("Kontrol tamamlandı.")).toBeVisible();
}

test("groups every unit by the backend's readiness verdicts", async ({
  page,
}) => {
  await signIn(page);

  await page.getByRole("link", { name: "Yayın Merkezi" }).first().click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}/publishing`);
  await expect(
    page.getByRole("heading", { name: "Yayın Merkezi" }),
  ).toBeVisible();

  // Nothing is checked on arrival: every draft unit's readiness is unknown.
  await expect(
    group(page, /Hazırlık durumu bilinmiyor/).getByRole("article"),
  ).toHaveCount(4);
  await expect(group(page, /Zaten yayında/).getByRole("article")).toHaveCount(
    1,
  );

  await checkEverything(page);

  await expect(group(page, /^Yayına hazır/).getByRole("article")).toHaveCount(
    2,
  );
  await expect(
    group(page, /Gevşetilmiş kuralla hazır/).getByRole("article"),
  ).toHaveCount(1);
  await expect(group(page, /Bloklanmış/).getByRole("article")).toHaveCount(1);
  await expect(group(page, /Hazırlık durumu bilinmiyor/)).toHaveCount(0);

  const blocked = card(page, "Dalgalar");
  await expect(blocked.getByText("Bloklayan adım")).toBeVisible();
  await blocked.getByRole("button", { name: "Adım ayrıntıları" }).click();
  const failingNode = blocked
    .getByRole("list", { name: "Dalgalar adımları" })
    .getByRole("listitem")
    .filter({ hasText: E2E_BLOCKED_NODE_TITLE });
  await expect(failingNode).toContainText(
    "Kural 2 soru getiriyor, 8 gerekiyor.",
  );
  await expect(failingNode).toContainText("Yetersiz");

  // An editor without publish_content never sees a publish button.
  await expect(page.getByRole("button", { name: /yayınla/i })).toHaveCount(0);
});

test("shows the backend's live warning for a published unit", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/publishing");

  const published = card(page, "İlk ve Orta Çağlarda Türk Dünyası");
  await published.getByRole("button", { name: /hazırlığı kontrol et/ }).click();
  await published.getByRole("button", { name: "Adım ayrıntıları" }).click();

  await expect(published).toContainText(
    "Öğrenciler şu an 2 soru alıyor; 4 gerekiyor.",
  );
  // Node 1102 is both relaxed and short live: one node with a warning.
  await expect(published.locator("dl").first()).toContainText("Uyarı1");
});

test("publishes one unit after its own confirmation", async ({ page }) => {
  await signIn(page, E2E_REVIEWER_EMAIL);
  await page.goto("/publishing");
  await checkEverything(page);

  const blocked = card(page, "Dalgalar");
  await expect(
    blocked.getByRole("button", { name: "Üniteyi yayınla" }),
  ).toBeDisabled();
  await expect(blocked).toContainText("Bloklayan adımlar var");

  const ready = card(page, "Vektörler");
  await ready.getByRole("button", { name: "Üniteyi yayınla" }).click();
  await expect(
    ready.getByRole("heading", {
      name: "«Vektörler» ünitesini yayınlamak üzeresiniz",
    }),
  ).toBeFocused();

  // Escape backs out without sending anything.
  await page.keyboard.press("Escape");
  await expect(
    ready.getByRole("button", { name: "Üniteyi yayınla" }),
  ).toBeFocused();

  await ready.getByRole("button", { name: "Üniteyi yayınla" }).click();
  await ready.getByRole("button", { name: "Evet, yayınla" }).click();

  await expect(
    page.getByRole("status").filter({ hasText: "«Vektörler» yayınlandı." }),
  ).toBeVisible();
  await expect(
    group(page, /Zaten yayında/).getByRole("article", { name: "Vektörler" }),
  ).toBeVisible();
});

test("filters by readiness in the URL and fits a phone", async ({ page }) => {
  await signIn(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/publishing");
  await checkEverything(page);

  await page
    .getByRole("group", { name: "Hazırlık durumu" })
    .getByRole("button", { name: /^Bloklanmış/ })
    .click();

  await expect(page).toHaveURL(/show=blocked/);
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(card(page, "Dalgalar")).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
