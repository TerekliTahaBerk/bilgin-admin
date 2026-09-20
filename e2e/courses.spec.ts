import { expect, test, type Page } from "@playwright/test";

import {
  E2E_BASE_URL,
  E2E_COURSES,
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

test("redirects an unauthenticated visitor away from /courses", async ({
  page,
}) => {
  await page.goto("/courses");

  await expect(page).toHaveURL(/\/login$/);
});

test("reaches the courses browser from the panel navigation", async ({
  page,
}) => {
  await signIn(page);

  await page.getByRole("link", { name: "İçerik", exact: true }).first().click();

  await expect(page).toHaveURL(`${E2E_BASE_URL}/courses`);
  await expect(page.getByRole("heading", { name: "Dersler" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "İçerik", exact: true }).first(),
  ).toHaveAttribute("aria-current", "page");
});

test("renders the real backend course data", async ({ page }) => {
  await signIn(page);
  await page.goto("/courses");

  // Scope groups, in the order the backend sent them.
  const groupHeadings = page.getByRole("heading", { level: 2 });
  await expect(groupHeadings).toHaveCount(3);
  await expect(groupHeadings.nth(0)).toContainText("TYT");
  await expect(groupHeadings.nth(1)).toContainText("AYT");
  await expect(groupHeadings.nth(2)).toContainText("YDT");

  for (const course of E2E_COURSES) {
    await expect(page.getByText(course.name, { exact: true })).toBeVisible();
    await expect(page.getByText(course.code, { exact: true })).toBeVisible();
    await expect(
      page.getByText(course.status, { exact: true }).first(),
    ).toBeVisible();
  }

  // Derived from the fixture: 4 courses, 1 published, 3 units in total.
  const summary = page.locator("dl");
  await expect(summary).toContainText("4");
  await expect(summary).toContainText("ders");
  await expect(summary).toContainText("yayında");
  await expect(summary).toContainText("ünite");

  await expect(page.getByText("İçerik bekliyor")).toHaveCount(2);

  // No exercise totals: /courses does not report them.
  await expect(page.getByText(/soru/i)).toHaveCount(0);
});

test("links every course row to its real unit list route", async ({ page }) => {
  await signIn(page);
  await page.goto("/courses");
  await expect(page.getByText("TYT Türkçe")).toBeVisible();

  const hrefs = await page
    .locator("main a")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));

  // Every row links to /courses/<id>; that route exists as of Step 02.
  expect(hrefs).toHaveLength(E2E_COURSES.length);
  expect(
    hrefs.every((href) => href !== null && /^\/courses\/\d+$/.test(href)),
  ).toBe(true);
  await expect(page.locator("main button")).toHaveCount(0);

  // The link actually resolves rather than 404ing.
  await page.locator("main a").first().click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("keeps the backend token out of the browser on the courses page", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/courses");
  await expect(page.getByText("TYT Türkçe")).toBeVisible();

  const html = await page.content();
  const storage = await page.evaluate(() => ({
    local: JSON.stringify(window.localStorage),
    session: JSON.stringify(window.sessionStorage),
    cookie: document.cookie,
  }));

  expect(html).not.toContain("test-e2e-backend-token");
  expect(storage.local).not.toContain("test-e2e-backend-token");
  expect(storage.session).not.toContain("test-e2e-backend-token");
  expect(storage.cookie).not.toContain("bilgin_admin_session");
});

test("fits a phone viewport without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await signIn(page);
  await page.goto("/courses");
  await expect(page.getByText("TYT Türkçe")).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByText("Yayında").first()).toBeVisible();
  await expect(page.getByText("2 ünite")).toBeVisible();
});
