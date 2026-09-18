import { expect, test, type Page } from "@playwright/test";

import {
  E2E_BASE_URL,
  E2E_COURSE_WITH_UNITS_ID,
  E2E_EMAIL,
  E2E_PASSWORD,
  E2E_SESSION_COOKIE,
  E2E_UNIT_WITH_EXERCISES_ID,
} from "./support/fixtures";

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

/**
 * Same defect class in the exercise editor: the editor form carried no
 * explicit method, so a native submit would have serialised the whole
 * question — stem, option texts, correctOptionId, explanation — into the URL
 * query string, breaking the M2 Step 01 acceptance "answer key URL/storage
 * exposure: 0".
 *
 * Two angles are covered, because the editor is a client component with no
 * server prefetch: with JavaScript fully off the route never reaches the form
 * markup at all, so the JS-off pass proves the route serves nothing that can
 * submit with GET, and the native-submit pass proves the rendered form itself
 * submits with POST and an empty query string.
 */
test.describe("native exercise editor submit", () => {
  const NEW_PATH = `/courses/${E2E_COURSE_WITH_UNITS_ID}/units/${E2E_UNIT_WITH_EXERCISES_ID}/exercises/new`;

  const LEAKY_KEYS = [
    "correctOptionId",
    "stem",
    "options",
    "explanation",
    "topicId",
    "difficulty",
    "scopes",
    "statement",
    "answerValue",
    "template",
    "choices",
    "blanks",
    "answerValue",
    "tolerance",
    "suffix",
    "front",
    "back",
  ];
  const STEM = "Pre hydration sizinti sorusu";
  const OPTION_TEXT = "Pre hydration sik metni";
  const EXPLANATION = "Pre hydration aciklamasi";
  const STATEMENT = "Pre hydration sizinti ifadesi";
  const FILL_BLANK_ANSWER = "Pre hydration sizinti cevabi";
  const NUMERIC_ANSWER = "13579";
  const CARD_BACK = "Pre hydration sizinti karti";

  async function signIn(page: Page) {
    await page.goto("/login");
    await page.getByLabel("E-posta").fill(E2E_EMAIL);
    await page.getByLabel("Şifre").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: /giriş/i }).click();
    await expect(page).toHaveURL(`${E2E_BASE_URL}/`);
  }

  /**
   * `allowedSearch` is the route's own non-sensitive metadata, and nothing
   * else may appear: the create route carries the editor type as a safe enum,
   * so the assertion is an exact allowlist rather than a vague "the answer
   * isn't in there".
   */
  function expectNoLeak(
    url: string,
    allowedSearch: Record<string, string> = {},
  ) {
    const parsed = new URL(url);
    expect(Object.fromEntries(parsed.searchParams)).toEqual(allowedSearch);
    expect(parsed.search).toBe(
      new URLSearchParams(allowedSearch).size === 0
        ? ""
        : `?${new URLSearchParams(allowedSearch).toString()}`,
    );

    for (const secret of [
      ...LEAKY_KEYS,
      STEM,
      OPTION_TEXT,
      EXPLANATION,
      STATEMENT,
      FILL_BLANK_ANSWER,
      NUMERIC_ANSWER,
      CARD_BACK,
    ]) {
      expect(url).not.toContain(secret);
      expect(url).not.toContain(encodeURIComponent(secret));
    }
  }

  test("serves no GET-submitting form with JavaScript disabled", async ({
    browser,
    page,
  }) => {
    await signIn(page);
    const sessionCookies = await page.context().cookies();
    expect(
      sessionCookies.some((cookie) => cookie.name === E2E_SESSION_COOKIE),
    ).toBe(true);

    const jsOff = await browser.newContext({ javaScriptEnabled: false });
    await jsOff.addCookies(sessionCookies);
    const jsOffPage = await jsOff.newPage();

    try {
      const response = await jsOffPage.goto(NEW_PATH);
      expect(response?.status()).toBe(200);

      const methods = await jsOffPage
        .locator("form")
        .evaluateAll((forms) =>
          forms.map((form) => form.getAttribute("method")),
        );
      // Today this list is empty: the editor is a client component with no
      // server prefetch, so the JS-off route stops at the loading state. The
      // assertion is the standing invariant — if this route ever does serve
      // form markup, it may never fall back to a native GET that copies
      // editor fields into the query string. The behavioural proof for the
      // rendered form lives in the next test.
      for (const method of methods) {
        expect(method).toBe("post");
      }
      expectNoLeak(jsOffPage.url());
    } finally {
      await jsOff.close();
    }
  });

  test("native submit uses POST and leaves the query string empty", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(NEW_PATH);

    await page.getByLabel("Konu").selectOption("1");
    await page.getByLabel("Soru kökü").fill(STEM);
    for (const id of ["a", "b", "c", "d"]) {
      await page.getByLabel(`${id} şıkkı metni`).fill(`${OPTION_TEXT} ${id}`);
    }
    await page.getByLabel("b şıkkını doğru cevap seç").check();
    await page.getByLabel("Açıklama").fill(EXPLANATION);

    const form = page.locator("form").filter({ has: page.locator("#stem") });
    await expect(form).toHaveAttribute("method", "post");

    const [request] = await Promise.all([
      page.waitForRequest(
        (candidate) =>
          candidate.isNavigationRequest() &&
          candidate.url().includes("/exercises"),
      ),
      // HTMLFormElement.prototype.submit bypasses the submit event entirely,
      // so React's onSubmit never runs — the same native path a browser takes
      // before hydration or with JavaScript broken.
      page.evaluate(() => {
        const target = document.querySelector("#stem")?.closest("form");
        if (target === null || target === undefined) {
          throw new Error("editor form not found");
        }
        HTMLFormElement.prototype.submit.call(target);
      }),
    ]);

    expect(request.method()).not.toBe("GET");
    expect(request.method()).toBe("POST");
    expectNoLeak(request.url());

    // The native POST is not expected to save anything; a 404/405/safe failure
    // is fine. Only the absence of a query-string leak matters.
    await page.waitForLoadState("load").catch(() => undefined);
    expectNoLeak(page.url());
  });

  test("native submit on the true/false route keeps only the safe type query", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`${NEW_PATH}?type=true_false`);

    await page.getByLabel("Konu").selectOption("1");
    await page.getByLabel("İfade").fill(STATEMENT);
    await page.getByLabel("Yanlış").check();
    await page.getByLabel("Açıklama").fill(EXPLANATION);

    const form = page
      .locator("form")
      .filter({ has: page.locator("#statement") });
    await expect(form).toHaveAttribute("method", "post");

    const [request] = await Promise.all([
      page.waitForRequest(
        (candidate) =>
          candidate.isNavigationRequest() &&
          candidate.url().includes("/exercises"),
      ),
      page.evaluate(() => {
        const target = document.querySelector("#statement")?.closest("form");
        if (target === null || target === undefined) {
          throw new Error("editor form not found");
        }
        HTMLFormElement.prototype.submit.call(target);
      }),
    ]);

    expect(request.method()).not.toBe("GET");
    expect(request.method()).toBe("POST");
    // type=true_false is routing metadata and may stay; the statement, the
    // answer and every other field may not.
    expectNoLeak(request.url(), { type: "true_false" });

    await page.waitForLoadState("load").catch(() => undefined);
    expectNoLeak(page.url(), { type: "true_false" });
  });

  test("native submit on the fill blank route keeps only the safe type query", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`${NEW_PATH}?type=fill_blank`);

    await page.getByLabel("Konu").selectOption("1");
    await page.getByLabel("Cümle şablonu").fill(`${STEM} {{0}} ${OPTION_TEXT}`);
    await page.getByLabel("Boşluk 1 · {{0}}").fill(FILL_BLANK_ANSWER);
    await page.getByLabel("Açıklama").fill(EXPLANATION);

    const form = page
      .locator("form")
      .filter({ has: page.locator("#template") });
    await expect(form).toHaveAttribute("method", "post");

    const [request] = await Promise.all([
      page.waitForRequest(
        (candidate) =>
          candidate.isNavigationRequest() &&
          candidate.url().includes("/exercises"),
      ),
      page.evaluate(() => {
        const target = document.querySelector("#template")?.closest("form");
        if (target === null || target === undefined) {
          throw new Error("editor form not found");
        }
        HTMLFormElement.prototype.submit.call(target);
      }),
    ]);

    expect(request.method()).not.toBe("GET");
    expect(request.method()).toBe("POST");
    // type=fill_blank is routing metadata and may stay; the template, the
    // choices and the answers may not.
    expectNoLeak(request.url(), { type: "fill_blank" });

    await page.waitForLoadState("load").catch(() => undefined);
    expectNoLeak(page.url(), { type: "fill_blank" });
  });

  test("native submit on the numeric route keeps only the safe type query", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`${NEW_PATH}?type=numeric_input`);

    await page.getByLabel("Konu").selectOption("1");
    await page.getByLabel("Soru kökü").fill(STEM);
    await page.getByLabel("Doğru sayı").fill(NUMERIC_ANSWER);
    await page.getByLabel("Birim / son ek (opsiyonel)").fill(OPTION_TEXT);
    await page.getByLabel("Açıklama").fill(EXPLANATION);

    const form = page
      .locator("form")
      .filter({ has: page.locator("#numeric-value") });
    await expect(form).toHaveAttribute("method", "post");

    const [request] = await Promise.all([
      page.waitForRequest(
        (candidate) =>
          candidate.isNavigationRequest() &&
          candidate.url().includes("/exercises"),
      ),
      page.evaluate(() => {
        const target = document
          .querySelector("#numeric-value")
          ?.closest("form");
        if (target === null || target === undefined) {
          throw new Error("editor form not found");
        }
        HTMLFormElement.prototype.submit.call(target);
      }),
    ]);

    expect(request.method()).toBe("POST");
    expectNoLeak(request.url(), { type: "numeric_input" });

    await page.waitForLoadState("load").catch(() => undefined);
    expectNoLeak(page.url(), { type: "numeric_input" });
  });

  test("native submit on the flashcard route keeps only the safe type query", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`${NEW_PATH}?type=flashcard`);

    await page.getByLabel("Konu").selectOption("1");
    await page.getByLabel("Ön yüz").fill(STEM);
    await page.getByLabel("Arka yüz").fill(CARD_BACK);
    await page.getByLabel("Açıklama").fill(EXPLANATION);

    const form = page
      .locator("form")
      .filter({ has: page.locator("#flashcard-front") });
    await expect(form).toHaveAttribute("method", "post");

    const [request] = await Promise.all([
      page.waitForRequest(
        (candidate) =>
          candidate.isNavigationRequest() &&
          candidate.url().includes("/exercises"),
      ),
      page.evaluate(() => {
        const target = document
          .querySelector("#flashcard-front")
          ?.closest("form");
        if (target === null || target === undefined) {
          throw new Error("editor form not found");
        }
        HTMLFormElement.prototype.submit.call(target);
      }),
    ]);

    expect(request.method()).toBe("POST");
    expectNoLeak(request.url(), { type: "flashcard" });

    await page.waitForLoadState("load").catch(() => undefined);
    expectNoLeak(page.url(), { type: "flashcard" });
  });
});
