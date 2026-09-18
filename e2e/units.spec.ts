import { expect, test, type Page } from "@playwright/test";

import {
  E2E_BASE_URL,
  E2E_COURSE_WITH_UNITS_ID,
  E2E_COURSE_WITHOUT_UNITS_ID,
  E2E_EMAIL,
  E2E_MISSING_COURSE_ID,
  E2E_PASSWORD,
  E2E_UNITS,
} from "./support/fixtures";

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

test("walks from the panel to a course's unit list", async ({ page }) => {
  await signIn(page);

  await page.getByRole("link", { name: "İçerik", exact: true }).first().click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}/courses`);

  await page.getByRole("link", { name: /TYT Türkçe/ }).click();

  await expect(page).toHaveURL(
    `${E2E_BASE_URL}/courses/${E2E_COURSE_WITH_UNITS_ID}`,
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "TYT Türkçe" }),
  ).toBeVisible();
  await expect(page.getByText("tyt_turkce")).toBeVisible();

  // The content nav item stays active on the nested route.
  await expect(
    page.getByRole("link", { name: "İçerik", exact: true }).first(),
  ).toHaveAttribute("aria-current", "page");
});

test("renders the real unit data for a course", async ({ page }) => {
  await signIn(page);
  await page.goto(`/courses/${E2E_COURSE_WITH_UNITS_ID}`);

  for (const unit of E2E_UNITS) {
    const row = page.locator("li").filter({ hasText: unit.title });

    await expect(row).toHaveCount(1);
    await expect(row).toContainText(unit.status);
    await expect(row).toContainText(unit.access);
    await expect(row).toContainText(unit.nodes);
    await expect(row).toContainText(unit.exercises);

    if (unit.grade === null) {
      await expect(row).not.toContainText("sınıf");
    } else {
      await expect(row).toContainText(unit.grade);
    }
  }

  // Derived from the fixture: 3 units, 1 published, 10 nodes, 56 exercises.
  const summary = page.locator("dl");
  await expect(summary).toContainText("3");
  await expect(summary).toContainText("ünite");
  await expect(summary).toContainText("yayında");
  await expect(summary).toContainText("56");
  await expect(summary).toContainText("soru");

  await expect(page.getByText("Soru bekliyor")).toHaveCount(1);
});

test("offers no publish, create or exercise navigation yet", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/courses/${E2E_COURSE_WITH_UNITS_ID}`);
  await expect(page.getByText("Tarih ve Zaman")).toBeVisible();

  for (const absent of [
    "Yayınla",
    "Ünite Oluştur",
    "Soruları gör",
    "Yeni Soru",
    "İçe Aktar",
  ]) {
    await expect(page.getByText(absent, { exact: false })).toHaveCount(0);
  }

  // Rows now link to their exercise list; no buttons anywhere.
  const hrefs = await page
    .locator("main a")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));

  expect(hrefs[0]).toBe("/courses");
  expect(
    hrefs
      .slice(1)
      .every((href) =>
        new RegExp(`^/courses/${E2E_COURSE_WITH_UNITS_ID}/units/\\d+$`).test(
          href ?? "",
        ),
      ),
  ).toBe(true);
  await expect(page.locator("main li button")).toHaveCount(0);
  await expect(page.locator("main button")).toHaveCount(0);
});

test("opens a unit list directly by deep link", async ({ page }) => {
  await signIn(page);

  await page.goto(`/courses/${E2E_COURSE_WITH_UNITS_ID}`);

  // Course context resolves even though the course list was never visited.
  await expect(
    page.getByRole("heading", { level: 1, name: "TYT Türkçe" }),
  ).toBeVisible();
  await expect(page.getByText("Tarih ve Zaman")).toBeVisible();
});

test("shows an empty state for a course with no units", async ({ page }) => {
  await signIn(page);
  await page.goto(`/courses/${E2E_COURSE_WITHOUT_UNITS_ID}`);

  await expect(
    page.getByText("Bu derste henüz ünite bulunmuyor."),
  ).toBeVisible();
  await expect(page.getByText("Ünite Oluştur")).toHaveCount(0);
});

test("keeps the session when a course does not exist", async ({ page }) => {
  await signIn(page);
  await page.goto(`/courses/${E2E_MISSING_COURSE_ID}`);

  await expect(
    page.getByRole("heading", { level: 1, name: "Ders bulunamadı" }),
  ).toBeVisible();
  await expect(page).toHaveURL(
    `${E2E_BASE_URL}/courses/${E2E_MISSING_COURSE_ID}`,
  );
  await expect(page.getByRole("link", { name: /derslere dön/i })).toBeVisible();
});

test("fits a phone viewport without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await signIn(page);
  await page.goto(`/courses/${E2E_COURSE_WITH_UNITS_ID}`);
  await expect(page.getByText("Tarih ve Zaman")).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByText("Premium")).toBeVisible();
  await expect(page.getByText("44 soru")).toBeVisible();
});
