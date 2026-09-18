import { expect, test } from "@playwright/test";

import { E2E_EMAIL, E2E_PASSWORD } from "./support/fixtures";

/**
 * Regression guard for a real defect found during the M0 final E2E run: the
 * login form had no explicit method, so a submit that landed before React
 * hydrated fell back to a native GET and copied the password into the URL.
 *
 * This test deliberately does NOT wait for hydration — with JavaScript off,
 * React never runs, which is the strongest available stand-in for the
 * pre-hydration window.
 */
test.describe("native login submit without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("never places credentials in the URL", async ({ page }) => {
    await page.goto("/login");

    const form = page.locator("form");
    await expect(form).toHaveAttribute("method", "post");

    await page.getByLabel("E-posta").fill(E2E_EMAIL);
    await page.getByLabel("Şifre").fill(E2E_PASSWORD);

    const [request] = await Promise.all([
      page.waitForRequest((candidate) => candidate.url().includes("/login")),
      page.getByRole("button", { name: /giriş/i }).click(),
    ]);

    expect(request.method()).not.toBe("GET");
    expect(request.method()).toBe("POST");
    expect(request.url()).not.toContain("password");
    expect(request.url()).not.toContain(E2E_PASSWORD);
    expect(request.url()).not.toContain("email");
    expect(request.url()).not.toContain(encodeURIComponent(E2E_EMAIL));

    // The navigation result does not matter — only that nothing leaked.
    await page.waitForLoadState("load").catch(() => undefined);

    const finalUrl = new URL(page.url());
    expect(finalUrl.search).toBe("");
    for (const secret of [
      "password",
      E2E_PASSWORD,
      "email",
      E2E_EMAIL,
      encodeURIComponent(E2E_EMAIL),
    ]) {
      expect(page.url()).not.toContain(secret);
    }
  });
});
