import { expect, test, type Page } from "@playwright/test";

import {
  E2E_BASE_URL,
  E2E_BLOCKED_NODE_TITLE,
  E2E_BLOCKED_UNIT_ID,
  E2E_EMAIL,
  E2E_PASSWORD,
  E2E_PUBLISHABLE_UNIT_ID,
  E2E_PUBLISH_COURSE_ID,
  E2E_REVIEWER_EMAIL,
} from "./support/fixtures";

const READY_PATH = `/courses/${E2E_PUBLISH_COURSE_ID}/units/${E2E_PUBLISHABLE_UNIT_ID}`;
const BLOCKED_PATH = `/courses/${E2E_PUBLISH_COURSE_ID}/units/${E2E_BLOCKED_UNIT_ID}`;

async function signIn(page: Page, email = E2E_EMAIL) {
  await page.goto("/login");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /giriş/i }).click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}/`);
}

function readinessRows(page: Page) {
  return page.getByRole("list", { name: "Ünite adımları" }).locator("li");
}

const publishButton = (page: Page) =>
  page.getByRole("button", { name: "Üniteyi yayınla" });

test("reports every step's readiness from the backend dry run", async ({
  page,
}) => {
  await signIn(page, E2E_REVIEWER_EMAIL);
  await page.goto(BLOCKED_PATH);

  await expect(readinessRows(page)).toHaveCount(2);

  const failing = readinessRows(page).filter({
    hasText: E2E_BLOCKED_NODE_TITLE,
  });

  await expect(failing).toContainText("Yetersiz");
  await expect(failing).toContainText("2 / 8");
  await expect(failing).toContainText("Kural 2 soru getiriyor, 8 gerekiyor.");
});

test("marks a step that only passed with a widened filter", async ({
  page,
}) => {
  await signIn(page, E2E_REVIEWER_EMAIL);
  await page.goto(READY_PATH);

  const relaxed = readinessRows(page).filter({ hasText: "Hızlı Tekrar" });

  await expect(relaxed).toContainText("Havuz dar");
  await expect(relaxed).toContainText("zorluk filtresi gevşetilerek");
});

test("keeps the publish button out of the DOM without publish_content", async ({
  page,
}) => {
  // The editor fixture has edit_content only: writing a question and shipping
  // it are deliberately different permissions.
  await signIn(page);
  await page.goto(READY_PATH);

  await expect(readinessRows(page).first()).toBeVisible();
  await expect(publishButton(page)).toHaveCount(0);
  await expect(page.getByText("Üniteyi yayınla")).toHaveCount(0);
});

test("offers no way past a blocked step", async ({ page }) => {
  await signIn(page, E2E_REVIEWER_EMAIL);
  await page.goto(BLOCKED_PATH);

  await expect(readinessRows(page).filter({ hasText: "Yetersiz" })).toHaveCount(
    1,
  );
  await expect(publishButton(page)).toBeDisabled();
  await expect(page.getByText(/zorla|yine de yayınla/i)).toHaveCount(0);
});

test("publishes a ready unit after an explicit confirmation", async ({
  page,
}) => {
  await signIn(page, E2E_REVIEWER_EMAIL);
  await page.goto(READY_PATH);

  await expect(publishButton(page)).toBeEnabled();
  await publishButton(page).click();

  // Nothing is sent until the consequences have been spelled out.
  await expect(
    page.getByText(/Arşivlenmiş sorular arşivde kalır/),
  ).toBeVisible();

  await page.getByRole("button", { name: "Evet, yayınla" }).click();

  await expect(page.getByText(/Ünite yayınlandı/)).toBeVisible();
  await expect(page.getByText(/3 adım yayına alındı/)).toBeVisible();

  // The unit list reflects the new status with no full page reload.
  await page.goto(`/courses/${E2E_PUBLISH_COURSE_ID}`);
  const row = page.locator("li").filter({ hasText: "Vektörler" });

  await expect(row).toContainText("Yayında");
});
