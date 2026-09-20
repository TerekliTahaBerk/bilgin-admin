import { expect, test } from "@playwright/test";

import {
  E2E_ADMIN_NAME,
  E2E_ADMIN_ROLE_LABEL,
  E2E_BASE_URL,
  E2E_EMAIL,
  E2E_PASSWORD,
  E2E_SESSION_COOKIE,
  E2E_WRONG_PASSWORD,
  sealExpiredSession,
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

/**
 * Waits until React has hydrated the form. Without this the click can land on
 * server-rendered HTML and trigger a native form submission instead of the
 * client handler.
 */
async function waitForHydratedForm(page: import("@playwright/test").Page) {
  await page.waitForFunction(() => {
    const form = document.querySelector("form");

    return (
      form !== null &&
      Object.keys(form).some((key) => key.startsWith("__react"))
    );
  });
}

async function signIn(page: import("@playwright/test").Page, password: string) {
  await page.goto("/login");
  await waitForHydratedForm(page);
  await page.getByLabel("E-posta").fill(E2E_EMAIL);
  await page.getByLabel("Şifre").fill(password);
  await page.getByRole("button", { name: /giriş/i }).click();
}

test("redirects an unauthenticated visitor from the panel to the login page", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("E-posta")).toBeVisible();
});

test("signs in with valid credentials and lands on the panel shell", async ({
  page,
}) => {
  await signIn(page, E2E_PASSWORD);

  await expect(page).toHaveURL(`${E2E_BASE_URL}/`);
  await expect(page.getByRole("heading", { name: "Ana Sayfa" })).toBeVisible();
  await expect(page.getByText("Bilgin").first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Ana Sayfa", exact: true }).first(),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByText(E2E_ADMIN_NAME).first()).toBeVisible();
  await expect(page.getByText(E2E_ADMIN_ROLE_LABEL).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /çıkış/i }).first(),
  ).toBeVisible();
});

test("keeps the session across a full page reload", async ({ page }) => {
  await signIn(page, E2E_PASSWORD);
  await expect(page).toHaveURL(`${E2E_BASE_URL}/`);

  await page.reload();

  await expect(page).toHaveURL(`${E2E_BASE_URL}/`);
  await expect(page.getByRole("heading", { name: "Ana Sayfa" })).toBeVisible();
  await expect(page.getByText(E2E_ADMIN_NAME).first()).toBeVisible();
});

test("rejects a wrong password with the generic credential error", async ({
  page,
}) => {
  await signIn(page, E2E_WRONG_PASSWORD);

  await expect(page.getByText("E-posta veya şifre hatalı.")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Ana Sayfa" })).toHaveCount(0);
});

test("signs out locally and stops serving the panel afterwards", async ({
  page,
}) => {
  await signIn(page, E2E_PASSWORD);
  await expect(page).toHaveURL(`${E2E_BASE_URL}/`);

  await page.getByRole("button", { name: /çıkış/i }).first().click();

  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("refuses a junk session cookie", async ({ page, context }) => {
  await context.addCookies([
    {
      name: E2E_SESSION_COOKIE,
      value: "this-is-not-a-valid-seal",
      url: E2E_BASE_URL,
    },
  ]);

  await page.goto("/");

  await expect(page).toHaveURL(/\/login$/);
});

test("refuses a well-formed seal whose payload has expired", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: E2E_SESSION_COOKIE,
      value: await sealExpiredSession(),
      url: E2E_BASE_URL,
      // The browser still holds the cookie; the server must reject the payload.
      expires: Math.floor(Date.now() / 1000) + 3600,
    },
  ]);

  await page.goto("/");

  await expect(page).toHaveURL(/\/login$/);
});

test("exposes no backend token to the browser after signing in", async ({
  page,
  context,
}) => {
  await signIn(page, E2E_PASSWORD);
  await expect(page).toHaveURL(`${E2E_BASE_URL}/`);

  const html = await page.content();
  const storage = await page.evaluate(() => ({
    local: JSON.stringify(window.localStorage),
    session: JSON.stringify(window.sessionStorage),
    cookie: document.cookie,
  }));
  const cookies = await context.cookies();
  const sessionCookie = cookies.find((c) => c.name === E2E_SESSION_COOKIE);

  expect(html).not.toContain("test-e2e-backend-token");
  expect(storage.local).not.toContain("test-e2e-backend-token");
  expect(storage.session).not.toContain("test-e2e-backend-token");
  expect(storage.cookie).not.toContain(E2E_SESSION_COOKIE);
  expect(sessionCookie?.httpOnly).toBe(true);
  expect(sessionCookie?.value).not.toContain("test-e2e-backend-token");
});
