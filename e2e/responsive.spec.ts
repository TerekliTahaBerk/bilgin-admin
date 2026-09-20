import { expect, test } from "@playwright/test";

import {
  E2E_ADMIN_NAME,
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

test.beforeEach(async ({ page }) => {
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
});

test("shows a persistent sidebar and no menu button on the desktop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  await expect(page.locator("aside")).toBeVisible();
  await expect(page.getByRole("button", { name: "Menüyü aç" })).toBeHidden();
  await expect(
    page.locator("aside").getByRole("link", { name: "Ana Sayfa", exact: true }),
  ).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("swaps the sidebar for an accessible drawer on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 760 });

  await expect(page.locator("aside")).toBeHidden();

  const toggle = page.getByRole("button", { name: "Menüyü aç" });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  await toggle.click();

  const drawer = page.getByRole("dialog", { name: "Panel menüsü" });
  await expect(drawer).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(
    drawer.getByRole("link", { name: "Ana Sayfa", exact: true }),
  ).toBeVisible();
  await expect(drawer.getByText(E2E_ADMIN_NAME)).toBeVisible();
  await expect(drawer.getByRole("button", { name: /çıkış/i })).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await page.keyboard.press("Escape");

  await expect(drawer).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});
