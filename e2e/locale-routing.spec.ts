import { expect, test } from "@playwright/test";

test.describe("locale routing", () => {
  test("redirects an unprefixed path to a locale and remembers the choice", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/(zh|en|ja|ko)$/);

    const cookies = await page.context().cookies();
    expect(cookies.map((c) => c.name)).toContain("go-daily.locale");
  });

  test("honours Accept-Language when no cookie is set", async ({ browser }) => {
    const context = await browser.newContext({ locale: "ja-JP" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/ja$/);
    await context.close();
  });

  test("serves a locale-prefixed path directly, without redirecting", async ({ page }) => {
    const response = await page.goto("/en/today");
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/en/today");
  });

  test("localises the PWA manifest from the negotiated locale", async ({ request }) => {
    const ja = await request.get("/manifest.webmanifest", {
      headers: { "accept-language": "ja" },
    });
    expect(ja.ok()).toBe(true);
    expect((await ja.json()).name).toContain("囲碁");

    const en = await request.get("/manifest.webmanifest", {
      headers: { "accept-language": "en" },
    });
    expect((await en.json()).name).not.toContain("囲碁");
  });

  // A prerendered catch-all used to answer unmatched URLs with 200 and the
  // site's default <title>, which is an invitation to index every typo.
  test("answers an unmatched localized URL with a real 404", async ({ request }) => {
    const response = await request.get("/en/definitely-not-a-real-page", {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(404);
  });

  // Unknown ids and out-of-range collection params answered 200 too: they sit
  // under puzzles/loading.tsx, the same Suspense boundary problem. The list
  // page keeps its loading state via a (list) route group that the dynamic
  // children stay outside of.
  test("answers unknown puzzle ids and collection params with a real 404", async ({ request }) => {
    for (const path of [
      "/en/puzzles/p-99999",
      "/en/puzzles/not-an-id",
      "/en/puzzles/difficulty/9",
      "/en/puzzles/tags/bogus",
    ]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(404);
    }
  });

  test("keeps valid collection pages at 200", async ({ request }) => {
    for (const path of ["/en/puzzles", "/en/puzzles/difficulty/4", "/en/puzzles/tags/tesuji"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(200);
    }
  });

  // Language-neutral on purpose: resolving a locale in the not-found boundary
  // needs a dynamic API, and reading headers() there turns every statically
  // rendered page that calls notFound() dynamic at runtime, which Next rejects.
  test("titles the 404 without inheriting the site default", async ({ page }) => {
    await page.goto("/ja/definitely-not-a-real-page");
    await expect(page).toHaveTitle("404 — go-daily");
  });

  // The layout sets title.template "%s — go-daily", and every message string
  // used to carry the suffix as well, so each page rendered it twice.
  test("appends the site suffix to a page title exactly once", async ({ page }) => {
    for (const path of ["/en/today", "/en/puzzles", "/en/pricing", "/zh/today"]) {
      await page.goto(path);
      const title = await page.title();
      expect(title, path).toContain("go-daily");
      expect(title.match(/go-daily/g)?.length, path).toBe(1);
    }
  });
});
